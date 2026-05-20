const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['super_admin', 'normal_admin'], required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
