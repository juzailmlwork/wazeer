const mongoose = require('mongoose');

const incomeTagSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  color: { type: String, required: true },
});

module.exports = mongoose.model('IncomeTag', incomeTagSchema);
