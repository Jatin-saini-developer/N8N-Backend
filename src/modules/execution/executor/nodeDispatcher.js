/**
 * ─── Node Dispatcher ──────────────────────────────────────────────────────────
 *
 * Maps node types to their corresponding executor modules.
 *
 * This module is a pure routing layer — it does NOT contain any execution
 * logic or business rules. It simply looks up the correct executor for a
 * given node type and delegates execution.
 *
 * To add a new node type (e.g. GitLab, Discord, Linear):
 *   1. Create the executor in ../executors/  (e.g. gitlabExecutor.js)
 *   2. Import it here
 *   3. Add one line to the `executors` map
 *
 * No changes required in workflowExecutor.js.
 */

import * as triggerExecutor from '../executors/triggerExecutor.js'
import * as githubExecutor from '../executors/githubExecutor.js'
import * as slackExecutor from '../executors/slackExecutor.js'
import * as jiraExecutor from '../executors/jiraExecutor.js'
import * as notionExecutor from '../executors/notionExecutor.js'

// ─── Executor registry ───────────────────────────────────────────────────────
// Key = node.type (as stored in React Flow / WorkflowData)
// Value = executor module exporting execute(node, context)
const executors = {
  trigger: triggerExecutor,
  github: githubExecutor,
  slack: slackExecutor,
  jira: jiraExecutor,
  notion: notionExecutor,
}

/**
 * Dispatch a single node to its executor.
 *
 * @param {object} node    — React Flow node object (must have `.type`)
 * @param {object} context — execution context passed through unchanged
 * @returns {Promise<object>} executor result
 * @throws {Error} if the node type has no registered executor
 */
export async function dispatch(node, context) {
  const executor = executors[node.type]

  if (!executor) {
    throw new Error(
      `No executor registered for node type "${node.type}" (node ${node.id}). ` +
      `Registered types: ${Object.keys(executors).join(', ')}`
    )
  }

  return executor.execute(node, context)
}

/**
 * Returns the list of currently registered node types.
 * Useful for validation and debugging.
 *
 * @returns {string[]}
 */
export function getRegisteredTypes() {
  return Object.keys(executors)
}
