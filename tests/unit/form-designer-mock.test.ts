import { describe, expect, it } from 'vitest'
import {
  createFormDesignerMockStore,
  getFormDesignerRemoteOptions,
} from '@/mock/modules/form-designer'
import { migrateFormSchema } from '@/components/form-designer/schema'

describe('form designer mock store', () => {
  it('supports schema list, detail, create, save, publish, and rollback', () => {
    const store = createFormDesignerMockStore()

    const list = store.listSchemas({ current: 1, pageSize: 10 })
    expect(list.total).toBeGreaterThan(0)

    const created = store.createSchema({
      name: '测试表单',
      schema: migrateFormSchema({ widgetsConfig: [] }),
    })
    expect(created).toMatchObject({
      name: '测试表单',
      status: 'draft',
      version: 1,
    })
    expect(store.getSchema(created.id)).toEqual(created)

    const saved = store.saveSchema(created.id, {
      schema: migrateFormSchema({
        widgetsConfig: [
          {
            type: 'input',
            uid: 'customerName',
            name: '客户名称',
            config: {
              label: '客户名称',
            },
          },
        ],
      }),
    })
    expect(saved.updatedAt).not.toBe(created.updatedAt)

    const published = store.publishSchema(created.id, saved.schema)
    expect(published.status).toBe('published')
    expect(published.version).toBe(2)

    const rolledBack = store.rollbackSchema(created.id, 1)
    expect(rolledBack.status).toBe('rolled-back')
    expect(rolledBack.version).toBe(1)
  })

  it('submits runtime values through mock storage', () => {
    const store = createFormDesignerMockStore()

    expect(
      store.submitForm('form-customer-registration', {
        customerName: 'Alice',
      })
    ).toMatchObject({
      formId: 'form-customer-registration',
      status: 'submitted',
      values: {
        customerName: 'Alice',
      },
    })
  })

  it('returns remote option scenarios for success, empty, failure, and timeout', () => {
    expect(getFormDesignerRemoteOptions('users')).toEqual([
      {
        label: '张三',
        value: 'u-1',
      },
      {
        label: '李四',
        value: 'u-2',
      },
    ])
    expect(getFormDesignerRemoteOptions('empty')).toEqual([])
    expect(() => getFormDesignerRemoteOptions('failure')).toThrow(
      '远程选项加载失败'
    )
    expect(() => getFormDesignerRemoteOptions('timeout')).toThrow(
      '远程选项加载超时'
    )
  })
})
