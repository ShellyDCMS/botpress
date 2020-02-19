import { Button, Dialog, FormGroup, HTMLSelect, InputGroup, Label } from '@blueprintjs/core'
import { ActionDefinition, ActionServersWithActions } from 'common/typings'
import _ from 'lodash'
import React, { FC, useState } from 'react'
import { connect } from 'react-redux'

import { Action } from '../diagram/nodes_v2/ActionNode'

import { ActionParameters } from './ActionParameters'
export interface Parameter {
  key: string
  value: string
}

interface ActionDialogProps {
  action: Action
  actionServers: ActionServersWithActions[]
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  onUpdate: (action: Action) => void
}

const ActionDialog: FC<ActionDialogProps> = props => {
  const { action, actionServers, isOpen, onClose, onSave, onUpdate } = props

  const currentActionServer = action.actionServerId
    ? actionServers.find(s => s.id === action.actionServerId)
    : actionServers[0]
  const currentActionDefinition = action.name
    ? currentActionServer.actions.find(a => a.name === action.name)
    : currentActionServer.actions[0]

  return (
    <Dialog isOpen={isOpen} title="Edit Action" icon="offline" onClose={() => onClose()}>
      <div
        onMouseDown={e => {
          // TODO: check for a more elegant way to stop event propagation
          e.stopPropagation()
        }}
      >
        <Label>
          Action Server
          <HTMLSelect
            value={action.actionServerId}
            onChange={e => {
              e.preventDefault()
              const copy = _.cloneDeep(action)
              copy.actionServerId = e.currentTarget.value
              onUpdate(copy)
            }}
          >
            {actionServers.map(actionServer => (
              <option key={actionServer.id} value={actionServer.id}>
                {actionServer.id} ({actionServer.baseUrl})
              </option>
            ))}
          </HTMLSelect>
        </Label>

        <FormGroup
          helperText="This is the action that will be executed on the chosen Action Server"
          label="Action Name"
          labelFor="action-name"
          labelInfo="(required)"
        >
          <HTMLSelect
            id="action-name"
            value={currentActionDefinition.name}
            onChange={e => {
              const copy = _.cloneDeep(action)
              copy.name = e.target.value
              onUpdate(copy)
            }}
          >
            {currentActionServer.actions.map(actionDefinition => (
              <option key={actionDefinition.name} value={actionDefinition.name}>
                {actionDefinition.name}
              </option>
            ))}
          </HTMLSelect>
        </FormGroup>

        <FormGroup
          helperText="These parameters will be passed to the executed action"
          label="Action Parameters"
          labelFor="action-parameters"
        >
          <ActionParameters
            parameters={Object.entries(action.parameters).map(([key, value]) => ({ key, value }))}
            onUpdate={parameters => {
              const paramsObj = parameters.reduce((previousValue, param) => {
                previousValue[param.key] = param.value
                return previousValue
              }, {})

              onUpdate({ ...action, parameters: paramsObj })
            }}
          />
        </FormGroup>
        <Button
          onClick={() => {
            onSave()
          }}
        >
          Save
        </Button>
      </div>
    </Dialog>
  )
}

const mapStateToProps = state => ({
  actionServers: state.actionServers
})

const mapDispatchToProps = {}

export default connect(mapStateToProps, mapDispatchToProps)(ActionDialog)
