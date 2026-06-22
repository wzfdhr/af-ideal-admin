import { mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import {
  useFormDesigner,
  useFormDesignerActions,
} from '@/components/form-designer/use-form-designer'
import { migrateFormSchema } from '@/components/form-designer/schema'

const apiMocks = vi.hoisted(() => ({
  createFormSchema: vi.fn(),
  publishFormSchema: vi.fn(),
  saveFormSchema: vi.fn(),
}))

vi.mock('@/api/form-schema', () => ({
  createFormSchema: apiMocks.createFormSchema,
  publishFormSchema: apiMocks.publishFormSchema,
  saveFormSchema: apiMocks.saveFormSchema,
}))

vi.mock('@vueuse/core', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')

  return {
    useClipboard: () => ({
      copy: vi.fn(),
      copied: vue.ref(false),
    }),
  }
})

const mountDesignerHarness = () =>
  mount(
    defineComponent({
      setup() {
        const designer = useFormDesigner()
        const actions = useFormDesignerActions(designer.ast, designer.formId)
        return {
          ...designer,
          ...actions,
        }
      },
      template: '<div />',
    })
  )

describe('useFormDesignerActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates, saves, and publishes schemas through the form schema api', async () => {
    const wrapper = mountDesignerHarness()
    const vm = wrapper.vm as unknown as {
      actionMessage: string
      ast: ReturnType<typeof migrateFormSchema>
      createDraft: (name: string) => Promise<void>
      formId: string
      publishCurrent: () => Promise<void>
      saveDraft: () => Promise<void>
    }

    apiMocks.createFormSchema.mockResolvedValueOnce({
      id: 'form-2',
      schema: migrateFormSchema({ widgetsConfig: [] }),
    })
    apiMocks.saveFormSchema.mockResolvedValueOnce({ id: 'form-2' })
    apiMocks.publishFormSchema.mockResolvedValueOnce({
      id: 'form-2',
      status: 'published',
    })

    await vm.createDraft('新建表单')
    expect(apiMocks.createFormSchema).toHaveBeenCalledWith({
      name: '新建表单',
      schema: vm.ast,
    })
    expect(vm.formId).toBe('form-2')

    await vm.saveDraft()
    expect(apiMocks.saveFormSchema).toHaveBeenCalledWith('form-2', vm.ast)

    await vm.publishCurrent()
    expect(apiMocks.publishFormSchema).toHaveBeenCalledWith('form-2', vm.ast)
    expect(vm.actionMessage).toBe('发布成功')
  })
})
