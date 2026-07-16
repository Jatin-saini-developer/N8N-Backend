/**
 * ─── GitHub Executor ──────────────────────────────────────────────────────────
 *
 * Production executor for GitHub onboarding nodes.
 *
 * Execution pipeline:
 *   1. validateNodeConfig()     — ensure the node has a valid action & shape
 *   2. validateContext()        — ensure workflowId, userId, etc. are present
 *   3. validateInputs()        — ensure required per-action config fields exist
 *   4. loadIntegration()       — verify user has a connected GitHub account
 *   5. buildExecutionPlan()    — assemble a self-contained plan object
 *   6. dispatchGitHubApi()     — isolated HTTP layer (calls GitHub REST API)
 *   7. execute()               — public entry point orchestrating 1–6
 *
 * Every execution is instrumented with a structured ExecutionLog that captures
 * phase-by-phase detail suitable for display in an Execution History UI.
 *
 * Supported operations:
 *   • invite_to_org      — Invite a user to the GitHub organisation
 *   • add_to_team        — Add a user to a configured team
 *   • grant_repo_access  — Grant a user access to one or more repositories
 *
 * All internal methods are private.  Only execute(node, context) is exported.
 *
 * Interface: execute(node, context) → result
 */

import axios from 'axios'
import Integration from '../../../models/Integration.model.js'
import logger from '../../../config/logger.js'

// ─── Constants ──────────────────────────────────────────────────────────────
const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_API_VERSION = '2022-11-28'

const VALID_ORG_ROLES = ['admin', 'member']
const VALID_REPO_PERMISSIONS = ['pull', 'push', 'admin', 'maintain', 'triage']
const VALID_TEAM_ROLES = ['member', 'maintainer']

// ─── Supported GitHub actions and their required config fields ──────────────
const SUPPORTED_ACTIONS = Object.freeze({
  invite_to_org: {
    label: 'Invite user to organisation',
    requiredInputs: ['organization', 'username'],
    optionalInputs: ['role'],
  },
  add_to_team: {
    label: 'Add user to team',
    requiredInputs: ['organization', 'team', 'username'],
    optionalInputs: ['role'],
  },
  grant_repo_access: {
    label: 'Grant repository access',
    requiredInputs: ['organization', 'username', 'repositories'],
    optionalInputs: ['role'],
  },
})

// ─── Structured Execution Log ───────────────────────────────────────────────
//
// A phase-by-phase log collector designed for display in an Execution History
// UI.  This pattern is intentionally generic — future executors (Slack, Jira,
// Notion) should instantiate their own ExecutionLog with the appropriate
// `executor` name and follow the same phases.
//
// Log entry shape:
//   {
//     timestamp : ISO-8601 string
//     level     : 'info' | 'warn' | 'error'
//     phase     : 'validation' | 'integration' | 'planning' | 'api' | 'result'
//     message   : human-readable summary
//     data      : (optional) structured payload for this entry
//   }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured log collector for a single executor run.
 *
 * Usage (inside any executor):
 *   const log = new ExecutionLog('github', node.id)
 *   log.info('validation', 'Node config validated', { action })
 *   log.apiRequest('POST', url, 201, 120, responseData)
 *   log.warn('api', 'User was already a member')
 *   const result = log.finalize('success', 'All steps completed.', metadata)
 *
 * @class
 * @private
 */
class ExecutionLog {
  /**
   * @param {string} executor — executor name (e.g. 'github', 'slack')
   * @param {string} nodeId   — owning node id
   */
  constructor(executor, nodeId) {
    this.executor = executor
    this.nodeId = nodeId
    this.startedAt = new Date()

    /** @type {Array<object>} ordered log entries */
    this._entries = []

    /** @type {Array<object>} API request summaries */
    this._apiRequests = []

    /** @type {Array<string>} warning messages */
    this._warnings = []

    /** @type {Array<object>} failure records */
    this._failures = []

    // First entry — marks execution start
    this._push('info', 'lifecycle', `Execution started for ${executor} node ${nodeId}.`)
  }

  // ── Convenience level methods ─────────────────────────────────────────────

  /** @param {string} phase @param {string} message @param {object} [data] */
  info(phase, message, data) {
    this._push('info', phase, message, data)
    logger.info(`[${this.executor}:${this.nodeId}] ${message}`)
  }

  /** @param {string} phase @param {string} message @param {object} [data] */
  warn(phase, message, data) {
    this._warnings.push(message)
    this._push('warn', phase, message, data)
    logger.warn(`[${this.executor}:${this.nodeId}] ${message}`)
  }

  /** @param {string} phase @param {string} message @param {object} [data] */
  error(phase, message, data) {
    this._push('error', phase, message, data)
    logger.error(`[${this.executor}:${this.nodeId}] ${message}`)
  }

  // ── API-specific logging ──────────────────────────────────────────────────

  /**
   * Record a single API request/response pair.
   *
   * @param {string} method     — HTTP method
   * @param {string} url        — full request URL
   * @param {number|null} status — HTTP response status (null if network error)
   * @param {number} durationMs — round-trip time in milliseconds
   * @param {object} [responseData] — relevant response payload (sanitised)
   */
  apiRequest(method, url, status, durationMs, responseData) {
    const entry = {
      method,
      url,
      status,
      durationMs,
      timestamp: new Date().toISOString(),
      responseData: responseData || null,
    }

    this._apiRequests.push(entry)

    this._push('info', 'api', `${method} ${url} → ${status ?? 'NO_RESPONSE'} (${durationMs}ms)`, entry)
    logger.debug(`[${this.executor}:${this.nodeId}] API ${method} ${url} → ${status} (${durationMs}ms)`)
  }

  /**
   * Record a failed API request.
   *
   * @param {string} method
   * @param {string} url
   * @param {string} errorCode   — machine-readable code
   * @param {string} errorMessage
   * @param {number|null} status
   * @param {number} durationMs
   */
  apiFailure(method, url, errorCode, errorMessage, status, durationMs) {
    const entry = {
      method,
      url,
      status: status ?? null,
      durationMs,
      errorCode,
      errorMessage,
      timestamp: new Date().toISOString(),
    }

    this._apiRequests.push(entry)
    this._failures.push(entry)

    this._push('error', 'api', `${method} ${url} → FAILED [${errorCode}]: ${errorMessage}`, entry)
    logger.error(`[${this.executor}:${this.nodeId}] API ${method} ${url} → FAILED [${errorCode}]`)
  }

  // ── Finalisation ──────────────────────────────────────────────────────────

  /**
   * Build the final result object.  This is the canonical return shape that
   * all executors should follow.
   *
   * @param {string} status      — 'success' | 'failed'
   * @param {string} message     — human-readable summary
   * @param {object} metadata    — executor-specific metadata
   * @returns {object}
   */
  finalize(status, message, metadata) {
    const finishedAt = new Date()
    const duration = finishedAt - this.startedAt

    this._push(
      status === 'success' ? 'info' : 'error',
      'lifecycle',
      `Execution ${status} for ${this.executor} node ${this.nodeId} in ${duration}ms.`,
    )

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

  // ── Internal ──────────────────────────────────────────────────────────────

  /** @private */
  _push(level, phase, message, data) {
    this._entries.push({
      timestamp: new Date().toISOString(),
      level,
      phase,
      message,
      ...(data !== undefined && { data }),
    })
  }
}

// ─── Custom error class for executor-level failures ─────────────────────────
class GitHubExecutorError extends Error {
  /**
   * @param {string} code     — machine-readable error code
   * @param {string} message  — human-readable description
   * @param {object} [meta]   — additional context attached to the error
   */
  constructor(code, message, meta = {}) {
    super(message)
    this.name = 'GitHubExecutorError'
    this.code = code
    this.meta = meta
  }
}

// ─── 1. Validate node configuration ────────────────────────────────────────

/**
 * @param {object} node
 * @param {ExecutionLog} log
 * @throws {GitHubExecutorError}
 * @private
 */
function validateNodeConfig(node, log) {
  if (!node || typeof node !== 'object') {
    throw new GitHubExecutorError(
      'INVALID_NODE',
      'GitHub executor received an invalid node object.',
    )
  }

  if (!node.id) {
    throw new GitHubExecutorError(
      'MISSING_NODE_ID',
      'GitHub executor received a node without an id.',
    )
  }

  if (node.type !== 'github') {
    throw new GitHubExecutorError(
      'WRONG_NODE_TYPE',
      `GitHub executor cannot handle node type "${node.type}" (node ${node.id}).`,
      { nodeId: node.id, receivedType: node.type },
    )
  }

  const data = node.data
  if (!data || typeof data !== 'object') {
    throw new GitHubExecutorError(
      'MISSING_NODE_DATA',
      `Node ${node.id} is missing its "data" configuration object.`,
      { nodeId: node.id },
    )
  }

  const action = data.action
  if (!action) {
    throw new GitHubExecutorError(
      'MISSING_ACTION',
      `Node ${node.id} does not specify a GitHub action (data.action).`,
      { nodeId: node.id },
    )
  }

  if (!SUPPORTED_ACTIONS[action]) {
    throw new GitHubExecutorError(
      'UNSUPPORTED_ACTION',
      `Node ${node.id} specifies unsupported GitHub action "${action}". ` +
      `Supported actions: ${Object.keys(SUPPORTED_ACTIONS).join(', ')}.`,
      { nodeId: node.id, action, supportedActions: Object.keys(SUPPORTED_ACTIONS) },
    )
  }

  log.info('validation', `Node config validated — action="${action}".`, {
    nodeId: node.id,
    action,
  })
}

// ─── 2. Validate execution context ─────────────────────────────────────────

/**
 * @param {object} context
 * @param {string} nodeId
 * @param {ExecutionLog} log
 * @throws {GitHubExecutorError}
 * @private
 */
function validateContext(context, nodeId, log) {
  if (!context || typeof context !== 'object') {
    throw new GitHubExecutorError(
      'INVALID_CONTEXT',
      `GitHub executor received an invalid execution context for node ${nodeId}.`,
      { nodeId },
    )
  }

  if (!context.userId) {
    throw new GitHubExecutorError(
      'MISSING_USER_ID',
      `Execution context for node ${nodeId} is missing "userId". ` +
      'Cannot verify GitHub integration without a user identity.',
      { nodeId },
    )
  }

  if (!context.workflowId) {
    throw new GitHubExecutorError(
      'MISSING_WORKFLOW_ID',
      `Execution context for node ${nodeId} is missing "workflowId".`,
      { nodeId },
    )
  }

  log.info('validation', 'Execution context validated.', {
    workflowId: context.workflowId,
    userId: context.userId,
    executionId: context.executionId || null,
  })
}

// ─── 3. Validate per-action required inputs ─────────────────────────────────

/**
 * @param {object} node
 * @param {ExecutionLog} log
 * @throws {GitHubExecutorError}
 * @private
 */
function validateInputs(node, log) {
  const { action } = node.data
  const actionSpec = SUPPORTED_ACTIONS[action]

  // ── Required fields presence ─────────────────────────────────────────────
  const missingInputs = []

  for (const field of actionSpec.requiredInputs) {
    const value = node.data[field]
    if (value === undefined || value === null || value === '') {
      missingInputs.push(field)
    }
  }

  if (missingInputs.length > 0) {
    throw new GitHubExecutorError(
      'MISSING_INPUTS',
      `Node ${node.id} (action "${action}") is missing required inputs: ${missingInputs.join(', ')}.`,
      { nodeId: node.id, action, missingInputs },
    )
  }

  // ── Username format ──────────────────────────────────────────────────────
  const { username, organization, team, repositories, role } = node.data

  if (typeof username !== 'string' || username.trim().length === 0) {
    throw new GitHubExecutorError(
      'INVALID_USERNAME',
      `Node ${node.id}: "username" must be a non-empty string.`,
      { nodeId: node.id, received: username },
    )
  }

  // ── Organisation format ──────────────────────────────────────────────────
  if (typeof organization !== 'string' || organization.trim().length === 0) {
    throw new GitHubExecutorError(
      'INVALID_ORGANIZATION',
      `Node ${node.id}: "organization" must be a non-empty string.`,
      { nodeId: node.id, received: organization },
    )
  }

  // ── Team (required for add_to_team) ──────────────────────────────────────
  if (action === 'add_to_team') {
    if (typeof team !== 'string' || team.trim().length === 0) {
      throw new GitHubExecutorError(
        'INVALID_TEAM',
        `Node ${node.id}: "team" must be a non-empty string (team slug).`,
        { nodeId: node.id, received: team },
      )
    }
  }

  // ── Repositories (required for grant_repo_access) ────────────────────────
  if (action === 'grant_repo_access') {
    if (!Array.isArray(repositories) || repositories.length === 0) {
      throw new GitHubExecutorError(
        'INVALID_REPOSITORIES',
        `Node ${node.id}: "repositories" must be a non-empty array of repository names.`,
        { nodeId: node.id, received: repositories },
      )
    }

    for (const repo of repositories) {
      if (typeof repo !== 'string' || repo.trim().length === 0) {
        throw new GitHubExecutorError(
          'INVALID_REPOSITORY_ENTRY',
          `Node ${node.id}: each entry in "repositories" must be a non-empty string. ` +
          `Received: ${JSON.stringify(repo)}.`,
          { nodeId: node.id, invalidEntry: repo },
        )
      }
    }
  }

  // ── Role validation (optional, but must be valid if provided) ────────────
  if (role !== undefined && role !== null && role !== '') {
    if (action === 'invite_to_org' && !VALID_ORG_ROLES.includes(role)) {
      throw new GitHubExecutorError(
        'INVALID_ROLE',
        `Node ${node.id}: org invitation role must be one of [${VALID_ORG_ROLES.join(', ')}]. ` +
        `Received: "${role}".`,
        { nodeId: node.id, role, validRoles: VALID_ORG_ROLES },
      )
    }

    if (action === 'add_to_team' && !VALID_TEAM_ROLES.includes(role)) {
      throw new GitHubExecutorError(
        'INVALID_ROLE',
        `Node ${node.id}: team membership role must be one of [${VALID_TEAM_ROLES.join(', ')}]. ` +
        `Received: "${role}".`,
        { nodeId: node.id, role, validRoles: VALID_TEAM_ROLES },
      )
    }

    if (action === 'grant_repo_access' && !VALID_REPO_PERMISSIONS.includes(role)) {
      throw new GitHubExecutorError(
        'INVALID_ROLE',
        `Node ${node.id}: repository permission must be one of [${VALID_REPO_PERMISSIONS.join(', ')}]. ` +
        `Received: "${role}".`,
        { nodeId: node.id, role, validRoles: VALID_REPO_PERMISSIONS },
      )
    }
  }

  log.info('validation', 'All inputs validated.', {
    username,
    organization,
    team: team || null,
    repositories: repositories || [],
    role: role || '(default)',
  })
}

// ─── 4. Load & verify the GitHub integration ────────────────────────────────

/**
 * @param {string} userId
 * @param {string} nodeId
 * @param {ExecutionLog} log
 * @returns {Promise<object>}
 * @throws {GitHubExecutorError}
 * @private
 */
async function loadIntegration(userId, nodeId, log) {
  log.info('integration', 'Loading GitHub integration from database…')

  let integration

  try {
    integration = await Integration.findOne({
      userId,
      provider: 'github',
    }).select('+accessToken')
  } catch (dbError) {
    log.error('integration', `Database lookup failed: ${dbError.message}`)
    throw new GitHubExecutorError(
      'INTEGRATION_LOOKUP_FAILED',
      `Failed to verify GitHub integration for node ${nodeId}. ` +
      'A database error occurred while loading the integration.',
      { nodeId, userId, originalError: dbError.message },
    )
  }

  if (!integration) {
    throw new GitHubExecutorError(
      'INTEGRATION_NOT_CONNECTED',
      `Node ${nodeId} requires a connected GitHub account, but no GitHub ` +
      'integration was found for this user. ' +
      'Please connect GitHub in Settings → Integrations.',
      { nodeId, userId },
    )
  }

  if (!integration.isActive) {
    throw new GitHubExecutorError(
      'INTEGRATION_DISABLED',
      `Node ${nodeId} requires an active GitHub integration, but the ` +
      'integration has been disabled. ' +
      'Please re-enable or reconnect GitHub in Settings → Integrations.',
      { nodeId, userId, integrationId: integration._id },
    )
  }

  if (!integration.accessToken) {
    throw new GitHubExecutorError(
      'INTEGRATION_MISSING_TOKEN',
      `GitHub integration for node ${nodeId} exists and is active, but its ` +
      'access token is missing or empty. ' +
      'Please reconnect GitHub in Settings → Integrations.',
      { nodeId, userId, integrationId: integration._id },
    )
  }

  log.info('integration', `GitHub integration loaded — connected as @${integration.providerUsername}.`, {
    providerUsername: integration.providerUsername,
    providerAccountId: integration.providerAccountId,
    integrationId: integration._id,
  })

  return integration
}

// ─── 5. Build execution plan ────────────────────────────────────────────────

/**
 * @param {object} node
 * @param {object} context
 * @param {object} integration
 * @param {ExecutionLog} log
 * @returns {object}
 * @private
 */
function buildExecutionPlan(node, context, integration, log) {
  const { action, organization, username, team, repositories, role } = node.data
  const actionSpec = SUPPORTED_ACTIONS[action]

  const plan = {
    nodeId: node.id,
    action,
    actionLabel: actionSpec.label,
    organization,
    username,
    team: team || null,
    repositories: repositories || [],
    role: role || null,
    auth: {
      accessToken: integration.accessToken,
      providerUsername: integration.providerUsername,
    },
    context: {
      workflowId: context.workflowId,
      userId: context.userId,
      executionId: context.executionId || null,
    },
  }

  log.info('planning', `Execution plan built — "${actionSpec.label}".`, {
    action,
    organization,
    username,
    team: plan.team,
    repositories: plan.repositories,
    role: plan.role,
    connectedAs: integration.providerUsername,
  })

  return plan
}

// ─── 6. Isolated HTTP layer — GitHub REST API ───────────────────────────────

/**
 * Build default headers for GitHub REST API requests.
 * @private
 */
function buildHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  }
}

/**
 * Translate an Axios error into a GitHubExecutorError.
 * @private
 */
function handleApiError(error, operation, nodeId) {
  if (!error.response) {
    return new GitHubExecutorError(
      'GITHUB_NETWORK_ERROR',
      `GitHub API request failed for "${operation}" (node ${nodeId}): ` +
      `${error.message}. Check network connectivity.`,
      { nodeId, operation, originalError: error.message },
    )
  }

  const { status, data, headers } = error.response
  const ghMessage = data?.message || 'No message from GitHub'

  if (status === 403 && (headers['retry-after'] || /rate limit/i.test(ghMessage))) {
    const retryAfter = headers['retry-after']
      ? parseInt(headers['retry-after'], 10)
      : null

    return new GitHubExecutorError(
      'GITHUB_RATE_LIMITED',
      `GitHub API rate limit exceeded for "${operation}" (node ${nodeId}). ` +
      (retryAfter ? `Retry after ${retryAfter} seconds.` : 'Please wait before retrying.'),
      { nodeId, operation, status, retryAfter, ghMessage },
    )
  }

  const statusMap = {
    401: {
      code: 'GITHUB_UNAUTHORIZED',
      msg: `GitHub authentication failed for "${operation}" (node ${nodeId}). ` +
           'The access token may have been revoked. Please reconnect GitHub.',
    },
    403: {
      code: 'GITHUB_FORBIDDEN',
      msg: `GitHub denied access for "${operation}" (node ${nodeId}). ` +
           `Ensure the token has the required scopes. GitHub says: "${ghMessage}".`,
    },
    404: {
      code: 'GITHUB_NOT_FOUND',
      msg: `GitHub resource not found for "${operation}" (node ${nodeId}). ` +
           `Verify organisation, team, repo, or username exists. GitHub says: "${ghMessage}".`,
    },
    409: {
      code: 'GITHUB_CONFLICT',
      msg: `GitHub conflict for "${operation}" (node ${nodeId}). ` +
           `The resource may already exist or the user is already a member. GitHub says: "${ghMessage}".`,
    },
    422: {
      code: 'GITHUB_VALIDATION_FAILED',
      msg: `GitHub rejected the request for "${operation}" (node ${nodeId}). ` +
           `The input data is invalid. GitHub says: "${ghMessage}".`,
    },
  }

  const mapped = statusMap[status]
  if (mapped) {
    return new GitHubExecutorError(
      mapped.code,
      mapped.msg,
      { nodeId, operation, status, ghMessage, errors: data?.errors },
    )
  }

  return new GitHubExecutorError(
    'GITHUB_API_ERROR',
    `GitHub API returned HTTP ${status} for "${operation}" (node ${nodeId}). ` +
    `GitHub says: "${ghMessage}".`,
    { nodeId, operation, status, ghMessage },
  )
}

/**
 * Invite a user to a GitHub organisation.
 * @private
 */
async function apiInviteToOrg(plan, log) {
  const { organization, username, role, auth, nodeId } = plan
  const url = `${GITHUB_API_BASE}/orgs/${encodeURIComponent(organization)}/invitations`
  const operationLabel = `invite_to_org(${username} → ${organization})`

  log.info('api', `Sending organisation invitation: ${username} → ${organization}`, {
    method: 'POST',
    url,
    role: role || 'member',
  })

  const requestStart = Date.now()

  try {
    const response = await axios.post(
      url,
      {
        invitee_id: undefined,
        login: username,
        role: role || 'member',
      },
      { headers: buildHeaders(auth.accessToken) },
    )

    const durationMs = Date.now() - requestStart

    log.apiRequest('POST', url, response.status, durationMs, {
      invitationId: response.data.id,
      login: response.data.login,
      role: response.data.role,
    })

    return {
      operation: 'invite_to_org',
      githubStatus: response.status,
      invitation: {
        id: response.data.id,
        login: response.data.login,
        role: response.data.role,
        createdAt: response.data.created_at,
      },
    }
  } catch (error) {
    const durationMs = Date.now() - requestStart
    const mapped = handleApiError(error, operationLabel, nodeId)

    log.apiFailure('POST', url, mapped.code, mapped.message, error.response?.status ?? null, durationMs)
    throw mapped
  }
}

/**
 * Add a user to a GitHub team.
 * @private
 */
async function apiAddToTeam(plan, log) {
  const { organization, team, username, role, auth, nodeId } = plan
  const url = `${GITHUB_API_BASE}/orgs/${encodeURIComponent(organization)}/teams/${encodeURIComponent(team)}/memberships/${encodeURIComponent(username)}`
  const operationLabel = `add_to_team(${username} → ${organization}/${team})`

  log.info('api', `Adding user to team: ${username} → ${organization}/${team}`, {
    method: 'PUT',
    url,
    role: role || 'member',
  })

  const requestStart = Date.now()

  try {
    const response = await axios.put(
      url,
      { role: role || 'member' },
      { headers: buildHeaders(auth.accessToken) },
    )

    const durationMs = Date.now() - requestStart

    log.apiRequest('PUT', url, response.status, durationMs, {
      role: response.data.role,
      state: response.data.state,
    })

    return {
      operation: 'add_to_team',
      githubStatus: response.status,
      membership: {
        url: response.data.url,
        role: response.data.role,
        state: response.data.state,
      },
    }
  } catch (error) {
    const durationMs = Date.now() - requestStart
    const mapped = handleApiError(error, operationLabel, nodeId)

    log.apiFailure('PUT', url, mapped.code, mapped.message, error.response?.status ?? null, durationMs)
    throw mapped
  }
}

/**
 * Grant a user access to one or more repositories.
 * @private
 */
async function apiGrantRepoAccess(plan, log) {
  const { organization, repositories, username, role, auth, nodeId } = plan
  const permission = role || 'push'
  const results = []
  let allSucceeded = true

  log.info('api', `Granting repository access to ${username} for ${repositories.length} repo(s).`, {
    repositories,
    permission,
  })

  for (const repo of repositories) {
    const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(organization)}/${encodeURIComponent(repo)}/collaborators/${encodeURIComponent(username)}`
    const operationLabel = `grant_repo_access(${username} → ${organization}/${repo})`
    const requestStart = Date.now()

    try {
      const response = await axios.put(
        url,
        { permission },
        { headers: buildHeaders(auth.accessToken) },
      )

      const durationMs = Date.now() - requestStart
      const invited = response.status === 201

      log.apiRequest('PUT', url, response.status, durationMs, {
        repo,
        invited,
      })

      if (response.status === 204) {
        log.warn('api', `User ${username} is already a collaborator on ${organization}/${repo}.`, {
          repo,
          githubStatus: 204,
        })
      }

      results.push({
        repo,
        status: 'success',
        githubStatus: response.status,
        invited,
      })
    } catch (error) {
      allSucceeded = false
      const durationMs = Date.now() - requestStart
      const mapped = handleApiError(error, operationLabel, nodeId)

      log.apiFailure('PUT', url, mapped.code, mapped.message, error.response?.status ?? null, durationMs)

      results.push({
        repo,
        status: 'failed',
        errorCode: mapped.code,
        message: mapped.message,
      })
    }
  }

  if (!allSucceeded) {
    const failedRepos = results.filter((r) => r.status === 'failed')
    throw new GitHubExecutorError(
      'GITHUB_PARTIAL_FAILURE',
      `Node ${nodeId}: repository access failed for ${failedRepos.length}/${repositories.length} ` +
      `repositories: ${failedRepos.map((r) => r.repo).join(', ')}.`,
      { nodeId, results, failedRepos },
    )
  }

  return {
    operation: 'grant_repo_access',
    totalRepos: repositories.length,
    results,
  }
}

/**
 * Dispatch an execution plan to the correct GitHub API handler.
 * @private
 */
async function dispatchGitHubApi(plan, log) {
  const handlers = {
    invite_to_org: apiInviteToOrg,
    add_to_team: apiAddToTeam,
    grant_repo_access: apiGrantRepoAccess,
  }

  const handler = handlers[plan.action]

  if (!handler) {
    throw new GitHubExecutorError(
      'NO_API_HANDLER',
      `No API handler registered for action "${plan.action}" (node ${plan.nodeId}).`,
      { nodeId: plan.nodeId, action: plan.action },
    )
  }

  return handler(plan, log)
}

// ─── 7. Public entry point ──────────────────────────────────────────────────

/**
 * Execute a GitHub node.
 *
 * Runs the full validation → integration lookup → plan → API dispatch
 * pipeline.  Every step is captured in a structured ExecutionLog suitable
 * for display in an Execution History UI.
 *
 * Return shape:
 *   {
 *     status,       — 'success' | 'failed'
 *     message,      — human-readable summary
 *     metadata,     — executor-specific context
 *     logs,         — structured log object (entries, apiRequests, warnings, failures)
 *     startedAt,    — Date
 *     finishedAt,   — Date
 *     duration      — ms
 *   }
 *
 * @param {object} node    — React Flow node object
 * @param {object} context — execution context (workflowId, userId, etc.)
 * @returns {Promise<object>} standardised execution result
 */
export async function execute(node, context) {
  console.log(`[EXEC-TRACE] [githubExecutor] ──── GITHUB EXECUTOR ────`)
  console.log(`[EXEC-TRACE] [githubExecutor] Node: ${node?.id}, type: ${node?.type}`)
  console.log(`[EXEC-TRACE] [githubExecutor] Action: ${node?.data?.action || 'NO ACTION'}`)
  console.log(`[EXEC-TRACE] [githubExecutor] Node data: ${JSON.stringify(node?.data)}`)
  console.log(`[EXEC-TRACE] [githubExecutor] Context userId: ${context?.userId}, workflowId: ${context?.workflowId}`)

  // Create the structured log collector for this run
  const log = new ExecutionLog('github', node?.id ?? 'unknown')

  try {
    // ── Inject username from trigger payload (runtime value) ────────────
    // The username is NOT stored on the node — it comes from the trigger
    // data at execution time (who to onboard). This keeps the node config
    // about *what* to do and the trigger about *who* to do it for.
    if (!node.data.username && context.triggerPayload) {
      if (context.triggerPayload.githubUsername) {
        node.data.username = context.triggerPayload.githubUsername
        console.log(`[EXEC-TRACE] [githubExecutor] Injected username from triggerPayload.githubUsername: "${node.data.username}"`)
      } else if (context.triggerPayload.email) {
        // Fallback — GitHub accepts email for org invitations
        node.data.username = context.triggerPayload.email
        console.log(`[EXEC-TRACE] [githubExecutor] Injected username from triggerPayload.email fallback: "${node.data.username}"`)
      }
    }

    // ── Validation pipeline ───────────────────────────────────────────────
    validateNodeConfig(node, log)
    validateContext(context, node.id, log)
    validateInputs(node, log)

    // ── Integration loading ───────────────────────────────────────────────
    const integration = await loadIntegration(context.userId, node.id, log)

    // ── Plan building ─────────────────────────────────────────────────────
    const plan = buildExecutionPlan(node, context, integration, log)

    // ── API dispatch ──────────────────────────────────────────────────────
    log.info('api', `Dispatching GitHub API action: "${plan.action}"`)
    const apiResult = await dispatchGitHubApi(plan, log)

    // ── Success result ────────────────────────────────────────────────
    console.log(`[EXEC-TRACE] [githubExecutor] ✔ GitHub action "${plan.actionLabel}" completed successfully`)
    console.log(`[EXEC-TRACE] [githubExecutor] API calls made: ${log._apiRequests.length}, warnings: ${log._warnings.length}`)
    return log.finalize('success', `GitHub action "${plan.actionLabel}" completed successfully.`, {
      nodeId: node.id,
      action: plan.action,
      actionLabel: plan.actionLabel,
      organization: plan.organization,
      username: plan.username,
      team: plan.team,
      repositories: plan.repositories,
      role: plan.role,
      connectedAs: plan.auth.providerUsername,
      apiResult,
    })
  } catch (error) {
    // ── Record the failure in the log ──────────────────────────────────────
    console.log(`[EXEC-TRACE] [githubExecutor] ✘ FAILED: [${error.code || 'UNKNOWN'}] ${error.message}`)
    if (error.meta) {
      console.log(`[EXEC-TRACE] [githubExecutor] Error meta: ${JSON.stringify(error.meta)}`)
    }
    log.error('result', `Execution failed: [${error.code || 'UNKNOWN'}] ${error.message}`, {
      errorCode: error.code || 'UNKNOWN',
      errorName: error.name,
      meta: error.meta,
    })

    // Build the failed result through the same finalize path so the shape
    // is always consistent regardless of outcome.
    const failedResult = log.finalize('failed', error.message, {
      nodeId: node?.id,
      action: node?.data?.action || null,
      organization: node?.data?.organization || null,
      username: node?.data?.username || null,
      team: node?.data?.team || null,
      repositories: node?.data?.repositories || [],
      errorCode: error.code || 'UNKNOWN',
    })

    // Attach the structured result to the error so workflowExecutor can
    // record it uniformly via its standard catch path.
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
