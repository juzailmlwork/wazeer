const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    originalName: { type: String, required: true },
    // Name on disk inside UPLOAD_DIR — random, never user-controlled.
    storedName: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    // null = top level of the Files tab.
    folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
    createdBy: { type: String },
  },
  { timestamps: true }
);

fileSchema.index({ name: 1 });
fileSchema.index({ folder: 1 });
fileSchema.index({ createdAt: -1 });

module.exports = mongoose.model('File', fileSchema);
