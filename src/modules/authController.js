import asyncHandler from '../utils/asyncHandler.js'
import ApiResponse from '../utils/ApiResponse.js'
import { registerService, loginService, googleAuthService } from './authService.js'

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body

  const data = await registerService({ name, email, password })

  return res.status(201).json(
    new ApiResponse(201, 'Account created successfully', data)
  )
})

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body

  const data = await loginService({ email, password })

  return res.status(200).json(
    new ApiResponse(200, 'Login successful', data)
  )
})

export const googleAuth = asyncHandler(async (req, res) => {
  const { idToken } = req.body

  if (!idToken) {
    throw new ApiError(400, 'Google ID token is required')
  }

  const data = await googleAuthService({ idToken })

  return res.status(200).json(
    new ApiResponse(200, 'Google authentication successful', data)
  )
})

export const getMe = asyncHandler(async (req, res) => {
  return res.status(200).json(
    new ApiResponse(200, 'User fetched successfully', {
      user: req.user.toPublicJSON(),
    })
  )
})

export const logout = asyncHandler(async (req, res) => {
  // JWT is stateless — the client discards the token.
  // This endpoint exists as a clean API contract and can be
  // extended later to blacklist tokens or log audit events.
  return res.status(200).json(
    new ApiResponse(200, 'Logged out successfully')
  )
})