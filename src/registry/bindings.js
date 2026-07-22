import { nodeRegistry } from '../../../shared/registry/nodeRegistry.js'
import * as triggerExecutor from '../modules/execution/executors/triggerExecutor.js'
import * as inviteExecutor from '../modules/execution/executors/github/inviteExecutor.js'
import * as teamExecutor from '../modules/execution/executors/github/teamExecutor.js'
import * as repositoryAccessExecutor from '../modules/execution/executors/github/repositoryAccessExecutor.js'
import * as legacyGithubExecutor from '../modules/execution/executors/githubExecutor.js'
import * as slackExecutor from '../modules/execution/executors/slackExecutor.js'
import * as jiraExecutor from '../modules/execution/executors/jiraExecutor.js'
import * as notionExecutor from '../modules/execution/executors/notionExecutor.js'

/**
 * Legacy router for pre-existing workflows stored as type = "github".
 */
const githubLegacyAdapter = {
  execute: async (node, context) => {
    const action = node?.data?.action
    if (action === 'add_to_team') {
      return teamExecutor.execute(node, context)
    }
    if (action === 'grant_repo_access') {
      return repositoryAccessExecutor.execute(node, context)
    }
    if (action === 'invite_to_org') {
      return inviteExecutor.execute(node, context)
    }
    return legacyGithubExecutor.execute(node, context)
  },
}

// ─── Map node type -> Backend Executor ───────────────────────────────────────
const executorMap = {
  trigger: triggerExecutor,

  // Namespaced GitHub node types
  'github.invite': inviteExecutor,
  'github.team': teamExecutor,
  'github.repositoryAccess': repositoryAccessExecutor,

  // Legacy alias types
  githubInvite: inviteExecutor,
  githubTeam: teamExecutor,
  githubRepositoryAccess: repositoryAccessExecutor,
  github: githubLegacyAdapter,

  // Other provider executors
  slack: slackExecutor,
  jira: jiraExecutor,
  notion: notionExecutor,
}

export const backendBindings = Object.freeze({
  /**
   * Get the executor module bound to a specific node type.
   * @param {string} type - e.g. 'github.invite'
   * @returns {object|undefined} executor module containing execute(node, context)
   */
  getExecutor(type) {
    return executorMap[type]
  },

  /**
   * Get all registered executor keys (for nodeDispatcher and testing).
   * @returns {Array<string>}
   */
  getRegisteredTypeIds() {
    return Object.keys(executorMap)
  },

  /**
   * Get all valid node type IDs for express-validator and Mongoose schema enums.
   * Derived from shared nodeRegistry + legacy fallbacks.
   * @returns {Array<string>}
   */
  getValidSchemaTypeIds() {
    const sharedIds = nodeRegistry.getAllTypeIds()
    const allRegistered = Object.keys(executorMap)
    return Array.from(new Set([...sharedIds, ...allRegistered]))
  },

  /**
   * Validate that a runtime node object satisfies the required input schema
   * defined in the shared nodeRegistry.
   * @param {object} node - node payload
   * @returns {{ valid: boolean, errors: Array<string> }}
   */
  validateNodeInputs(node) {
    if (!node || !node.type) {
      return { valid: false, errors: ['Node object or node.type is missing'] }
    }

    const definition = nodeRegistry.get(node.type)
    if (!definition) {
      // Unknown or legacy type without shared metadata
      return { valid: true, errors: [] }
    }

    const errors = []
    const data = node.data || {}

    for (const inputSpec of definition.inputs || []) {
      if (inputSpec.required) {
        const val = data[inputSpec.key]
        if (val === undefined || val === null || val === '') {
          errors.push(`Node ${node.id} (${node.type}) missing required input "${inputSpec.key}".`)
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  },

  /**
   * Get complete backend binding descriptor for a node type.
   * @param {string} type
   * @returns {object}
   */
  getBinding(type) {
    const definition = nodeRegistry.get(type)
    const executor = this.getExecutor(type)

    return {
      type,
      definition: definition || null,
      executor: executor || null,
      runtimeMetadata: {
        provider: definition?.provider || 'unknown',
        version: definition?.version || 1,
        requiresAuth: definition?.provider === 'github',
      },
    }
  },
})

export default backendBindings
