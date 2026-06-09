import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

const app = express()

// ─── Security ────────────────────────────────────────────────────────
app.use(helmet())

app.use(cors({
  origin: 'http://localhost:5173',
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
app.use(morgan('dev'))

// ─── Health Check ────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
  })
})

// ─── Routes ──────────────────────────────────────────────────────────
// yahan baad mein routes add karenge

// ─── 404 Handler ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  })
})

export default app