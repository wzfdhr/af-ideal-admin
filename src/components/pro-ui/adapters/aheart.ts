import type { AdminUiAdapter } from '../types'

export type AheartAdapterComponents = Omit<AdminUiAdapter, 'name'>

export interface AheartCandidateStatus {
  name: 'aheart'
  status: 'blocked' | 'candidate' | 'ready'
  reason: string
  evidence: {
    maturityMatrix: string
    parityTest?: string
    mockDemo?: string
  }
}

export const aheartCandidateStatus: AheartCandidateStatus = {
  name: 'aheart',
  status: 'blocked',
  reason:
    'aheart-ui is not installed as a validated adapter and cannot replace Arco.',
  evidence: {
    maturityMatrix: 'docs/architecture/aheart-ui-maturity-matrix.md',
  },
}

export const createAheartAdapter = (
  components: AheartAdapterComponents
): AdminUiAdapter => ({
  name: 'aheart',
  ...components,
})
