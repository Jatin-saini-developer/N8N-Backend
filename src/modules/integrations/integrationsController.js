import asyncHandler from '../../utils/asyncHandler.js'
import ApiResponse from '../../utils/ApiResponse.js'
import ApiError from '../../utils/ApiError.js'
import {
  connectGithubService,
  getIntegrationsStatusService,
  disconnectIntegrationService,
} from './githubService.js'

// ─────────────────────────────────────────────────────────────────────────────
//  CONNECT GITHUB
//  POST /api/v1/integrations/github/connect
// ─────────────────────────────────────────────────────────────────────────────
export const connectGithub = asyncHandler(async (req, res) => {
  const { code } = req.body

  if (!code) {
    throw new ApiError(400, 'Authorization code is required')
  }

  const data = await connectGithubService({
    code,
    userId: req.user._id,
  })

  return res.status(200).json(
    new ApiResponse(200, 'GitHub connected successfully', data)
  )
})

// ─────────────────────────────────────────────────────────────────────────────
//  GET INTEGRATIONS STATUS
//  GET /api/v1/integrations/status
// ─────────────────────────────────────────────────────────────────────────────
export const getIntegrationsStatus = asyncHandler(async (req, res) => {
  const data = await getIntegrationsStatusService({
    userId: req.user._id,
  })

  return res.status(200).json(
    new ApiResponse(200, 'Integration status fetched', data)
  )
})

// ─────────────────────────────────────────────────────────────────────────────
//  DISCONNECT INTEGRATION
//  DELETE /api/v1/integrations/:provider
// ─────────────────────────────────────────────────────────────────────────────
export const disconnectIntegration = asyncHandler(async (req, res) => {
  const { provider } = req.params

  const validProviders = ['github', 'slack', 'jira', 'notion']
  if (!validProviders.includes(provider)) {
    throw new ApiError(400, 'Invalid provider')
  }

  const data = await disconnectIntegrationService({
    userId: req.user._id,
    provider,
  })

  return res.status(200).json(
    new ApiResponse(200, `${provider} disconnected successfully`, data)
  )
})