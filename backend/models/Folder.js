const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // null = top level. Nesting depth is unlimited.
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
    createdBy: { type: String },
  },
  { timestamps: true }
);

// No two folders with the same name side by side.
folderSchema.index({ parent: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Folder', folderSchema);
