/**
 * ─── Notion Executor ──────────────────────────────────────────────────────────
 *
 * Mock executor for Notion nodes.
 * In production this would call the Notion API to create pages, update
 * databases, add content blocks, etc.
 * For now it simply simulates a successful API call.
 *
 * Interface: execute(node, context) → result
 */

/**
 * Execute a Notion node (mock).
 *
 * @param {object} node    — React Flow node object
 * @param {object} context — execution context
 * @returns {Promise<object>} execution result
 */
export async function execute(node, context) {
  const startedAt = new Date()

  // Simulate Notion API latency (5–15 ms)
  await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 11) + 5))

  const finishedAt = new Date()

  return {
    nodeId: node.id,
    nodeType: node.type,
    status: 'success',
    message: `Notion action completed for node ${node.id}`,
    startedAt,
    finishedAt,
    duration: finishedAt - startedAt,
  }
}
