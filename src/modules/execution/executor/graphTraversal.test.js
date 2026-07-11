/**
 * Quick smoke test for graphTraversal.js
 * Run:  node --experimental-vm-modules src/modules/execution/executor/graphTraversal.test.js
 */
import { getExecutionOrder, WorkflowGraphError, GraphErrorCodes } from './graphTraversal.js'

let passed = 0
let failed = 0

function assert(label, fn) {
  try {
    fn()
    console.log(`  ✅ ${label}`)
    passed++
  } catch (err) {
    console.error(`  ❌ ${label}`)
    console.error(`     ${err.message}`)
    failed++
  }
}

function assertThrows(label, code, fn) {
  try {
    fn()
    console.error(`  ❌ ${label} — expected error but none thrown`)
    failed++
  } catch (err) {
    if (err instanceof WorkflowGraphError && err.code === code) {
      console.log(`  ✅ ${label}`)
      passed++
    } else {
      console.error(`  ❌ ${label} — wrong error: [${err.code}] ${err.message}`)
      failed++
    }
  }
}

// ─── Test data builders ──────────────────────────────────────────────────────
const node = (id, type = 'github') => ({ id, type, position: { x: 0, y: 0 }, data: {} })
const edge = (source, target) => ({ id: `e-${source}-${target}`, source, target, animated: true })

console.log('\n─── Graph Traversal Tests ───\n')

// 1. Happy path — linear chain
assert('Linear chain: Trigger → GitHub → Slack → Jira → Notion', () => {
  const nodes = [
    node('1', 'trigger'),
    node('2', 'github'),
    node('3', 'slack'),
    node('4', 'jira'),
    node('5', 'notion'),
  ]
  const edges = [edge('1','2'), edge('2','3'), edge('3','4'), edge('4','5')]
  const result = getExecutionOrder(nodes, edges)
  const ids = result.map(n => n.id)
  if (ids.join(',') !== '1,2,3,4,5') throw new Error(`Expected 1,2,3,4,5 but got ${ids}`)
  // Verify full node objects are returned
  if (result[0].type !== 'trigger') throw new Error('Expected trigger node first')
})

// 2. Single trigger node, no edges
assert('Single trigger node with no edges', () => {
  const nodes = [node('t', 'trigger')]
  const result = getExecutionOrder(nodes, [])
  if (result.length !== 1 || result[0].id !== 't') throw new Error('Expected single node')
})

// 3. Empty workflow
assertThrows('Empty workflow throws EMPTY_WORKFLOW', GraphErrorCodes.EMPTY_WORKFLOW, () => {
  getExecutionOrder([], [])
})

// 4. No trigger
assertThrows('No trigger throws NO_TRIGGER', GraphErrorCodes.NO_TRIGGER, () => {
  getExecutionOrder([node('1', 'github')], [])
})

// 5. Multiple triggers
assertThrows('Multiple triggers throws MULTIPLE_TRIGGERS', GraphErrorCodes.MULTIPLE_TRIGGERS, () => {
  getExecutionOrder([node('1', 'trigger'), node('2', 'trigger')], [])
})

// 6. Broken edge — missing target
assertThrows('Broken edge (missing target) throws BROKEN_EDGE', GraphErrorCodes.BROKEN_EDGE, () => {
  const nodes = [node('1', 'trigger')]
  const edges = [edge('1', 'ghost')]
  getExecutionOrder(nodes, edges)
})

// 7. Broken edge — missing source
assertThrows('Broken edge (missing source) throws BROKEN_EDGE', GraphErrorCodes.BROKEN_EDGE, () => {
  const nodes = [node('1', 'trigger'), node('2', 'github')]
  const edges = [edge('ghost', '2')]
  getExecutionOrder(nodes, edges)
})

// 8. Disconnected node
assertThrows('Disconnected node throws DISCONNECTED_NODES', GraphErrorCodes.DISCONNECTED_NODES, () => {
  const nodes = [node('1', 'trigger'), node('2', 'github'), node('3', 'slack')]
  const edges = [edge('1', '2')]  // node 3 is unreachable
  getExecutionOrder(nodes, edges)
})

// 9. Cycle detection
assertThrows('Cycle (A→B→C→A) throws CYCLE_DETECTED', GraphErrorCodes.CYCLE_DETECTED, () => {
  const nodes = [node('1', 'trigger'), node('2', 'github'), node('3', 'slack')]
  const edges = [edge('1','2'), edge('2','3'), edge('3','1')]
  getExecutionOrder(nodes, edges)
})

// 10. Self-loop
assertThrows('Self-loop throws CYCLE_DETECTED', GraphErrorCodes.CYCLE_DETECTED, () => {
  const nodes = [node('1', 'trigger'), node('2', 'github')]
  const edges = [edge('1','2'), edge('2','2')]
  getExecutionOrder(nodes, edges)
})

// 11. Null / undefined nodes
assertThrows('Null nodes throws EMPTY_WORKFLOW', GraphErrorCodes.EMPTY_WORKFLOW, () => {
  getExecutionOrder(null, [])
})

console.log(`\n─── Results: ${passed} passed, ${failed} failed ───\n`)
process.exit(failed > 0 ? 1 : 0)
