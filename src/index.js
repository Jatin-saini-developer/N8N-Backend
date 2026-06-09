// const express = require("express");
// const connectDB = require("./config/DataBase");
// const authRoutes = require("./routes/authRoutes");

// const app = express();

// // ─── Body Parsers ────────────────────────────────────────────────────
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // ─── Health Check ────────────────────────────────────────────────────
// app.get("/api/health", (req, res) => {
//   res.json({ status: "ok", uptime: process.uptime() });
// });

// // ─── Routes ──────────────────────────────────────────────────────────
// app.use("/api/auth", authRoutes);

// // ─── Start Server ────────────────────────────────────────────────────
// connectDB().then(() => {
//   console.log("Database connected successfully");
//   app.listen(3000, () => {
//     console.log("Server is Running on Port 3000");
//   });
// });
