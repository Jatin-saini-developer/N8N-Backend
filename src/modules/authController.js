import asyncHandler from '../utils/asyncHandler.js'
import ApiResponse from '../utils/ApiResponse.js'
import { registerService, loginService } from './authService.js'

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

export const getMe = asyncHandler(async (req, res) => {
  return res.status(200).json(
    new ApiResponse(200, 'User fetched successfully', {
      user: req.user.toPublicJSON(),
    })
  )
})