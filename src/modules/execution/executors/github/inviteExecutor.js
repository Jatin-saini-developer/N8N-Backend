import axios from 'axios'
import Integration from '../../../../models/Integration.model.js'
import logger from '../../../../config/logger.js'

const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_API_VERSION = '2022-11-28'
// Official GitHub API role values for POST /orgs/{org}/invitations
const VALID_ORG_ROLES = ['direct_member', 'admin', 'billing_manager']

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
  console.log(`[EXEC-TRACE] [inviteExecutor] Executing ${node?.type} node ${node?.id}`)
  const log = new ExecutionLog(node?.type ?? 'github.invite', node?.id ?? 'unknown')

  try {
    // ── 1. Node sanity checks ──────────────────────────────────────────────
    if (!node || typeof node !== 'object') {
      throw new GitHubExecutorError('INVALID_NODE', 'Invite executor received an invalid node object.')
    }
    if (!node.id) {
      throw new GitHubExecutorError('MISSING_NODE_ID', 'Invite executor received a node without an id.')
    }
    if (!node.data || typeof node.data !== 'object') {
      throw new GitHubExecutorError('MISSING_NODE_DATA', `Node ${node.id} is missing data object.`)
    }
    if (!context || !context.userId || !context.workflowId) {
      throw new GitHubExecutorError('INVALID_CONTEXT', `Node ${node.id}: missing valid execution context (userId/workflowId).`)
    }

    // ── 2. Resolve organization and role from node config ─────────────────
    const { organization, role = 'direct_member' } = node.data

    if (!organization || typeof organization !== 'string' || !organization.trim()) {
      throw new GitHubExecutorError('INVALID_ORGANIZATION', `Node ${node.id}: "organization" must be a non-empty string.`)
    }
    if (role && !VALID_ORG_ROLES.includes(role)) {
      throw new GitHubExecutorError(
        'INVALID_ROLE',
        `Node ${node.id}: role must be one of [${VALID_ORG_ROLES.join(', ')}]. Received: "${role}".`
      )
    }

    // ── 3. Determine invitee — GitHub username XOR email ──────────────────
    // Priority: node.data.username → triggerPayload.githubUsername → triggerPayload.email
    // A GitHub username is resolved to a numeric invitee_id via GET /users/{username}.
    // An email address is sent directly in the "email" field.
    // These two paths are mutually exclusive — an email address is NEVER placed
    // into a username/login field.
    const githubUsername =
      node.data.username?.trim() ||
      context.triggerPayload?.githubUsername?.trim() ||
      null
    const inviteeEmail = context.triggerPayload?.email?.trim() || null

    if (!githubUsername && !inviteeEmail) {
      throw new GitHubExecutorError(
        'MISSING_INVITEE',
        `Node ${node.id}: cannot invite — no GitHub username or email address is available. ` +
        `Provide a GitHub username in the node config or ensure the trigger payload contains an email.`
      )
    }

    // ── 4. Load GitHub integration ────────────────────────────────────────
    const integration = await Integration.findOne({ userId: context.userId, provider: 'github' }).select('+accessToken')
    if (!integration || !integration.isActive || !integration.accessToken) {
      throw new GitHubExecutorError('INTEGRATION_ERROR', `GitHub integration invalid or missing for node ${node.id}.`)
    }
    const headers = buildHeaders(integration.accessToken)

    // ── 5. Build the correct POST /orgs/{org}/invitations request body ────
    // GitHub API spec: https://docs.github.com/en/rest/orgs/members#create-an-organization-invitation
    // Accepted body fields: invitee_id (integer) | email (string), plus role.
    // "login" is NOT a valid field on this endpoint.
    let requestBody = { role: role || 'direct_member' }
    let inviteeDescription

    if (githubUsername) {
      // Resolve the GitHub username to a numeric user ID first.
      // The invitations endpoint requires invitee_id (integer), not a login string.
      const userUrl = `${GITHUB_API_BASE}/users/${encodeURIComponent(githubUsername)}`
      const userReqStart = Date.now()
      log.info('resolve', `Resolving GitHub username "${githubUsername}" to numeric user ID…`)

      let userData
      try {
        const userResponse = await axios.get(userUrl, { headers })
        userData = userResponse.data
        log.apiRequest('GET', userUrl, userResponse.status, Date.now() - userReqStart, {
          login: userData.login,
          id: userData.id,
        })
      } catch (resolveError) {
        const status = resolveError.response?.status
        const msg = resolveError.response?.data?.message || resolveError.message
        log.apiFailure('GET', userUrl, resolveError.code || 'HTTP_ERROR', msg, status, Date.now() - userReqStart)
        throw new GitHubExecutorError(
          'USER_RESOLVE_FAILED',
          `Node ${node.id}: could not resolve GitHub username "${githubUsername}" ` +
          `(HTTP ${status ?? 'N/A'}: ${msg}).`
        )
      }

      requestBody.invitee_id = userData.id
      inviteeDescription = `GitHub user @${userData.login} (id: ${userData.id})`
      log.info('resolve', `Resolved @${githubUsername} → numeric id ${userData.id}.`)
    } else {
      // No GitHub username — send an email invitation.
      requestBody.email = inviteeEmail
      inviteeDescription = `email address ${inviteeEmail}`
      log.info('resolve', `No GitHub username available — using email invitation for ${inviteeEmail}.`)
    }

    // ── 6. POST the invitation ────────────────────────────────────────────
    const inviteUrl = `${GITHUB_API_BASE}/orgs/${encodeURIComponent(organization)}/invitations`
    const inviteReqStart = Date.now()
    console.log(`[EXEC-TRACE] [inviteExecutor] POST ${inviteUrl} — body: ${JSON.stringify(requestBody)}`)

    const response = await axios.post(inviteUrl, requestBody, { headers })
    const inviteDurationMs = Date.now() - inviteReqStart
    log.apiRequest('POST', inviteUrl, response.status, inviteDurationMs, {
      invitationId: response.data?.id,
      inviteeType: githubUsername ? 'user_id' : 'email',
    })

    return log.finalize(
      'success',
      `Invited ${inviteeDescription} to organisation ${organization} as ${requestBody.role}.`,
      {
        nodeId: node.id,
        organization,
        inviteeType: githubUsername ? 'github_username' : 'email',
        invitee: githubUsername ? { username: githubUsername, id: requestBody.invitee_id } : { email: inviteeEmail },
        role: requestBody.role,
        invitationId: response.data?.id,
        connectedAs: integration.providerUsername,
      }
    )
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
