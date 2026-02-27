const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    items: [
      {
        material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material' },
        materialName: { type: String },
        weight: { type: Number },
        pricePerKg: { type: Number },
        totalPrice: { type: Number },
        unit: { type: String, default: 'kg' },
      },
    ],
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
    supplierName: { type: String, default: null },
    grandTotal: { type: Number, required: true },
    createdBy: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Transaction', transactionSchema);
