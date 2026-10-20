require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const app = express();

// nginx (and, for the main site, the Vite dev server behind it) forwards the caller's address
// in X-Forwarded-For. Without this, req.ip is the proxy's own 127.0.0.1 for every request and
// the login throttle would count the whole world as one caller.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

// The browser app is served from the same origin as the API it calls, so day-to-day traffic
// needs no CORS at all. The allowlist is what stops any other website from spending a stolen
// token on this API from someone's browser.
const ALLOWED_ORIGINS = (
  process.env.CORS_ORIGINS
  || 'https://fwr.limecodelabs.com,https://www.fwr.limecodelabs.com,https://fwrbe.limecodelabs.com,http://localhost:4200'
).split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // No Origin header at all: same-origin requests, curl, the cron scripts, health checks.
    // There is nothing to decide, so these pass.
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    // Answer without the CORS headers rather than erroring: the browser blocks the response,
    // which is the point, and the server log stays free of noise from scanners.
    cb(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/materials', require('./routes/materials'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/tags', require('./routes/tags'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/incomes', require('./routes/incomes'));
app.use('/api/income-tags', require('./routes/income-tags'));
app.use('/api/users', require('./routes/users'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/salary-records', require('./routes/salary-records'));
app.use('/api/closing-stock', require('./routes/closing-stock'));
app.use('/api/files', require('./routes/files'));
app.use('/api/folders', require('./routes/folders'));
app.use('/api/parties', require('./routes/parties'));
app.use('/api/backup', require('./routes/backup'));

async function seedUsers() {
  const count = await User.countDocuments();
  if (count > 0) return;
  const hashed = await bcrypt.hash('admin123', 10);
  await User.insertMany([
    { username: 'superadmin', password: hashed, name: 'Super Admin', role: 'super_admin' },
    { username: 'admin', password: hashed, name: 'Admin', role: 'normal_admin' },
  ]);
  console.log('Default users seeded');
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    await seedUsers();
    app.listen(process.env.PORT || 5000, () => {
      console.log(`Server running on port ${process.env.PORT || 5000}`);
    });
  })
  .catch((err) => console.error('MongoDB connection error:', err));
