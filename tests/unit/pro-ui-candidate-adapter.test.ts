import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { adminUi } from '@/components/pro-ui'
import {
  aheartCandidateStatus,
  createAheartAdapter,
} from '@/components/pro-ui/adapters/aheart'

const StubComponent = defineComponent({
  name: 'StubComponent',
  setup: () => () => null,
})

const createMessage = () => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
})

describe('aheart candidate adapter', () => {
  it('keeps Arco as the production adapter until aheart-ui passes gates', () => {
    expect(adminUi.name).toBe('arco')
    expect(aheartCandidateStatus.name).toBe('aheart')
    expect(aheartCandidateStatus.status).toBe('blocked')
    expect(aheartCandidateStatus.evidence.maturityMatrix).toBe(
      'docs/architecture/aheart-ui-maturity-matrix.md'
    )
  })

  it('creates an aheart adapter only through the AdminUiAdapter contract', () => {
    const message = createMessage()
    const adapter = createAheartAdapter({
      Button: StubComponent,
      Table: StubComponent,
      Form: StubComponent,
      FormItem: StubComponent,
      Input: StubComponent,
      Select: StubComponent,
      RadioGroup: StubComponent,
      Radio: StubComponent,
      Modal: StubComponent,
      Drawer: StubComponent,
      Message: message,
    })

    expect(adapter.name).toBe('aheart')
    expect(adapter.Button).toBe(StubComponent)
    expect(adapter.FormItem).toBe(StubComponent)

    adapter.Message.success('saved')
    expect(message.success).toHaveBeenCalledWith('saved')
  })
})
