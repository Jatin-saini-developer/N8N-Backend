/**
 * ─── Jira Executor ────────────────────────────────────────────────────────────
 *
 * Mock executor for Jira nodes.
 * In production this would call the Jira REST API to create issues, assign
 * tasks, transition boards, etc.
 * For now it simply simulates a successful API call.
 *
 * Interface: execute(node, context) → result
 */

/**
 * Execute a Jira node (mock).
 *
 * @param {object} node    — React Flow node object
 * @param {object} context — execution context
 * @returns {Promise<object>} execution result
 */
export async function execute(node, context) {
  const startedAt = new Date()

  // Simulate Jira API latency (5–15 ms)
  await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 11) + 5))

  const finishedAt = new Date()

  return {
    nodeId: node.id,
    nodeType: node.type,
    status: 'success',
    message: `Jira action completed for node ${node.id}`,
    startedAt,
    finishedAt,
    duration: finishedAt - startedAt,
  }
}
