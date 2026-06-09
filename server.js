import 'dotenv/config'
import connectDB from './src/config/DataBase.js'
import app from './src/app.js'


const PORT = process.env.PORT || 5000

const startServer = async () => {

  // pehle database connect karo
  await connectDB()

  // phir server start karo
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })

  // agar koi unhandled promise rejection aaye
  process.on('unhandledRejection', (err) => {
    console.error(`Unhandled Rejection: ${err.message}`)
    server.close(() => process.exit(1))
  })

  // agar koi uncaught exception aaye
  process.on('uncaughtException', (err) => {
    console.error(`Uncaught Exception: ${err.message}`)
    process.exit(1)
  })

}

startServer()