/**
 * ─── Trigger Executor ─────────────────────────────────────────────────────────
 *
 * Mock executor for Trigger nodes.
 * In production this would validate the incoming trigger payload (webhook,
 * manual run, scheduled event, etc.) and surface it to the rest of the
 * workflow. For now it simply acknowledges the trigger and passes through.
 *
 * Interface: execute(node, context) → result
 */

/**
 * Execute a Trigger node (mock).
 *
 * @param {object} node    — React Flow node object
 * @param {object} context — execution context (workflowId, userId, etc.)
 * @returns {Promise<object>} execution result
 */
export async function execute(node, context) {
  const startedAt = new Date()

  // Simulate minimal processing delay (1–5 ms)
  await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 5) + 1))

  const finishedAt = new Date()

  return {
    nodeId: node.id,
    nodeType: node.type,
    status: 'success',
    message: `Trigger activated for workflow ${context.workflowId}`,
    startedAt,
    finishedAt,
    duration: finishedAt - startedAt,
  }
}
