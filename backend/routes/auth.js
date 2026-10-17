const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const { loginRateLimit } = require('../middleware/rateLimit');

const TOKEN_TTL = '24h';
const MIN_PASSWORD_LENGTH = 6;

// The claims here are a snapshot from the moment of sign-in and are NOT authoritative:
// middleware/auth.js reloads the account on every request, so role, name and
// mustChangePassword always come from the database. They are kept in the token because the
// frontend reads them straight back out of the login response.
const sign = (user) =>
  jwt.sign(
    {
      id: user._id,
      username: user.username,
      role: user.role,
      name: user.name,
      mustChangePassword: Boolean(user.mustChangePassword),
    },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );

const publicUser = (user) => ({
  id: user._id,
  username: user.username,
  role: user.role,
  name: user.name,
  mustChangePassword: Boolean(user.mustChangePassword),
});

router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    // Mongoose strips undefined from a query, so findOne({ username: undefined }) would ask for
    // findOne({}) and compare against whichever user happens to come back first.
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    res.json({ token: sign(user), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Anyone signed in can change their own password; this is also the only route reachable while
// holding a one-time password, which is why it uses verifyOnly rather than the usual gate.
router.post('/change-password', auth.verifyOnly, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are both required' });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Deliberately 400 rather than 401: the frontend treats a 401 as an expired session and
    // signs the user out, which would be the wrong answer to a typo.
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    // Without this, a one-time password could be "changed" to itself and stay in force.
    if (await bcrypt.compare(newPassword, user.password)) {
      return res.status(400).json({ message: 'The new password must be different from the current one' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    await user.save();

    // The old token still carries mustChangePassword, so hand back a fresh one.
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
