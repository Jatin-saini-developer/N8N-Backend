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
  // [NODE-TRACE] Stage 7: log complete node received by dispatcher
  console.log(`[NODE-TRACE] [7/8 nodeDispatcher] Node received:`, JSON.stringify({ id: node.id, type: node.type, data: node.data }, null, 2))

  console.log(`[EXEC-TRACE] [nodeDispatcher] Dispatching node ${node.id} (type="${node.type}")`)
  console.log(`[EXEC-TRACE] [nodeDispatcher]   Node data keys: ${node.data ? Object.keys(node.data).join(', ') : 'NO DATA'}`)
  console.log(`[EXEC-TRACE] [nodeDispatcher]   Node data: ${JSON.stringify(node.data)}`)

  const executor = executors[node.type]

  if (!executor) {
    console.log(`[EXEC-TRACE] [nodeDispatcher]   ✘ No executor for type "${node.type}" — registered: ${Object.keys(executors).join(', ')}`)
    throw new Error(
      `No executor registered for node type "${node.type}" (node ${node.id}). ` +
      `Registered types: ${Object.keys(executors).join(', ')}`
    )
  }

  console.log(`[EXEC-TRACE] [nodeDispatcher]   ✔ Executor found for "${node.type}" — calling execute()...`)

  const startTime = Date.now()
  try {
    const result = await executor.execute(node, context)
    console.log(`[EXEC-TRACE] [nodeDispatcher]   ✔ Executor returned in ${Date.now() - startTime}ms — status=${result.status}`)
    return result
  } catch (error) {
    console.log(`[EXEC-TRACE] [nodeDispatcher]   ✘ Executor threw in ${Date.now() - startTime}ms — ${error.name}: ${error.message}`)
    console.log(`[EXEC-TRACE] [nodeDispatcher]   Error code: ${error.code || 'N/A'}`)
    if (error.meta) {
      console.log(`[EXEC-TRACE] [nodeDispatcher]   Error meta: ${JSON.stringify(error.meta)}`)
    }
    throw error
  }
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
