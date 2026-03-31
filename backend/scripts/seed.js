require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Supplier = require('../models/Supplier');
const Customer = require('../models/Customer');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);

  await Supplier.findOneAndUpdate(
    { name: 'Other' },
    { name: 'Other', phone: '' },
    { upsert: true, new: true }
  );
  console.log('Seeded: Supplier "Other"');

  await Customer.findOneAndUpdate(
    { name: 'Other' },
    { name: 'Other', phone: '0000000000' },
    { upsert: true, new: true }
  );
  console.log('Seeded: Customer "Other"');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
