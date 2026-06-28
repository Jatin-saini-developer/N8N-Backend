import jwt from 'jsonwebtoken'
import User from '../models/UserModal.js'
import ApiError from '../utils/ApiError.js'
import { OAuth2Client } from 'google-auth-library'

const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
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



const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export const googleAuthService = async ({ idToken }) => {
  // Step 1 — Google se verify karo yeh token genuine hai
  let payload
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    payload = ticket.getPayload()
  } catch (error) {
    throw new ApiError(401, 'Invalid Google token')
  }

  const { email, name, sub: googleId } = payload
  // "sub" Google ka unique user identifier hota hai

  if (!email) {
    throw new ApiError(400, 'Google account has no email')
  }

  // Step 2 — Check karo yeh email already exist karta hai?
  let user = await User.findOne({ email })

  if (user) {
    // Existing user — agar pehle normal signup se bana tha,
    // ab Google se bhi link kar do (future Google logins ke liye)
    if (!user.googleId) {
      user.googleId = googleId
      await user.save()
    }
  } else {
    // Naya user — Google se directly signup
    user = await User.create({
      name,
      email,
      googleId,
      authProvider: 'google',
      // password nahi diya — model automatically
      // skip kar dega (humne abhi yeh fix kiya tha)
    })
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Your account has been deactivated')
  }

  // Step 3 — Apna JWT token generate karo (same jaisa login mein)
  user.lastLogin = new Date()
  await user.save()

  const token = generateToken(user._id)

  return {
    token,
    user: user.toPublicJSON(),
  }
}