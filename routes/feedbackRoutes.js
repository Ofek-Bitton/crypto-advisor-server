// server/routes/feedbackRoutes.js
const express = require("express");
const jwt = require("jsonwebtoken");
const Feedback = require("../models/Feedback");

const router = express.Router();

/**
 * Small auth middleware for this router.
 * Expects Authorization: Bearer <token>
 * Sets req.userId if valid.
 */
router.use((req, res, next) => {
  const header = req.headers.authorization || "";
  const [, token] = header.split(" ");

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
    console.error("feedbackRoutes auth error:", err);
    return res.status(401).json({ ok: false, msg: "Invalid token" });
  }
});

/**
 * POST /feedback
 * Body:
 *  - section ("news", "prices", "insight", "meme")
 *  - itemId (string)
 *  - vote (1 for like, -1 for dislike)
 *
 * Stores user feedback for future model training.
 */
router.post("/", async (req, res) => {
  try {
    const { section, itemId, vote, userId } = req.body;
    // basic validation
    if (
      !section ||
      !itemId ||
      (vote !== 1 && vote !== -1)
    ) {
      return res
        .status(400)
        .json({ ok: false, msg: "Invalid feedback payload" });
    }

    // save feedback
    const fb = await Feedback.create({
      userId,
      section,
      itemId,
      vote,
    });

    res.json({ ok: true, feedback: fb });
  } catch (err) {
    console.error("feedback error:", err);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

module.exports = router;
