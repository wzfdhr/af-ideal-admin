import assert from 'node:assert/strict'
import { test } from 'node:test'
import contracts from '@af-admin/contracts'
import core from '../dist/index.js'
const node = (id, type, config = {}) => ({ id, type, name: id, config })
const edge = (source, target, extra = {}) => ({
  id: `${source}-${target}`,
  source,
  target,
  label: '',
  ...extra,
})
const timed = () => ({
  version: 4,
  nodes: [
    node('start', 'start'),
    node('wait', 'wait', { delaySeconds: 2 }),
    node('approve', 'approval', {
      approvers: ['reviewer'],
      deadlineSeconds: 3,
    }),
    node('end', 'end'),
  ],
  edges: [
    edge('start', 'wait'),
    edge('wait', 'approve'),
    edge('approve', 'end'),
  ],
})
test('v4 parses bounded waiting and approval deadlines and always requires a real approval path', () => {
  const schema = timed()
  assert.deepEqual(contracts.parseWorkflow(schema), schema)
  assert.deepEqual(core.validateExecutableWorkflow(schema), schema)
  assert.throws(
    () => core.advanceWorkflow(schema),
    (error) => error.status === 422
  )
  const missing = timed()
  missing.nodes = missing.nodes.filter((n) => n.id !== 'approve')
  missing.edges = [edge('start', 'wait'), edge('wait', 'end')]
  assert.throws(
    () => core.validateExecutableWorkflow(missing),
    (error) => error.status === 422
  )
})
test('timed configuration rejects script, implicit approval, invalid bounds and unsupported future formats without changing old v3', () => {
  for (const value of [0, -1, 1.5, '2', null, Infinity, 2592001]) {
    const schema = timed()
    schema.nodes[1].config.delaySeconds = value
    assert.throws(
      () => contracts.parseWorkflow(schema),
      (error) => error.status === 422
    )
  }
  for (const config of [
    { delaySeconds: 2, script: 'approve()' },
    { delaySeconds: 2, action: 'approve' },
    { deadlineSeconds: 2 },
    { delaySeconds: 2, approvers: ['reviewer'] },
  ]) {
    const schema = timed()
    schema.nodes[1].config = config
    assert.throws(
      () => core.validateExecutableWorkflow(schema),
      (error) => error.status === 422
    )
  }
  const future = timed()
  future.version = 5
  assert.throws(
    () => contracts.parseWorkflow(future),
    (error) => error.status === 422
  )
  const old = timed()
  old.version = 3
  assert.throws(
    () => contracts.parseWorkflow(old),
    (error) => error.status === 422
  )
  const serial = {
    version: 1,
    nodes: [
      node('start', 'start'),
      node('a', 'approval', { approvers: ['reviewer'] }),
      node('end', 'end'),
    ],
    edges: [edge('start', 'a'), edge('a', 'end')],
  }
  assert.deepEqual(core.validateExecutableWorkflow(serial), serial)
})
test('waiting branches keep their paired join and cannot bypass the real signature threshold', () => {
  const schema = {
    version: 4,
    nodes: [
      node('start', 'start'),
      node('fork', 'parallel', { joinId: 'join' }),
      node('wait', 'wait', { delaySeconds: 2 }),
      node('a', 'approval', { approvers: ['a'] }),
      node('sign', 'sign', {
        approvers: ['b', 'c'],
        voting: { mode: 'all' },
        deadlineSeconds: 3,
      }),
      node('join', 'join', { forkId: 'fork' }),
      node('end', 'end'),
    ],
    edges: [
      edge('start', 'fork'),
      edge('fork', 'wait', { channel: 'branch-1' }),
      edge('fork', 'sign', { channel: 'branch-2' }),
      edge('wait', 'a'),
      edge('a', 'join'),
      edge('sign', 'join'),
      edge('join', 'end'),
    ],
  }
  assert.deepEqual(core.validateExecutableWorkflow(schema), schema)
  assert.equal(
    core.votingThreshold(schema.nodes.find((n) => n.id === 'sign')),
    2
  )
  const crossed = structuredClone(schema)
  crossed.edges.find((e) => e.source === 'wait').target = 'sign'
  assert.throws(
    () => core.validateExecutableWorkflow(crossed),
    (error) => error.status === 422
  )
})
