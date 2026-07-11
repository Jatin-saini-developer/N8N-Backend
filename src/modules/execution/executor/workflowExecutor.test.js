/**
 * ─── Execution Engine Tests ───────────────────────────────────────────────────
 *
 * Unit tests for workflowExecutor, nodeDispatcher, and mock executors.
 * Run:  node src/modules/execution/executor/workflowExecutor.test.js
 *
 * Uses the same lightweight assertion style as graphTraversal.test.js —
 * no external test framework required.
 */

import { executeWorkflow, ExecutionStatus } from './workflowExecutor.js'
import { dispatch, getRegisteredTypes } from './nodeDispatcher.js'

let passed = 0
let failed = 0

async function assert(label, fn) {
  try {
    await fn()
    console.log(`  ✅ ${label}`)
    passed++
  } catch (err) {
    console.error(`  ❌ ${label}`)
    console.error(`     ${err.message}`)
    failed++
  }
}

// ─── Test data builders (same style as graphTraversal.test.js) ───────────────
const node = (id, type = 'github') => ({ id, type, position: { x: 0, y: 0 }, data: {} })
const edge = (source, target) => ({ id: `e-${source}-${target}`, source, target, animated: true })

const defaultContext = {
  workflowId: 'wf-test-001',
  userId: 'user-test-001',
  triggerPayload: { name: 'Test Dev', email: 'dev@test.com' },
  executionId: 'exec-test-001',
}

// ─────────────────────────────────────────────────────────────────────────────
//  NODE DISPATCHER TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── Node Dispatcher Tests ───\n')

await assert('Dispatcher selects triggerExecutor for trigger type', async () => {
  const result = await dispatch(node('t1', 'trigger'), defaultContext)
  if (result.nodeType !== 'trigger') throw new Error(`Expected trigger, got ${result.nodeType}`)
  if (result.status !== 'success') throw new Error(`Expected success, got ${result.status}`)
})

await assert('Dispatcher selects githubExecutor for github type', async () => {
  const result = await dispatch(node('g1', 'github'), defaultContext)
  if (result.nodeType !== 'github') throw new Error(`Expected github, got ${result.nodeType}`)
  if (result.status !== 'success') throw new Error(`Expected success, got ${result.status}`)
})

await assert('Dispatcher selects slackExecutor for slack type', async () => {
  const result = await dispatch(node('s1', 'slack'), defaultContext)
  if (result.nodeType !== 'slack') throw new Error(`Expected slack, got ${result.nodeType}`)
  if (result.status !== 'success') throw new Error(`Expected success, got ${result.status}`)
})

await assert('Dispatcher selects jiraExecutor for jira type', async () => {
  const result = await dispatch(node('j1', 'jira'), defaultContext)
  if (result.nodeType !== 'jira') throw new Error(`Expected jira, got ${result.nodeType}`)
  if (result.status !== 'success') throw new Error(`Expected success, got ${result.status}`)
})

await assert('Dispatcher selects notionExecutor for notion type', async () => {
  const result = await dispatch(node('n1', 'notion'), defaultContext)
  if (result.nodeType !== 'notion') throw new Error(`Expected notion, got ${result.nodeType}`)
  if (result.status !== 'success') throw new Error(`Expected success, got ${result.status}`)
})

await assert('Dispatcher throws for unknown node type', async () => {
  try {
    await dispatch(node('u1', 'unknown'), defaultContext)
    throw new Error('Expected error but none thrown')
  } catch (err) {
    if (!err.message.includes('No executor registered')) {
      throw new Error(`Wrong error message: ${err.message}`)
    }
  }
})

await assert('getRegisteredTypes returns all five types', async () => {
  const types = getRegisteredTypes()
  const expected = ['trigger', 'github', 'slack', 'jira', 'notion']
  for (const t of expected) {
    if (!types.includes(t)) throw new Error(`Missing type: ${t}`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
//  EXECUTOR RESULT FORMAT TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── Executor Result Format Tests ───\n')

await assert('Executor result contains all required fields', async () => {
  const result = await dispatch(node('f1', 'github'), defaultContext)
  const requiredFields = ['nodeId', 'nodeType', 'status', 'message', 'startedAt', 'finishedAt', 'duration']
  for (const field of requiredFields) {
    if (!(field in result)) throw new Error(`Missing field: ${field}`)
  }
})

await assert('Executor result has correct nodeId', async () => {
  const result = await dispatch(node('my-node-42', 'slack'), defaultContext)
  if (result.nodeId !== 'my-node-42') throw new Error(`Expected my-node-42, got ${result.nodeId}`)
})

await assert('Executor duration is a non-negative number', async () => {
  const result = await dispatch(node('d1', 'jira'), defaultContext)
  if (typeof result.duration !== 'number' || result.duration < 0) {
    throw new Error(`Expected non-negative number, got ${result.duration}`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
//  WORKFLOW EXECUTOR TESTS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n─── Workflow Executor Tests ───\n')

await assert('Successful execution of full pipeline (Trigger → GitHub → Slack → Jira → Notion)', async () => {
  const nodes = [
    node('1', 'trigger'),
    node('2', 'github'),
    node('3', 'slack'),
    node('4', 'jira'),
    node('5', 'notion'),
  ]
  const edges = [edge('1','2'), edge('2','3'), edge('3','4'), edge('4','5')]

  const result = await executeWorkflow({ nodes, edges, context: defaultContext })

  if (result.status !== ExecutionStatus.SUCCESS) throw new Error(`Expected success, got ${result.status}`)
  if (result.totalNodes !== 5) throw new Error(`Expected 5 total, got ${result.totalNodes}`)
  if (result.successfulNodes !== 5) throw new Error(`Expected 5 successful, got ${result.successfulNodes}`)
  if (result.failedNodes !== 0) throw new Error(`Expected 0 failed, got ${result.failedNodes}`)
  if (result.skippedNodes !== 0) throw new Error(`Expected 0 skipped, got ${result.skippedNodes}`)
  if (result.nodeResults.length !== 5) throw new Error(`Expected 5 results, got ${result.nodeResults.length}`)
})

await assert('Execution order follows graphTraversal output', async () => {
  const nodes = [
    node('1', 'trigger'),
    node('2', 'github'),
    node('3', 'slack'),
    node('4', 'jira'),
  ]
  const edges = [edge('1','2'), edge('2','3'), edge('3','4')]

  const result = await executeWorkflow({ nodes, edges, context: defaultContext })

  const executedIds = result.nodeResults.map((r) => r.nodeId)
  if (executedIds.join(',') !== '1,2,3,4') {
    throw new Error(`Expected order 1,2,3,4 but got ${executedIds}`)
  }
})

await assert('Execution order matches node types from traversal', async () => {
  const nodes = [
    node('1', 'trigger'),
    node('2', 'github'),
    node('3', 'slack'),
  ]
  const edges = [edge('1','2'), edge('2','3')]

  const result = await executeWorkflow({ nodes, edges, context: defaultContext })

  const types = result.nodeResults.map((r) => r.nodeType)
  if (types.join(',') !== 'trigger,github,slack') {
    throw new Error(`Expected trigger,github,slack but got ${types}`)
  }
})

await assert('Single trigger node workflow', async () => {
  const nodes = [node('only', 'trigger')]

  const result = await executeWorkflow({ nodes, edges: [], context: defaultContext })

  if (result.status !== ExecutionStatus.SUCCESS) throw new Error(`Expected success, got ${result.status}`)
  if (result.totalNodes !== 1) throw new Error(`Expected 1 total, got ${result.totalNodes}`)
  if (result.successfulNodes !== 1) throw new Error(`Expected 1 successful, got ${result.successfulNodes}`)
  if (result.nodeResults.length !== 1) throw new Error(`Expected 1 result, got ${result.nodeResults.length}`)
})

await assert('Empty workflow returns failed status with error', async () => {
  const result = await executeWorkflow({ nodes: [], edges: [], context: defaultContext })

  if (result.status !== ExecutionStatus.FAILED) throw new Error(`Expected failed, got ${result.status}`)
  if (!result.error) throw new Error('Expected error message for empty workflow')
  if (result.totalNodes !== 0) throw new Error(`Expected 0 total, got ${result.totalNodes}`)
})

await assert('Invalid graph (no trigger) returns failed status', async () => {
  const nodes = [node('1', 'github'), node('2', 'slack')]
  const edges = [edge('1', '2')]

  const result = await executeWorkflow({ nodes, edges, context: defaultContext })

  if (result.status !== ExecutionStatus.FAILED) throw new Error(`Expected failed, got ${result.status}`)
  if (!result.error) throw new Error('Expected error message')
})

await assert('Unknown node type stops execution with failure', async () => {
  const nodes = [
    node('1', 'trigger'),
    node('2', 'github'),
    node('3', 'unknown_service'),
    node('4', 'slack'),
  ]
  const edges = [edge('1','2'), edge('2','3'), edge('3','4')]

  const result = await executeWorkflow({ nodes, edges, context: defaultContext })

  if (result.status !== ExecutionStatus.FAILED) throw new Error(`Expected failed, got ${result.status}`)
  if (result.successfulNodes !== 2) throw new Error(`Expected 2 successful, got ${result.successfulNodes}`)
  if (result.failedNodes !== 1) throw new Error(`Expected 1 failed, got ${result.failedNodes}`)
  if (result.skippedNodes !== 1) throw new Error(`Expected 1 skipped, got ${result.skippedNodes}`)
  if (result.nodeResults.length !== 3) throw new Error(`Expected 3 results (2 success + 1 failed), got ${result.nodeResults.length}`)
})

await assert('Failed node result contains error info', async () => {
  const nodes = [
    node('1', 'trigger'),
    node('2', 'bad_type'),
  ]
  const edges = [edge('1', '2')]

  const result = await executeWorkflow({ nodes, edges, context: defaultContext })

  const failedResult = result.nodeResults.find((r) => r.status === 'failed')
  if (!failedResult) throw new Error('Expected a failed node result')
  if (!failedResult.message) throw new Error('Failed node should have an error message')
  if (failedResult.nodeId !== '2') throw new Error(`Expected failed nodeId 2, got ${failedResult.nodeId}`)
})

await assert('Execution summary has timing information', async () => {
  const nodes = [node('1', 'trigger'), node('2', 'github')]
  const edges = [edge('1', '2')]

  const result = await executeWorkflow({ nodes, edges, context: defaultContext })

  if (!result.startedAt) throw new Error('Missing startedAt')
  if (!result.finishedAt) throw new Error('Missing finishedAt')
  if (typeof result.duration !== 'number') throw new Error('Duration should be a number')
  if (result.duration < 0) throw new Error('Duration should be non-negative')
})

await assert('Sequential execution — each node finishes before the next starts', async () => {
  const nodes = [
    node('1', 'trigger'),
    node('2', 'github'),
    node('3', 'slack'),
  ]
  const edges = [edge('1','2'), edge('2','3')]

  const result = await executeWorkflow({ nodes, edges, context: defaultContext })

  // Each node's startedAt should be >= the previous node's finishedAt
  for (let i = 1; i < result.nodeResults.length; i++) {
    const prev = result.nodeResults[i - 1]
    const curr = result.nodeResults[i]
    if (curr.startedAt < prev.finishedAt) {
      throw new Error(
        `Node ${curr.nodeId} started before node ${prev.nodeId} finished — ` +
        `not sequential execution`
      )
    }
  }
})

await assert('Multiple sequential nodes — 3-node chain', async () => {
  const nodes = [
    node('a', 'trigger'),
    node('b', 'jira'),
    node('c', 'notion'),
  ]
  const edges = [edge('a','b'), edge('b','c')]

  const result = await executeWorkflow({ nodes, edges, context: defaultContext })

  if (result.status !== ExecutionStatus.SUCCESS) throw new Error(`Expected success, got ${result.status}`)
  const ids = result.nodeResults.map((r) => r.nodeId)
  if (ids.join(',') !== 'a,b,c') throw new Error(`Expected a,b,c but got ${ids}`)
})

await assert('Context is passed through to executors', async () => {
  // This test verifies context is received — the trigger executor includes workflowId in its message
  const nodes = [node('1', 'trigger')]
  const ctx = { ...defaultContext, workflowId: 'wf-context-check' }

  const result = await executeWorkflow({ nodes, edges: [], context: ctx })

  const triggerResult = result.nodeResults[0]
  if (!triggerResult.message.includes('wf-context-check')) {
    throw new Error(`Expected context workflowId in message, got: ${triggerResult.message}`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
//  RESULTS
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n─── Results: ${passed} passed, ${failed} failed ───\n`)
process.exit(failed > 0 ? 1 : 0)
