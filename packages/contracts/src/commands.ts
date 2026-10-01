import {
  onlyKeys,
  parseLeaveFields,
  positiveInteger,
  record,
  text,
} from './schemas'
import type { LeaveFields } from './schemas'

export interface CreateLeaveInput {
  applicationReleaseId: string
  fields: LeaveFields
  previousRequestId?: string
}

export interface UpdateLeaveInput {
  fields: LeaveFields
  expectedRevision: number
  applicationReleaseId?: string
}

export interface PublishInput {
  formDraftId: string
  workflowDraftId: string
  formRevision: number
  workflowRevision: number
  expectedRevision: number
}

export const parseCreateLeave = (input: unknown): CreateLeaveInput => {
  const body = record(input)
  onlyKeys(body, ['applicationReleaseId', 'fields', 'previousRequestId'])
  return {
    applicationReleaseId: text(
      body.applicationReleaseId,
      'applicationReleaseId',
      100
    ),
    fields: parseLeaveFields(body.fields, true),
    ...(body.previousRequestId === undefined
      ? {}
      : {
          previousRequestId: text(
            body.previousRequestId,
            'previousRequestId',
            100
          ),
        }),
  }
}

export const parseUpdateLeave = (input: unknown): UpdateLeaveInput => {
  const body = record(input)
  onlyKeys(body, ['fields', 'expectedRevision', 'applicationReleaseId'])
  return {
    fields: parseLeaveFields(body.fields, true),
    expectedRevision: positiveInteger(body.expectedRevision),
    ...(body.applicationReleaseId === undefined
      ? {}
      : {
          applicationReleaseId: text(
            body.applicationReleaseId,
            'applicationReleaseId',
            100
          ),
        }),
  }
}

export const parsePublish = (input: unknown): PublishInput => {
  const body = record(input)
  onlyKeys(body, [
    'formDraftId',
    'workflowDraftId',
    'formRevision',
    'workflowRevision',
    'expectedRevision',
  ])
  return {
    formDraftId: text(body.formDraftId, 'formDraftId', 100),
    workflowDraftId: text(body.workflowDraftId, 'workflowDraftId', 100),
    formRevision: positiveInteger(body.formRevision, 'formRevision'),
    workflowRevision: positiveInteger(
      body.workflowRevision,
      'workflowRevision'
    ),
    expectedRevision: positiveInteger(body.expectedRevision),
  }
}
