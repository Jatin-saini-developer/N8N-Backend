/**
 * ─── Graph Traversal Utility ──────────────────────────────────────────────────
 *
 * Converts a React Flow workflow graph (nodes[] + edges[]) into an ordered
 * execution sequence (orderedNodes[]).
 *
 * This module is PURE — no database, no Express, no API calls, no execution
 * logic. It only computes the order in which nodes should run.
 *
 * Algorithm: Iterative DFS (depth-first) starting from the Trigger node.
 *
 * Why DFS over BFS / Kahn's topological sort?
 * - The current workflow model is a linear chain (one outgoing edge per node).
 * - DFS naturally follows that chain: Trigger → A → B → C.
 * - It's simple, predictable, and trivially extensible to tree-shaped
 *   workflows (conditional branches) by switching to a stack-based approach.
 * - For future parallel branches, the traversal can be upgraded to Kahn's
 *   topological sort without changing this file's public API.
 *
 * Cycle detection:
 * - A `visited` Set tracks every node ID we've entered.
 * - Before visiting a node we check the Set; if the node is already there,
 *   we throw with the exact cycle path so the caller can surface it to the user.
 *
 * Disconnected-node detection:
 * - After traversal, we compare the visited count against the total node count.
 * - Any node not reached from the Trigger is reported as disconnected.
 */

// ─── Custom error class for workflow-graph problems ──────────────────────────
export class WorkflowGraphError extends Error {
  /**
   * @param {string} message  — human-readable description
   * @param {string} code     — machine-readable error code
   * @param {object} [details] — optional structured metadata
   */
  constructor(message, code, details = {}) {
    super(message)
    this.name = 'WorkflowGraphError'
    this.code = code
    this.details = details
  }
}

// ─── Error codes (importable by callers for programmatic checks) ─────────────
export const GraphErrorCodes = Object.freeze({
  EMPTY_WORKFLOW: 'EMPTY_WORKFLOW',
  NO_TRIGGER: 'NO_TRIGGER',
  MULTIPLE_TRIGGERS: 'MULTIPLE_TRIGGERS',
  BROKEN_EDGE: 'BROKEN_EDGE',
  DISCONNECTED_NODES: 'DISCONNECTED_NODES',
  CYCLE_DETECTED: 'CYCLE_DETECTED',
})

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Build an adjacency list keyed by source node ID.
 * Each value is an array of target node IDs (preserves multi-edge order).
 *
 * @param {Array<{id:string, source:string, target:string}>} edges
 * @returns {Map<string, string[]>}
 */
function buildAdjacencyList(edges) {
  const adj = new Map()
  for (const edge of edges) {
    if (!adj.has(edge.source)) {
      adj.set(edge.source, [])
    }
    adj.get(edge.source).push(edge.target)
  }
  return adj
}

/**
 * Build a lookup map: nodeId → node object for O(1) access.
 *
 * @param {Array<{id:string, type:string}>} nodes
 * @returns {Map<string, object>}
 */
function buildNodeMap(nodes) {
  const map = new Map()
  for (const node of nodes) {
    map.set(node.id, node)
  }
  return map
}

/**
 * Find the single Trigger node. Throws if zero or more than one exist.
 *
 * @param {Array<{id:string, type:string}>} nodes
 * @returns {object} the trigger node
 */
function findTriggerNode(nodes) {
  const triggers = nodes.filter((n) => n.type === 'trigger')

  if (triggers.length === 0) {
    throw new WorkflowGraphError(
      'Workflow has no Trigger node. Every workflow must start with exactly one Trigger.',
      GraphErrorCodes.NO_TRIGGER,
    )
  }

  if (triggers.length > 1) {
    throw new WorkflowGraphError(
      `Workflow has ${triggers.length} Trigger nodes (${triggers.map((t) => t.id).join(', ')}). Only one Trigger is allowed.`,
      GraphErrorCodes.MULTIPLE_TRIGGERS,
      { triggerIds: triggers.map((t) => t.id) },
    )
  }

  return triggers[0]
}

/**
 * Validate that every edge references nodes that actually exist.
 *
 * @param {Array<{id:string, source:string, target:string}>} edges
 * @param {Map<string, object>} nodeMap
 */
function validateEdges(edges, nodeMap) {
  for (const edge of edges) {
    if (!nodeMap.has(edge.source)) {
      throw new WorkflowGraphError(
        `Edge "${edge.id}" references source node "${edge.source}" which does not exist.`,
        GraphErrorCodes.BROKEN_EDGE,
        { edgeId: edge.id, missingNodeId: edge.source, role: 'source' },
      )
    }
    if (!nodeMap.has(edge.target)) {
      throw new WorkflowGraphError(
        `Edge "${edge.id}" references target node "${edge.target}" which does not exist.`,
        GraphErrorCodes.BROKEN_EDGE,
        { edgeId: edge.id, missingNodeId: edge.target, role: 'target' },
      )
    }
  }
}

// ─── Main traversal function ─────────────────────────────────────────────────

/**
 * Traverse the workflow graph and return nodes in execution order.
 *
 * @param {Array<{id:string, type:string, position:object, data:object}>} nodes
 *   React Flow node objects exactly as stored in WorkflowData.nodes
 * @param {Array<{id:string, source:string, target:string}>} edges
 *   React Flow edge objects exactly as stored in WorkflowData.edges
 *
 * @returns {object[]} orderedNodes — complete node objects in execution order,
 *   starting with the Trigger node.
 *
 * @throws {WorkflowGraphError} for any structural problem in the graph
 */
export function getExecutionOrder(nodes, edges) {
  // ── 1. Empty workflow guard ──────────────────────────────────────────────
  if (!nodes || nodes.length === 0) {
    throw new WorkflowGraphError(
      'Workflow is empty — it contains no nodes.',
      GraphErrorCodes.EMPTY_WORKFLOW,
    )
  }

  // ── 2. Build supporting data structures ──────────────────────────────────
  const nodeMap = buildNodeMap(nodes)
  const adjacency = buildAdjacencyList(edges)

  // ── 3. Find the unique Trigger node (validates count) ────────────────────
  const triggerNode = findTriggerNode(nodes)

  // ── 4. Validate every edge points to existing nodes ──────────────────────
  validateEdges(edges, nodeMap)

  // ── 5. Iterative DFS from the Trigger node ───────────────────────────────
  //
  // `visited` tracks every node we've added to the result so we can:
  //   a) detect cycles — if we encounter a node already in `visited`
  //   b) detect disconnected nodes — any node NOT in `visited` after traversal
  //
  // `pathStack` records the current traversal path for cycle reporting.
  //
  // We use an iterative approach (explicit stack) to avoid stack-overflow on
  // very deep workflows and to make the control flow easier to extend for
  // future branch/merge logic.

  const orderedNodes = []
  const visited = new Set()
  const pathStack = [] // node IDs on the current path (for cycle context)

  // Stack entries: each is a node ID to visit next.
  // For a linear chain this is trivially one item at a time; for future
  // branching, multiple children would be pushed.
  const stack = [triggerNode.id]

  while (stack.length > 0) {
    const currentId = stack.pop()

    // ── Cycle detection ──────────────────────────────────────────────────
    if (visited.has(currentId)) {
      // Build a readable cycle path: A → B → C → A
      const cycleStart = pathStack.indexOf(currentId)
      const cyclePath = [...pathStack.slice(cycleStart), currentId]
      throw new WorkflowGraphError(
        `Cycle detected in workflow: ${cyclePath.join(' → ')}. Workflows must be acyclic.`,
        GraphErrorCodes.CYCLE_DETECTED,
        { cycle: cyclePath },
      )
    }

    // ── Visit the node ───────────────────────────────────────────────────
    visited.add(currentId)
    pathStack.push(currentId)
    orderedNodes.push(nodeMap.get(currentId))

    // ── Enqueue children (outgoing edges) ────────────────────────────────
    const children = adjacency.get(currentId) || []

    // For a linear workflow there is 0 or 1 child.
    // For future branching: multiple children would all be pushed, and
    // a merge-aware strategy would gate on in-degree before visiting.
    // We push in reverse so the first child is processed first (DFS order).
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i])
    }
  }

  // ── 6. Disconnected-node detection ─────────────────────────────────────
  //
  // Every node in the workflow must be reachable from the Trigger.
  // If any are not, they can never execute, which is almost always a mistake.

  if (visited.size !== nodes.length) {
    const disconnected = nodes
      .filter((n) => !visited.has(n.id))
      .map((n) => `${n.id} (${n.type})`)

    throw new WorkflowGraphError(
      `${disconnected.length} node(s) are not reachable from the Trigger: ${disconnected.join(', ')}. Connect them or remove them.`,
      GraphErrorCodes.DISCONNECTED_NODES,
      { disconnectedNodes: disconnected },
    )
  }

  return orderedNodes
}
