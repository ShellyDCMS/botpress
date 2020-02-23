import * as sdk from 'botpress/sdk'
import { ConfigProvider } from 'core/config/config-loader'
import Database from 'core/database'
import { EventRepository } from 'core/repositories'
import { TYPES } from 'core/types'
import { inject, injectable, tagged } from 'inversify'
import Knex from 'knex'
import _ from 'lodash'
import moment from 'moment'
import ms from 'ms'

import { SessionIdFactory } from '../dialog/session/id-factory'

type BatchEvent = sdk.IO.StoredEvent & { retry?: number }

@injectable()
export class EventCollector {
  private readonly MAX_RETRY_ATTEMPTS = 3
  private readonly BATCH_SIZE = 100
  private readonly PRUNE_INTERVAL = ms('30s')
  private readonly TABLE_NAME = 'events'
  private knex!: Knex & sdk.KnexExtension
  private intervalRef
  private currentPromise
  private lastPruneTs: number = 0

  private enabled = false
  private interval!: number
  private retentionPeriod!: number
  private batch: BatchEvent[] = []
  private ignoredTypes: string[] = []
  private ignoredProperties: string[] = []

  constructor(
    @inject(TYPES.Logger)
    @tagged('name', 'EventCollector')
    private logger: sdk.Logger,
    @inject(TYPES.EventRepository) private eventRepo: EventRepository,
    @inject(TYPES.ConfigProvider) private configProvider: ConfigProvider
  ) {}

  async initialize(database: Database) {
    const config = (await this.configProvider.getBotpressConfig()).eventCollector
    if (!config || !config.enabled) {
      return
    }

    this.knex = database.knex
    this.interval = ms(config.collectionInterval)
    this.retentionPeriod = ms(config.retentionPeriod)
    this.ignoredTypes = config.ignoredEventTypes || []
    this.ignoredProperties = config.ignoredEventProperties || []
    this.enabled = true
  }

  public async storeEvent(event: sdk.IO.OutgoingEvent | sdk.IO.IncomingEvent): Promise<void> {
    if (!this.enabled || this.ignoredTypes.includes(event.type)) {
      return
    }

    if (!event.botId || !event.channel || !event.direction) {
      throw new Error(`Can't store event missing required fields (botId, channel, direction)`)
    }

    const { id, botId, channel, threadId, target, direction } = event

    const incomingEventId = (event as sdk.IO.OutgoingEvent).incomingEventId
    const sessionId = SessionIdFactory.createIdFromEvent(event)
    const goal = (event as sdk.IO.IncomingEvent).state.session?.lastGoals?.[0]
    const goalId = goal?.active ? goal.eventId : undefined
    const success = goal?.active ? goal?.success : undefined

    // Once the goal is a success or failure, it becomes inactive
    if (goal?.success !== undefined) {
      if (goal?.success) {
        process.BOTPRESS_EVENTS.emit('core.analytics', [
          {
            botId,
            channel,
            metric: sdk.AnalyticsMetric.GoalsCompletedCount,
            method: sdk.AnalyticsMethod.IncrementDaily
          }
        ])
      } else {
        process.BOTPRESS_EVENTS.emit('core.analytics', [
          {
            botId,
            channel,
            metric: sdk.AnalyticsMetric.GoalsFailedCount,
            method: sdk.AnalyticsMethod.IncrementDaily
          }
        ])
      }
      goal.active = false
    }

    this.batch.push({
      botId,
      channel,
      threadId,
      target,
      sessionId,
      direction,
      goalId,
      success,
      incomingEventId: event.direction === 'outgoing' ? incomingEventId : id,
      event: this.knex.json.set(this.ignoredProperties ? _.omit(event, this.ignoredProperties) : event || {}),
      createdOn: this.knex.date.now()
    })
  }

  public start() {
    if (this.intervalRef || !this.enabled) {
      return
    }
    this.intervalRef = setInterval(this._runTask, this.interval)
  }

  public stop() {
    clearInterval(this.intervalRef)
    this.intervalRef = undefined
    this.logger.info('Stopped')
  }

  private _runTask = async () => {
    if (this.currentPromise || !this.batch.length) {
      return
    }

    const batchCount = this.batch.length >= this.BATCH_SIZE ? this.BATCH_SIZE : this.batch.length
    const elements = this.batch.splice(0, batchCount)

    this.currentPromise = this.knex
      .batchInsert(
        this.TABLE_NAME,
        elements.map(x => _.omit(x, 'retry')),
        this.BATCH_SIZE
      )
      .then(() => {
        if (Date.now() - this.lastPruneTs >= this.PRUNE_INTERVAL) {
          this.lastPruneTs = Date.now()
          return this.runCleanup().catch(err => {
            /* swallow errors */
          })
        }
      })
      .catch(err => {
        this.logger.attachError(err).error(`Couldn't store events to the database. Re-queuing elements`)
        const elementsToRetry = elements
          .map(x => ({ ...x, retry: x.retry ? x.retry + 1 : 1 }))
          .filter(x => x.retry < this.MAX_RETRY_ATTEMPTS)
        this.batch.push(...elementsToRetry)
      })
      .finally(() => {
        this.currentPromise = undefined
      })
  }

  private async runCleanup() {
    const expiration = moment()
      .subtract(this.retentionPeriod)
      .toDate()

    return this.eventRepo.pruneUntil(expiration)
  }
}
