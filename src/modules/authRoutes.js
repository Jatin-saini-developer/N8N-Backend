import { Router } from 'express'
import { register, login, getMe, logout, googleAuth} from './authController.js'
import { registerValidator, loginValidator } from './authValidator.js'
import validate from '../middlewares/validate.middleware.js'
import authMiddleware from '../middlewares/authMiddlewares.js'

const router = Router()

router.post('/register', registerValidator, validate, register)
router.post('/login', loginValidator, validate, login)
router.post('/google', googleAuth)
router.get('/me', authMiddleware, getMe)
router.post('/logout', authMiddleware, logout)

export default router