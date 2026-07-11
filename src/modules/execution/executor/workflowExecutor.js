/**
 * ─── Workflow Executor ────────────────────────────────────────────────────────
 *
 * Orchestrates the sequential execution of a workflow's nodes.
 *
 * Responsibilities:
 *   1. Accept nodes, edges, and an execution context.
 *   2. Call getExecutionOrder() to compute traversal order.
 *   3. Execute nodes ONE AT A TIME via the node dispatcher.
 *   4. Aggregate results into a single execution summary.
 *   5. Stop immediately on any executor failure.
 *
 * This module is intentionally decoupled from individual executor
 * implementations — it does not know (or care) how GitHub, Slack, or any
 * other service works. That logic lives exclusively in the executor modules.
 *
 * Design for extensibility:
 *   - Retry policies     → wrap dispatch() call
 *   - Timeout handling   → race dispatch() against a timer
 *   - Parallel branches  → upgrade the sequential loop
 *   - Conditional nodes  → check result before continuing
 *   - Delay / approval   → new executor types, no orchestrator changes
 */

import { getExecutionOrder } from './graphTraversal.js'
import { dispatch } from './nodeDispatcher.js'

// ─── Execution status constants ──────────────────────────────────────────────
export const ExecutionStatus = Object.freeze({
  SUCCESS: 'success',
  FAILED: 'failed',
})

/**
 * Execute a workflow end-to-end.
 *
 * @param {object}   params
 * @param {object[]} params.nodes   — React Flow node objects
 * @param {object[]} params.edges   — React Flow edge objects
 * @param {object}   params.context — execution context
 *   @param {string} params.context.workflowId
 *   @param {string} params.context.userId
 *   @param {object} [params.context.triggerPayload]
 *   @param {string} [params.context.executionId]
 *
 * @returns {Promise<object>} execution summary
 */
export async function executeWorkflow({ nodes, edges, context }) {
  const startedAt = new Date()
  const nodeResults = []

  try {
    // ── 1. Compute execution order via graphTraversal ──────────────────────
    const orderedNodes = getExecutionOrder(nodes, edges)

    // ── 2. Execute nodes sequentially ─────────────────────────────────────
    for (const node of orderedNodes) {
      try {
        const result = await dispatch(node, context)
        nodeResults.push(result)
      } catch (error) {
        // ── 3. On failure — record the failed node and stop ───────────────
        nodeResults.push({
          nodeId: node.id,
          nodeType: node.type,
          status: 'failed',
          message: error.message,
          error: error.stack || error.message,
          startedAt: new Date(),
          finishedAt: new Date(),
          duration: 0,
        })

        const finishedAt = new Date()

        // Remaining nodes are skipped — count them
        const executedCount = nodeResults.length
        const skippedCount = orderedNodes.length - executedCount

        return {
          status: ExecutionStatus.FAILED,
          startedAt,
          finishedAt,
          duration: finishedAt - startedAt,
          totalNodes: orderedNodes.length,
          successfulNodes: executedCount - 1, // last one failed
          failedNodes: 1,
          skippedNodes: skippedCount,
          nodeResults,
        }
      }
    }

    // ── 4. All nodes succeeded ────────────────────────────────────────────
    const finishedAt = new Date()

    return {
      status: ExecutionStatus.SUCCESS,
      startedAt,
      finishedAt,
      duration: finishedAt - startedAt,
      totalNodes: orderedNodes.length,
      successfulNodes: orderedNodes.length,
      failedNodes: 0,
      skippedNodes: 0,
      nodeResults,
    }
  } catch (error) {
    // ── 5. Graph traversal itself failed (invalid workflow) ───────────────
    const finishedAt = new Date()

    return {
      status: ExecutionStatus.FAILED,
      startedAt,
      finishedAt,
      duration: finishedAt - startedAt,
      totalNodes: 0,
      successfulNodes: 0,
      failedNodes: 0,
      skippedNodes: 0,
      nodeResults,
      error: error.message,
    }
  }
}
