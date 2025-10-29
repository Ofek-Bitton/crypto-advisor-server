const mongoose = require("mongoose");
const { Schema } = mongoose;

const feedbackSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    section: { type: String, required: true }, // e.g. "news", "prices", "insight", "meme"
    itemId: {
      type: String,
      required: true, // which specific item was voted on
    },
    vote: { type: Number, enum: [1, -1], required: true }, // 1=like, -1=dislike
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Feedback", feedbackSchema);
