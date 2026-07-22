import axios from 'axios'
import Integration from '../../../../models/Integration.model.js'
import logger from '../../../../config/logger.js'

const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_API_VERSION = '2022-11-28'
const VALID_TEAM_ROLES = ['member', 'maintainer']

class ExecutionLog {
  constructor(executor, nodeId) {
    this.executor = executor
    this.nodeId = nodeId
    this.startedAt = new Date()
    this._entries = []
    this._apiRequests = []
    this._warnings = []
    this._failures = []
    this._push('info', 'lifecycle', `Execution started for ${executor} node ${nodeId}.`)
  }

  info(phase, message, data) {
    this._push('info', phase, message, data)
    logger.info(`[${this.executor}:${this.nodeId}] ${message}`)
  }

  warn(phase, message, data) {
    this._warnings.push(message)
    this._push('warn', phase, message, data)
    logger.warn(`[${this.executor}:${this.nodeId}] ${message}`)
  }

  error(phase, message, data) {
    this._push('error', phase, message, data)
    logger.error(`[${this.executor}:${this.nodeId}] ${message}`)
  }

  apiRequest(method, url, status, durationMs, responseData) {
    const entry = { method, url, status, durationMs, timestamp: new Date().toISOString(), responseData: responseData || null }
    this._apiRequests.push(entry)
    this._push('info', 'api', `${method} ${url} → ${status ?? 'NO_RESPONSE'} (${durationMs}ms)`, entry)
  }

  apiFailure(method, url, errorCode, errorMessage, status, durationMs) {
    const entry = { method, url, status: status ?? null, durationMs, errorCode, errorMessage, timestamp: new Date().toISOString() }
    this._apiRequests.push(entry)
    this._failures.push(entry)
    this._push('error', 'api', `${method} ${url} → FAILED [${errorCode}]: ${errorMessage}`, entry)
  }

  finalize(status, message, metadata) {
    const finishedAt = new Date()
    const duration = finishedAt - this.startedAt
    this._push(status === 'success' ? 'info' : 'error', 'lifecycle', `Execution ${status} for ${this.executor} node ${this.nodeId} in ${duration}ms.`)
    return {
      nodeId: this.nodeId,
      nodeType: this.executor,
      status,
      message,
      metadata,
      logs: {
        entries: [...this._entries],
        apiRequests: [...this._apiRequests],
        warnings: [...this._warnings],
        failures: [...this._failures],
        totalApiCalls: this._apiRequests.length,
        totalWarnings: this._warnings.length,
        totalFailures: this._failures.length,
      },
      startedAt: this.startedAt,
      finishedAt,
      duration,
    }
  }

  _push(level, phase, message, data) {
    this._entries.push({ timestamp: new Date().toISOString(), level, phase, message, ...(data !== undefined && { data }) })
  }
}

class GitHubExecutorError extends Error {
  constructor(code, message, meta = {}) {
    super(message)
    this.name = 'GitHubExecutorError'
    this.code = code
    this.meta = meta
  }
}

function buildHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  }
}

export async function execute(node, context) {
  console.log(`[EXEC-TRACE] [teamExecutor] Executing ${node?.type} node ${node?.id}`)
  const log = new ExecutionLog(node?.type ?? 'github.team', node?.id ?? 'unknown')

  try {
    if (!node || typeof node !== 'object') {
      throw new GitHubExecutorError('INVALID_NODE', 'Team executor received an invalid node object.')
    }
    if (!node.id) {
      throw new GitHubExecutorError('MISSING_NODE_ID', 'Team executor received a node without an id.')
    }
    if (!node.data || typeof node.data !== 'object') {
      throw new GitHubExecutorError('MISSING_NODE_DATA', `Node ${node.id} is missing data object.`)
    }

    if (!node.data.username && context.triggerPayload) {
      if (context.triggerPayload.githubUsername) {
        node.data.username = context.triggerPayload.githubUsername
      } else if (context.triggerPayload.email) {
        node.data.username = context.triggerPayload.email
      }
    }

    const { organization, team, username, role = 'member' } = node.data

    if (!organization || typeof organization !== 'string' || !organization.trim()) {
      throw new GitHubExecutorError('INVALID_ORGANIZATION', `Node ${node.id}: "organization" must be a non-empty string.`)
    }

    if (!team || typeof team !== 'string' || !team.trim()) {
      throw new GitHubExecutorError('INVALID_TEAM', `Node ${node.id}: "team" must be a non-empty string.`)
    }

    if (!username || typeof username !== 'string' || !username.trim()) {
      throw new GitHubExecutorError('INVALID_USERNAME', `Node ${node.id}: "username" must be a non-empty string.`)
    }

    if (role && !VALID_TEAM_ROLES.includes(role)) {
      throw new GitHubExecutorError('INVALID_ROLE', `Node ${node.id}: role must be one of [${VALID_TEAM_ROLES.join(', ')}].`)
    }

    if (!context || !context.userId || !context.workflowId) {
      throw new GitHubExecutorError('INVALID_CONTEXT', `Node ${node.id}: missing valid execution context (userId/workflowId).`)
    }

    const integration = await Integration.findOne({ userId: context.userId, provider: 'github' }).select('+accessToken')
    if (!integration || !integration.isActive || !integration.accessToken) {
      throw new GitHubExecutorError('INTEGRATION_ERROR', `GitHub integration invalid or missing for node ${node.id}.`)
    }

    const url = `${GITHUB_API_BASE}/orgs/${encodeURIComponent(organization)}/teams/${encodeURIComponent(team)}/memberships/${encodeURIComponent(username)}`
    const requestStart = Date.now()

    const response = await axios.put(
      url,
      { role: role || 'member' },
      { headers: buildHeaders(integration.accessToken) }
    )

    const durationMs = Date.now() - requestStart
    log.apiRequest('PUT', url, response.status, durationMs, { role: response.data?.role })

    return log.finalize('success', `Added user ${username} to team ${team} in organisation ${organization}.`, {
      nodeId: node.id,
      organization,
      team,
      username,
      role: role || 'member',
      connectedAs: integration.providerUsername,
    })
  } catch (error) {
    log.error('result', `Execution failed: ${error.message}`)
    const failedResult = log.finalize('failed', error.message, { nodeId: node?.id })
    throw Object.assign(error, {
      nodeId: failedResult.nodeId,
      nodeType: failedResult.nodeType,
      executorErrorCode: error.code || 'UNKNOWN',
      executionResult: failedResult,
      startedAt: failedResult.startedAt,
      finishedAt: failedResult.finishedAt,
      duration: failedResult.duration,
    })
  }
}
