const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { getDashboardDataForUser } = require("../services/dashboardService");

const router = express.Router();

/**
 * JWT authentication middleware.
 * Extracts and verifies the Bearer token,
 * and attaches the user ID to req.userId.
 */
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "")
      : null;

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "devsecret"
    );

    // We expect tokens to have shape { id: <userId> }
    req.userId = decoded.id || decoded.userId;

    if (!req.userId && !req.id) {
      return res.status(401).json({ error: "Token is missing user id" });
    }

    next();
  } catch (err) {
    console.error("❌ authMiddleware error:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * GET /dashboard
 * Returns:
 * - user info
 * - prices
 * - news
 * - aiInsight
 * - meme
 *
 * This route is now very thin: it just authenticates,
 * loads the user, and delegates the heavy lifting to the service layer.
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    // Load user from DB
    const user = await User.findById(req.userId).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Ask the service layer to build dashboard data for this user
    const dashboardData = await getDashboardDataForUser(user);

    // Respond in the same shape the frontend already expects.
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
