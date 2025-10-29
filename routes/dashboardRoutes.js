const express = require("express");
const User = require("../models/User");
const { getDashboardDataForUser } = require("../services/dashboardService");
const auth = require("../middleware/auth");

const router = express.Router();

/**
 * GET /dashboard
 * Protected route:
 * - Requires valid JWT (auth middleware)
 * - Loads the user from DB using req.userId
 * - Calls service layer to assemble dashboard data
 */
router.get("/", auth, async (req, res) => {
  try {
    // Load the user from Mongo by the ID we got from the token
    const user = await User.findById(req.userId).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Ask service layer for dashboard data (news, prices, AI, meme...)
    const dashboardData = await getDashboardDataForUser(user);

    // Return exactly what the frontend expects
    return res.json({
      ...dashboardData,
    });
  } catch (err) {
    console.error("❌ /dashboard error:", err.message);

    return res.status(500).json({
      error: "Failed to build dashboard",
    });
  }
});

module.exports = router;
