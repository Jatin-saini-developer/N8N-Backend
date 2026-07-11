/**
 * ─── Slack Executor ───────────────────────────────────────────────────────────
 *
 * Mock executor for Slack nodes.
 * In production this would call the Slack Web API to send messages, create
 * channels, invite users, etc.
 * For now it simply simulates a successful API call.
 *
 * Interface: execute(node, context) → result
 */

/**
 * Execute a Slack node (mock).
 *
 * @param {object} node    — React Flow node object
 * @param {object} context — execution context
 * @returns {Promise<object>} execution result
 */
export async function execute(node, context) {
  const startedAt = new Date()

  // Simulate Slack API latency (5–15 ms)
  await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 11) + 5))

  const finishedAt = new Date()

  return {
    nodeId: node.id,
    nodeType: node.type,
    status: 'success',
    message: `Slack action completed for node ${node.id}`,
    startedAt,
    finishedAt,
    duration: finishedAt - startedAt,
  }
}
