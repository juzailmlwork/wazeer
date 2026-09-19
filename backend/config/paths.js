const path = require('path');

module.exports = {
  UPLOAD_DIR: path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../uploads')),
  // Safety snapshots taken before each restore, and restore uploads in transit.
  BACKUP_DIR: path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '../backups')),
};
