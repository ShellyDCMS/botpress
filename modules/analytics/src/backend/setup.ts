import * as sdk from 'botpress/sdk'
import _ from 'lodash'

import Database from './db'

export default async (bp: typeof sdk, db: Database, interactionsToTrack: string[]) => {
  await db.initialize()

  process.BOTPRESS_EVENTS.on('bp_core_decision_elected', ({ channel, botId, source }) => {
    if (source === 'qna') {
      db.incrementMetric(botId, channel, 'msg_sent_qna_count')
    }
  })

  process.BOTPRESS_EVENTS.on('bp_core_session_created', ({ channel, botId }) => {
    db.incrementMetric(botId, channel, 'sessions_count')
  })

  process.BOTPRESS_EVENTS.on('bp_core_enter_flow', ({ channel, botId, flowName }) => {
    db.incrementMetric(botId, channel, 'enter_flow_count', flowName)
  })

  bp.events.registerMiddleware({
    name: 'analytics.incoming',
    direction: 'incoming',
    handler: incomingMiddleware,
    order: 12, // after nlu and qna
    description: 'Tracks incoming messages for Analytics purposes'
  })

  bp.events.registerMiddleware({
    name: 'analytics.outgoing',
    direction: 'outgoing',
    handler: outgoingMiddleware,
    order: 5,
    description: 'Tracks outgoing messages for Analytics purposes'
  })

  function incomingMiddleware(event: sdk.IO.IncomingEvent, next: sdk.IO.MiddlewareNextCallback) {
    if (!_.includes(interactionsToTrack, event.type)) {
      return next()
    }

    db.incrementMetric(event.botId, event.channel, 'msg_received_count')

    // misunderstood messages
    const intentName = event?.nlu?.intent?.name
    if (intentName === 'none' || event?.nlu?.ambiguous) {
      if (!event?.state?.session?.lastMessages?.length) {
        db.incrementMetric(event.botId, event.channel, 'sessions_start_nlu_none')
      }
    }
    if (!!intentName?.length) {
      db.incrementMetric(event.botId, event.channel, 'msg_nlu_intent', event.nlu?.intent?.name)
    }

    next()
  }

  function outgoingMiddleware(event: sdk.IO.Event, next: sdk.IO.MiddlewareNextCallback) {
    if (!_.includes(interactionsToTrack, event.type)) {
      return next()
    }

    db.incrementMetric(event.botId, event.channel, 'msg_sent_count')
    next()
  }
}
