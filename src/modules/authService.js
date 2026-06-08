import jwt from 'jsonwebtoken'
import User from '../../models/User.model.js'
import ApiError from '../../utils/ApiError.js'
import { config } from '../../config/env.js'

const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  )
}

export const registerService = async ({ name, email, password }) => {
  // Check if user already exists
  const existingUser = await User.findOne({ email })
  if (existingUser) {
    throw new ApiError(409, 'Email already registered')
  }

  // Create user — password gets hashed automatically by pre save hook
  const user = await User.create({ name, email, password })

  // Generate token
  const token = generateToken(user._id)

  return {
    token,
    user: user.toPublicJSON(),
  }
}

export const loginService = async ({ email, password }) => {
  // Find user and explicitly include password
  const user = await User.findOne({ email }).select('+password')

  if (!user) {
    throw new ApiError(401, 'Invalid email or password')
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Your account has been deactivated')
  }

  // Compare password
  const isPasswordCorrect = await user.comparePassword(password)
  if (!isPasswordCorrect) {
    throw new ApiError(401, 'Invalid email or password')
  }

  // Update last login
  user.lastLogin = new Date()
  await user.save()

  // Generate token
  const token = generateToken(user._id)

  return {
    token,
    user: user.toPublicJSON(),
  }
}