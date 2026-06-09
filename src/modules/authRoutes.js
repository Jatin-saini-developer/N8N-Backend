import { Router } from 'express'
import { register, login, getMe } from './auth.controller.js'
import { registerValidator, loginValidator } from './auth.validator.js'
import validate from '../../middlewares/validate.middleware.js'
import authMiddleware from '../../middlewares/auth.middleware.js'

const router = Router()

router.post('/register', registerValidator, validate, register)
router.post('/login', loginValidator, validate, login)
router.get('/me', authMiddleware, getMe)

export default router