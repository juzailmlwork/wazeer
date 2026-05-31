const mongoose = require('mongoose');

const closingStockSchema = new mongoose.Schema({
  materialName: { type: String, required: true },
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  value: { type: Number, required: true, default: 0 },
  setBy: { type: String },
}, { timestamps: true });

closingStockSchema.index({ materialName: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('ClosingStock', closingStockSchema);
