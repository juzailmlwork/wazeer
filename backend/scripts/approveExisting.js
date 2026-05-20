require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Transaction = require('../models/Transaction');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const Income = require('../models/Income');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const update = { status: 'approved', approvedBy: 'superadmin' };
  const filter = { $or: [{ status: { $exists: false } }, { status: 'pending' }] };

  const [tx, sale, expense, income] = await Promise.all([
    Transaction.updateMany(filter, { $set: update }),
    Sale.updateMany(filter, { $set: update }),
    Expense.updateMany(filter, { $set: update }),
    Income.updateMany(filter, { $set: update }),
  ]);

  console.log(`Transactions updated: ${tx.modifiedCount}`);
  console.log(`Sales updated:        ${sale.modifiedCount}`);
  console.log(`Expenses updated:     ${expense.modifiedCount}`);
  console.log(`Income updated:       ${income.modifiedCount}`);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => { console.error(err); process.exit(1); });
