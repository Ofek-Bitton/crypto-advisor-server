const mongoose = require("mongoose");
const { Schema } = mongoose;

// User schema: how a user is stored in the DB
const userSchema = new Schema(
  {
    name: { type: String, required: true }, // full name
    email: { type: String, required: true, unique: true }, // unique email
    password: { type: String, required: true }, // hashed password

    // Saved onboarding preferences
    preferences: {
      cryptoAssets: [String], // list of assets user cares about
      investorType: String, // "low"/"medium"/"high" etc.
      contentTypes: [String], // what kind of content they want (news, signals...)
    },
  },
  {
    timestamps: true, // auto-add createdAt/updatedAt
  }
);

// Export model
module.exports = mongoose.model("User", userSchema);
