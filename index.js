require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

// Routers
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const onboardingRoutes = require("./routes/onboardingRoutes");

const app = express();

// ===== Basic Middlewares =====
app.use(cors());
app.use(express.json());

// ===== Basic health-check route =====
app.get("/", (req, res) => {
  res.json({ status: "ok", msg: "crypto advisor backend running" });
});

// ===== Main API routes =====
app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/feedback", feedbackRoutes);
app.use("/onboarding", onboardingRoutes);

// ===== Server startup & MongoDB connection =====
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "";

if (!MONGO_URI) {
  console.error("❌ No MONGO_URI found in .env");
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`✅ Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
  });
