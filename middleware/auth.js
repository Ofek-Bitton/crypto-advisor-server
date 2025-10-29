// server/middleware/auth.js
const jwt = require("jsonwebtoken");

/**
 * Authentication middleware:
 * - Extracts Bearer token from Authorization header
 * - Verifies the JWT
 * - Attaches req.userId for downstream handlers
 */
function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
      ? header.replace("Bearer ", "")
      : null;

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "devsecret"
    );

    // our tokens look like { id: <mongoUserId> }
    req.userId = decoded.id || decoded.userId;

    if (!req.userId) {
      return res
        .status(401)
        .json({ error: "Token is missing user id" });
    }

    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = auth;
