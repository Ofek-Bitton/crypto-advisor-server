// server/routes/userRoutes.js
const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

// Middleware to validate JWT from Authorization header
router.use((req, res, next) => {
  const authHeader = req.headers.authorization || "";
  // Expected: "Bearer <token>"
  const [, token] = authHeader.split(" ");

  if (!token) {
    return res.status(401).json({ ok: false, msg: "No token" });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "devsecret"
    );
    req.userId = decoded.userId;
    next();
  } catch (err) {
    console.error("userRoutes auth error:", err);
    return res.status(401).json({ ok: false, msg: "Invalid token" });
  }
});

/**
 * POST /user/preferences
 * Save onboarding preferences to the user record
 */
router.post("/preferences", async (req, res) => {
  try {
    const { cryptoAssets, investorType, contentTypes } = req.body;

    const updated = await User.findByIdAndUpdate(
      req.userId,
      {
        $set: {
          preferences: {
            cryptoAssets: cryptoAssets || [],
            investorType: investorType || "",
            contentTypes: contentTypes || [],
          },
        },
      },
      { new: true } // return updated document
    ).select("-password"); // do not leak password hash

    res.json({
      ok: true,
      user: updated,
    });
  } catch (err) {
    console.error("save preferences error:", err);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

/**
 * GET /user/me
 * Get the user profile (could be used for showing preferences etc.)
 */
router.get("/me", async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) {
      return res.status(404).json({ ok: false, msg: "User not found" });
    }
    res.json({ ok: true, user });
  } catch (err) {
    console.error("get user error:", err);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

module.exports = router;
