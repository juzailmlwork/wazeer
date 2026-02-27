const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    pricePerKg: { type: Number, required: true, min: 0 },
    unit: { type: String, default: 'kg' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Material', materialSchema);
