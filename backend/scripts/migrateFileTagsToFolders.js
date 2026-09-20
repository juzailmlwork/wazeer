// One-off: the Files tab moved from tags to folders.
// Each file tag becomes a top-level folder, and every file goes into the folder for its
// first tag. Untagged files stay at the top level. Safe to run more than once.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Folder = require('../models/Folder');
const File = require('../models/File');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const names = (await db.listCollections({ name: 'filetags' }).toArray()).length;
  if (!names) {
    console.log('No filetags collection — nothing to migrate.');
    return mongoose.disconnect();
  }

  const tags = await db.collection('filetags').find().toArray();
  const folderByTag = new Map();
  for (const tag of tags) {
    const folder = await Folder.findOneAndUpdate(
      { parent: null, name: tag.name },
      { $setOnInsert: { name: tag.name, parent: null, createdBy: 'migration' } },
      { upsert: true, new: true }
    );
    folderByTag.set(String(tag._id), folder._id);
    console.log(`Folder "${folder.name}" ready`);
  }

  let moved = 0;
  for (const file of await db.collection('files').find({ tags: { $exists: true, $ne: [] } }).toArray()) {
    const folderId = folderByTag.get(String(file.tags[0]));
    if (!folderId) continue;
    if (file.tags.length > 1) {
      console.log(`  "${file.name}" had ${file.tags.length} tags; using the first one`);
    }
    await db.collection('files').updateOne({ _id: file._id }, { $set: { folder: folderId } });
    moved++;
  }

  await db.collection('files').updateMany({}, { $unset: { tags: '' } });
  await db.collection('filetags').drop();
  console.log(`Migrated ${moved} file(s) into ${tags.length} folder(s); removed the old tags.`);
  await mongoose.disconnect();
}

run().catch((err) => { console.error('Migration failed:', err.message); process.exit(1); });
