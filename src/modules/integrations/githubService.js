import axios from 'axios'
import Integration from '../../models/Integration.model.js'
import ApiError from '../../utils/ApiError.js'
import logger from '../../config/logger.js'

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET

// ─────────────────────────────────────────────────────────────────────────────
//  CONNECT GITHUB
//  — Frontend se "code" aata hai, GitHub ko exchange karte hain
//  — real access_token ke liye, phir database mein save
// ─────────────────────────────────────────────────────────────────────────────
export const connectGithubService = async ({ code, userId }) => {

  // Step 1 — GitHub ko code bhejo, access_token wapas maango
  let tokenResponse
  try {
    tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      },
      {
        headers: { Accept: 'application/json' },
      }
    )
  } catch (error) {
    logger.error(`GitHub token exchange failed: ${error.message}`)
    throw new ApiError(502, 'Failed to connect to GitHub')
  }

  const { access_token, error: githubError } = tokenResponse.data

  if (githubError || !access_token) {
    throw new ApiError(400, 'GitHub authorization failed or code expired')
  }

  // Step 2 — Access token se GitHub user ki info nikaalo
  // (taaki username dikha sakein UI mein, "Connected as @username")
  let githubUser
  try {
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    githubUser = userResponse.data
  } catch (error) {
    logger.error(`Failed to fetch GitHub user info: ${error.message}`)
    throw new ApiError(502, 'Failed to fetch GitHub user details')
  }

  // Step 3 — Database mein save karo (ya update karo agar already exist karta hai)
  const integration = await Integration.findOneAndUpdate(
    { userId, provider: 'github' },
    {
      accessToken: access_token,
      providerAccountId: String(githubUser.id),
      providerUsername: githubUser.login,
      isActive: true,
    },
    {
      upsert: true,      // agar exist nahi karta, naya bana do
      new: true,         // updated document wapas do
      runValidators: true,
    }
  )

  logger.info(`GitHub connected for user: ${userId} as @${githubUser.login}`)

  return {
    provider: 'github',
    username: githubUser.login,
    connectedAt: integration.updatedAt,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GET INTEGRATION STATUS
//  — Dashboard/Settings mein dikhane ke liye — kaunsa provider
//    connect hai, kaunsa nahi
// ─────────────────────────────────────────────────────────────────────────────
export const getIntegrationsStatusService = async ({ userId }) => {
  const integrations = await Integration.find({ userId, isActive: true })
    .select('-accessToken')  // token kabhi frontend ko nahi bhejna

  const connected = integrations.map((i) => i.provider)

  return {
    github: connected.includes('github'),
    slack: connected.includes('slack'),
    jira: connected.includes('jira'),
    notion: connected.includes('notion'),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  DISCONNECT INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────
export const disconnectIntegrationService = async ({ userId, provider }) => {
  const result = await Integration.findOneAndUpdate(
    { userId, provider },
    { isActive: false },
  )

  if (!result) {
    throw new ApiError(404, `No active ${provider} integration found`)
  }

  logger.info(`${provider} disconnected for user: ${userId}`)

  return { provider, disconnected: true }
}