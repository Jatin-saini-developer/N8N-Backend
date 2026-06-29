import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import logger from './config/logger.js'
import integrationsRoutes from './modules/integrations/integrationsRoutes.js'


const app = express()

// ─── Security ────────────────────────────────────────────────────────
app.use(helmet())

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))

// ─── Rate Limiting ───────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Too many requests, please try again later',
  },
})

app.use('/api', limiter)

// ─── Body Parsing ────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))

// ─── Logging ─────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.http(message.trim())
  },
  skip: () => process.env.NODE_ENV === 'production'
}))

// ─── Health Check ────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
  })
})

// ─── Routes ──────────────────────────────────────────────────────────
// ─── Routes ──────────────────────────────────────────────────────────
import authRoutes from './modules/authRoutes.js'
import workflowRoutes from './modules/workflow/workflowRoutes.js'

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/workflows', workflowRoutes)
app.use('/api/v1/integrations', integrationsRoutes)


// ─── 404 Handler ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  })
})

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500
  const message = err.message || 'Something went wrong'

  return res.status(statusCode).json({
    success: false,
    message,
    errors: err.errors || [],
  })
})

export default app