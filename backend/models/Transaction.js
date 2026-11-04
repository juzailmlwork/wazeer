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
    yard: { type: String, enum: ['hospital', 'nayawala'], default: 'hospital' },
    // 'rejected' is a state, not a deletion. A rejected purchase stays on the books so
    // the decision is auditable and reversible; removing it is a separate, explicit act.
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    approvedBy: { type: String, default: null },
    rejectedBy: { type: String, default: null },
  },
  { timestamps: true }
);

transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ supplier: 1 });
transactionSchema.index({ yard: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
