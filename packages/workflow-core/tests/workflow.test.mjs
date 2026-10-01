import assert from 'node:assert/strict'
import { test } from 'node:test'
import contracts from '@af-admin/contracts'
import core from '../dist/index.js'

const { serialWorkflow } = contracts
const { validateSerialWorkflow, advanceWorkflow, assertTaskAction,
  assertWithdraw, assertRevision } = core
const graph = () => serialWorkflow('manager-1', 'manager-2', 'auditor')
const mutate = (fn) => { const value = graph(); fn(value); return value }

test('serial graph follows edges regardless of node array order', () => {
  const g = graph(); g.nodes.reverse()
  assert.equal(validateSerialWorkflow(g).nodes.length, 5)
  assert.equal(advanceWorkflow(g).approval.id, 'approval-1')
  assert.equal(advanceWorkflow(g, 'approval-1').approval.id, 'approval-2')
  assert.deepEqual(advanceWorkflow(g, 'approval-2'), { approval: null, copiedUserIds: ['auditor'], completed: true })
})
test('cycles, disconnected nodes, duplicate edges and unsupported branches cannot publish', () => {
  const cases = [
    mutate((g) => { g.edges[1].target = 'start' }),
    mutate((g) => { g.nodes.push({ id: 'orphan', type: 'copy', name: '孤立', config: { ccUsers: ['auditor'] } }) }),
    mutate((g) => { g.edges.push({ ...g.edges[0], id: 'duplicate' }) }),
    mutate((g) => { g.nodes[1].type = 'condition' }),
    mutate((g) => { g.nodes[1].type = 'parallel' }),
    mutate((g) => { g.edges.pop() }),
    mutate((g) => { g.nodes.push({ id: 'start-2', type: 'start', name: '开始', config: {} }) }),
    mutate((g) => { g.nodes[1].config.approvers = ['manager-1', 'manager-2'] }),
  ]
  for (const schema of cases) assert.throws(() => validateSerialWorkflow(schema))
})
test('approval requires permission, assigned actor, active instance and pending task', () => {
  const task = { status: 'pending', assigneeId: 'manager-1', revision: 3 }
  assert.doesNotThrow(() => assertTaskAction(task, 'running', 'manager-1', ['workflow:approve'], 'approve', 3))
  assert.throws(() => assertTaskAction(task, 'running', 'manager-2', ['workflow:approve'], 'approve', 3))
  assert.throws(() => assertTaskAction(task, 'running', 'manager-1', [], 'approve', 3))
  for (const status of ['completed', 'rejected', 'withdrawn']) {
    assert.throws(() => assertTaskAction(task, status, 'manager-1', ['workflow:approve'], 'approve', 3))
  }
  assert.throws(() => assertTaskAction({ ...task, status: 'approved' }, 'running', 'manager-1', ['workflow:approve'], 'approve', 3))
})
test('withdraw is limited to the running application owner', () => {
  assert.doesNotThrow(() => assertWithdraw('running', 'employee', 'employee'))
  assert.throws(() => assertWithdraw('running', 'employee', 'manager'))
  assert.throws(() => assertWithdraw('approved', 'employee', 'employee'))
})
test('stale revisions are explicit conflicts rather than overwrite', () => {
  assert.doesNotThrow(() => assertRevision(2, 2))
  assert.throws(() => assertRevision(3, 2), (error) => error.status === 409 && error.businessCode === 'REVISION_CONFLICT')
})
