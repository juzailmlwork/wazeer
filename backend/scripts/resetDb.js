require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { execSync } = require('child_process');

async function resetDb() {
  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  console.log('Database dropped successfully.');
  await mongoose.disconnect();
  execSync('node ' + require('path').join(__dirname, 'seed.js'), { stdio: 'inherit' });
}

resetDb().catch((err) => {
  console.error('Failed to reset database:', err.message);
  process.exit(1);
});
