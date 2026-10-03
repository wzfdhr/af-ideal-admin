import { describe, expect, it } from 'vitest'
import { useWorkflowDesigner } from '@/components/workflow-designer/use-workflow-designer'
import { migrateWorkflowSchema } from '@/components/workflow-designer/schema'
import { serialWorkflow } from '@af-admin/contracts'

describe('timed workflow authoring', () => {
  it('upgrades only timed configuration to v4 and keeps v4 when adding condition, sign and paired parallel nodes', () => {
    const { schema, addNode } = useWorkflowDesigner(
      serialWorkflow('first', 'second'),
      true
    )
    const wait = addNode('wait')
    expect(schema.value.version).toBe(4)
    expect(wait.config.delaySeconds).toBe(60)
    expect(
      migrateWorkflowSchema(schema.value).nodes.find(
        (node) => node.id === wait.id
      )?.config.delaySeconds
    ).toBe(60)
    addNode('condition')
    expect(schema.value.version).toBe(4)
    addNode('sign')
    expect(schema.value.version).toBe(4)
    addNode('parallel')
    expect(schema.value.version).toBe(4)
    expect(() =>
      migrateWorkflowSchema({ ...schema.value, version: 5 })
    ).toThrow('版本')
  })
})
