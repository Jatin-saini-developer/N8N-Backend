import { Router } from 'express'
import { register, login, getMe } from './authController.js'
import { registerValidator, loginValidator } from './authValidator.js'
import validate from '../middlewares/validate.middleware.js'
import authMiddleware from '../middlewares/authMiddlewares.js'

const router = Router()

router.post('/register', registerValidator, validate, register)
router.post('/login', loginValidator, validate, login)
router.get('/me', authMiddleware, getMe)

export default router