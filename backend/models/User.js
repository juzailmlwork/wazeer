const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['super_admin', 'normal_admin'], required: true },
    // Set whenever a super admin sets this user's password for them: that password works once,
    // to sign in and choose a real one. Cleared by POST /api/auth/change-password.
    mustChangePassword: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
