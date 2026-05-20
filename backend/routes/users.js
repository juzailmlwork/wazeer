const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const auth = require('../middleware/auth');

const superAdminOnly = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Super admin access required' });
  }
  next();
};

router.get('/', auth, superAdminOnly, async (req, res) => {
  try {
    const users = await User.find({}, '-password').sort({ createdAt: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, superAdminOnly, async (req, res) => {
  try {
    const { username, password, name, role } = req.body;
    if (!username || !password || !name || !role) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashed, name, role });
    await user.save();
    res.status(201).json({ _id: user._id, username: user.username, name: user.name, role: user.role, createdAt: user.createdAt });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Username already exists' });
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, superAdminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.username === req.user.username) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
