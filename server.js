import 'dotenv/config'
import connectDB from './src/config/DataBase.js'
import app from './src/app.js'
import logger from './src/config/logger.js'



const PORT = process.env.PORT || 5000

const startServer = async () => {

  // pehle database connect karo
  await connectDB()

  // phir server start karo
  const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`)
  })

  // agar koi unhandled promise rejection aaye
  process.on('unhandledRejection', (err) => {
    logger.error(`Unhandled Rejection: ${err.message}`)
    server.close(() => process.exit(1))
  })

  // agar koi uncaught exception aaye
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.message}`)
    process.exit(1)
  })

}

startServer()