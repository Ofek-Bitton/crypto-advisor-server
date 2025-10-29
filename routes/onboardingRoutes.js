const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

// --- Authentication middleware (protected route) ---
function authRequired(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing token" });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "devsecret"
    );

    // Important: we assume the token was created as { id: <userId> }
    req.authUserId = decoded.id;
    next();
  } catch (err) {
    console.error("authRequired error:", err.message);
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

// --- PUT /onboarding/:userId ---
// Goal: update user.preferences in the database
router.put("/:userId", authRequired, async (req, res) => {
  try {
    const { userId } = req.params;

    // Security check: prevent a user from updating another user's data
    if (req.authUserId !== userId) {
      return res.status(403).json({
        ok: false,
        error: "You are not allowed to update this user",
      });
    }

    const { cryptoAssets, investorType, contentTypes } = req.body || {};

    // Basic validation to prevent malformed data
    if (
      !Array.isArray(cryptoAssets) ||
      typeof investorType !== "string" ||
      !Array.isArray(contentTypes)
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Invalid payload. Expecting { cryptoAssets: string[], investorType: string, contentTypes: string[] }",
      });
    }

    // Update user preferences in the database
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        preferences: {
          cryptoAssets,
          investorType,
          contentTypes,
        },
      },
      {
        new: true, // Return the updated document
        runValidators: true,
      }
    ).select("-password"); // Do not return the password field

    if (!updatedUser) {
      return res.status(404).json({
        ok: false,
        error: "User not found",
      });
    }

    return res.json({
      ok: true,
      user: updatedUser,
    });
  } catch (err) {
    console.error("PUT /onboarding error:", err);
    return res.status(500).json({
      ok: false,
      error: "Server error while updating onboarding data",
    });
  }
});

module.exports = router;
