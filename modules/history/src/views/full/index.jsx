import React from 'react'
import style from './style.scss'
import moment from 'moment'

import { MessagesViewer } from './message'
import { ConversationPicker } from './conversation'

export default class FullView extends React.Component {
  constructor(props) {
    super(props)

    const blob = new Blob([''], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)

    const defaultToDate = moment().startOf('day')

    const defaultFromDate = moment()
      .startOf('day')
      .subtract(30, 'days')

    this.state = {
      conversationsInfo: [],
      messageGroups: [],
      to: defaultToDate,
      from: defaultFromDate,
      currentConvHash: null,
      fileBlob: blob,
      fileURL: url
    }
  }

  convHashParamName = 'convHash'

  componentDidMount() {
    this.getConversations(this.state.from, this.state.to)
    const url = new URL(window.location.href)
    const convHash = url.searchParams.get(this.convHashParamName)
    if (convHash) {
      this.setState({ currentConvId: convHash })
      this.getMessagesOfConversation(convHash)
    }
  }

  getConversations(from, to) {
    const ceiledToDate = moment(to).add(1, 'days')

    this.props.bp.axios
      .get(`/mod/history/conversations?from=${from.unix()}&to=${ceiledToDate.unix()}`)
      .then(({ data }) => {
        this.setState({ conversationsInfo: data })
      })
  }

  onConversationSelected(convHash) {
    const url = new URL(window.location.href)
    url.searchParams.set(this.convHashParamName, convHash)
    window.history.pushState(window.history.state, '', url.toString())

    this.getMessagesOfConversation(convHash)
  }

  getMessagesOfConversation(convHash) {
    this.props.bp.axios.get(`/mod/history/messages/${convHash}`).then(({ data }) => {
      const flattenMessages = data.flatMap(d => d)

      const content = JSON.stringify(flattenMessages)
      var blob = new Blob([content], { type: 'application/json' })
      var url = window.URL.createObjectURL(blob)

      const conversationsInfoCopy = [...this.state.conversationsInfo]
      const desiredConvInfo = conversationsInfoCopy.find(c => c.id === convHash)
      if (desiredConvInfo) {
        desiredConvInfo.count = flattenMessages.length
      }

      this.setState({
        currentConvHash: convHash,
        messageGroups: data,
        fileBlob: blob,
        fileURL: url,
        conversationsInfo: conversationsInfoCopy
      })
    })
  }

  render() {
    if (!this.state.conversationsInfo) {
      return null
    }
    return (
      <div className={style['history-component']}>
        <ConversationPicker
          conversations={this.state.conversationsInfo}
          conversationChosenHandler={this.onConversationSelected.bind(this)}
          handleFromChange={day => {
            const moment_day = moment(day).startOf('day')
            this.setState({ from: moment_day })
            this.getConversations(moment_day, this.state.to)
          }}
          handleToChange={day => {
            const moment_day = moment(day).startOf('day')
            this.setState({ to: moment_day })
            this.getConversations(this.state.from, moment_day)
          }}
          defaultFrom={this.state.from.toDate()}
          defaultTo={this.state.to.toDate()}
          refresh={() => this.getConversations(this.state.from, this.state.to)}
        />
        <MessagesViewer
          convHash={this.state.currentConvHash}
          messageGroups={this.state.messageGroups}
          fileURL={this.state.fileURL}
        />
      </div>
    )
  }
}
