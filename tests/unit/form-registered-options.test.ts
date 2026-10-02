import { describe, it, expect, vi } from 'vitest'
import { migrateFormSchema } from '@/components/form-designer/schema'
import { loadRemoteOptions } from '@/components/form-runtime/remote-options'

const query = vi.hoisted(() => vi.fn())
vi.mock('@/api/form-data-sources', () => ({ queryFormDataSource: query }))
describe('controlled source schema and runtime', () => {
  it('preserves the v2 reference and snapshot through reopen/export, while refusing future formats', () => {
    const schema = {
      version: 2,
      formConfig: { size: 'medium', layout: 'vertical', labelAlign: 'right' },
      dataSources: [
        {
          key: 'category',
          name: '类别',
          kind: 'registered',
          registryId: 'source',
          registryRevision: 1,
          dictionaryRevision: 2,
          optionsSnapshot: [{ label: '原名称', value: '0' }],
        },
      ],
      widgetsConfig: [
        {
          uid: 'category',
          name: '类别',
          type: 'select',
          config: {
            id: 'category',
            label: '类别',
            optionsType: 'registered',
            optionsSourceKey: 'category',
            options: [],
          },
        },
      ],
    }
    const reopened = migrateFormSchema(schema)
    expect(reopened.version).toBe(2)
    expect(reopened.dataSources).toEqual(schema.dataSources)
    expect(migrateFormSchema(JSON.parse(JSON.stringify(reopened)))).toEqual(
      reopened
    )
    expect(() => migrateFormSchema({ ...schema, version: 3 })).toThrow()
  })
  it('queries the registered endpoint with authentication, intersects active values with the release and retains original labels', async () => {
    query.mockResolvedValueOnce({
      options: [
        { label: '新名称', value: 0 },
        { label: '新增加', value: 'new' },
      ],
    })
    const legacy = vi.fn()
    const options = await loadRemoteOptions({
      sourceKey: 'category',
      dataSources: [
        {
          key: 'category',
          name: '类别',
          kind: 'registered',
          registryId: 'source',
          optionsSnapshot: [
            { label: '原名称', value: '0' },
            { label: '已移除', value: 'removed' },
          ],
        },
      ],
      request: legacy,
    })
    expect(options).toEqual([{ label: '原名称', value: '0' }])
    expect(query).toHaveBeenCalledWith('source')
    expect(legacy).not.toHaveBeenCalled()
  })
  it('refuses ambiguous conversion and preserves a real provider failure', async () => {
    const dataSources = [
      {
        key: 'category',
        name: '类别',
        kind: 'registered' as const,
        registryId: 'source',
      },
    ]
    query.mockResolvedValueOnce({
      options: [
        { label: '数字', value: 1 },
        { label: '文字', value: '1' },
      ],
    })
    await expect(
      loadRemoteOptions({ sourceKey: 'category', dataSources })
    ).rejects.toThrow('重复')
    query.mockRejectedValueOnce(new Error('真实来源已停用'))
    await expect(
      loadRemoteOptions({ sourceKey: 'category', dataSources })
    ).rejects.toThrow('真实来源已停用')
  })
})
