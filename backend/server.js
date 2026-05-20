require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const app = express();

app.use(cors());
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
