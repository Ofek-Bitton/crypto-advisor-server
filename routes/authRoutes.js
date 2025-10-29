const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

/**
 * Generates a JWT token with a consistent format: { id: <mongoId> }
 */
function createToken(userId) {
  return jwt.sign(
    { id: userId }, // Important: keep field name consistent as "id"
    process.env.JWT_SECRET || "devsecret",
    { expiresIn: "7d" }
  );
}

/**
 * SIGNUP - Create a new user
 * Body: { name, email, password }
 * Returns: { ok, token, user }
 */
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if a user with the same email already exists
    const exists = await User.findOne({ email });
    if (exists) {
      return res
        .status(400)
        .json({ ok: false, error: "User already exists" });
    }

    // Hash the password before saving
    const hashed = await bcrypt.hash(password, 10);

    // Create a new user in the database
    const user = await User.create({
      name,
      email,
      password: hashed,
      preferences: {
        cryptoAssets: [],
        investorType: "",
        contentTypes: [],
      },
    });

    // Generate JWT token
    const token = createToken(user._id.toString());

    // Send response back to the client
    return res.json({
      ok: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        preferences: user.preferences,
      },
    });
  } catch (err) {
    console.error("❌ /auth/signup error:", err.message);
    return res
      .status(500)
      .json({ ok: false, error: "Signup failed on the server side" });
  }
});

/**
 * LOGIN - Authenticate an existing user
 * Body: { email, password }
 * Returns: { ok, token, user }
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(400)
        .json({ ok: false, error: "Invalid email or password" });
    }

    // Compare the provided password with the stored hash
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res
        .status(400)
        .json({ ok: false, error: "Invalid email or password" });
    }

    // Generate JWT token
    const token = createToken(user._id.toString());

    // Send response back to the client
    return res.json({
      ok: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        preferences: user.preferences,
      },
    });
  } catch (err) {
    console.error("❌ /auth/login error:", err.message);
    return res
      .status(500)
      .json({ ok: false, error: "Login failed on the server side" });
  }
});

module.exports = router;
