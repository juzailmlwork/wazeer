const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const USERS = [
  { id: 1, username: 'superadmin', password: 'admin123', role: 'super_admin', name: 'Super Admin' },
  { id: 2, username: 'admin', password: 'admin123', role: 'normal_admin', name: 'Admin' },
];

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = USERS.find((u) => u.username === username && u.password === password);

  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, name: user.name },
  });
});

module.exports = router;
