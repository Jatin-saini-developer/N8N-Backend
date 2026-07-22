export class WorkflowMigrationError extends Error {
  constructor(message, meta = {}) {
    super(message)
    this.name = 'WorkflowMigrationError'
    this.meta = meta
  }
}

/**
 * Pure, side-effect-free helper function to migrate workflow node arrays.
 * Converts legacy `github` nodes with `data.action` into namespaced node types:
 *   - invite_to_org    -> github.invite
 *   - add_to_team      -> github.team
 *   - grant_repo_access -> github.repositoryAccess
 *
 * Throws WorkflowMigrationError if a legacy github node lacks data.action.
 *
 * @param {Array<object>} nodes
 * @returns {Array<object>} transformed node array
 */
export function migrateNodes(nodes) {
  if (!Array.isArray(nodes)) return []

  return nodes.map((node) => {
    if (!node || typeof node !== 'object') return node

    // Only transform legacy 'github' type nodes
    if (node.type === 'github') {
      const action = node.data?.action

      if (!action) {
        throw new WorkflowMigrationError(
          `Legacy GitHub node ${node.id} does not specify data.action to migrate.`,
          { nodeId: node.id }
        )
      }

      let newType
      if (action === 'invite_to_org') {
        newType = 'github.invite'
      } else if (action === 'add_to_team') {
        newType = 'github.team'
      } else if (action === 'grant_repo_access') {
        newType = 'github.repositoryAccess'
      } else {
        throw new WorkflowMigrationError(
          `Legacy GitHub node ${node.id} specifies unknown action "${action}".`,
          { nodeId: node.id, action }
        )
      }

      // Return shallow clone of node with new type and cleaned data
      const { action: _removedAction, ...cleanData } = node.data || {}

      return {
        ...node,
        type: newType,
        data: cleanData,
      }
    }

    return node
  })
}
