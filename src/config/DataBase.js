const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect('mongodb+srv://jatinrsaini:djEF55TrowJLgqiQ@cluster0.1svxivg.mongodb.net/ThumbnailGenerator')

    console.log(`MongoDB connected: ${conn.connection.host}`)

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Attempting to reconnect...')
    })

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected')
    })

    mongoose.connection.on('error', (err) => {
      console.error(`MongoDB connection error: ${err}`)
    })

  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`)
  }
}


module.exports = connectDB;