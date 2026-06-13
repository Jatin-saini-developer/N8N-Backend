import mongoose from 'mongoose'
import logger from './logger.js'

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI)

    logger.info(`MongoDB connected: ${conn.connection.host}`)

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting to reconnect...')
    })

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected')
    })

    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err}`)
    })

  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`)
    process.exit(1)
  }
}

export default connectDB