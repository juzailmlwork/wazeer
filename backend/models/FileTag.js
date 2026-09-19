const mongoose = require('mongoose');

const fileTagSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  color: { type: String, required: true },
});

module.exports = mongoose.model('FileTag', fileTagSchema);
