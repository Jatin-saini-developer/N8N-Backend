const express = require("express");
const connectDB = require("./config/DataBase")

const app = express();


connectDB().then(()=>{
    console.log("Database connected successfully")
    app.listen(3000, ()=>{
    console.log("Server is Running on Port 3000")}
)
})

