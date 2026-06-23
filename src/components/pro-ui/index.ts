import arcoAdapter from './adapters/arco'

export const adminUi = arcoAdapter

export { aheartCandidateStatus, createAheartAdapter } from './adapters/aheart'
export type {
  AheartAdapterComponents,
  AheartCandidateStatus,
} from './adapters/aheart'
export type { AdminUiAdapter, AdminUiAdapterName } from './types'
