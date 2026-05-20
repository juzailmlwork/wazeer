const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema(
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
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, default: null },
    grandTotal: { type: Number, required: true },
    createdBy: { type: String },
    yard: { type: String, enum: ['hospital', 'nayawala'], default: 'hospital' },
  },
  { timestamps: true }
);

saleSchema.index({ createdAt: -1 });
saleSchema.index({ customer: 1 });
saleSchema.index({ yard: 1 });

module.exports = mongoose.model('Sale', saleSchema);
