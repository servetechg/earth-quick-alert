/**
 * Creates the `continuityplans` and `continuityauditreports` collections in MongoDB
 * and builds their indexes so they are visible in Atlas/Compass before the first
 * document is inserted.
 *
 * Run once after deploying this branch:
 *   node scripts/init-continuity-collections.js
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    raw.split('\n').forEach(line => {
      const m = line.match(/^([^=]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].trim();
    });
  }
}

loadEnv();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set in .env — aborting.');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB:', mongoose.connection.name);

  const db = mongoose.connection.db;

  // --- continuityplans ---
  const existingCollections = await db.listCollections().toArray();
  const names = existingCollections.map(c => c.name);

  if (!names.includes('continuityplans')) {
    await db.createCollection('continuityplans');
    console.log('Created collection: continuityplans');
  } else {
    console.log('Collection already exists: continuityplans');
  }

  const plans = db.collection('continuityplans');
  await plans.createIndex({ ownerUserId: 1, planId: 1 }, { unique: true });
  await plans.createIndex({ ownerUserId: 1 });
  await plans.createIndex({ licenseId: 1 });
  console.log('Indexes ensured on continuityplans: (ownerUserId+planId unique), ownerUserId, licenseId');

  // --- continuityauditreports ---
  if (!names.includes('continuityauditreports')) {
    await db.createCollection('continuityauditreports');
    console.log('Created collection: continuityauditreports');
  } else {
    console.log('Collection already exists: continuityauditreports');
  }

  const audits = db.collection('continuityauditreports');
  await audits.createIndex({ ownerUserId: 1 }, { unique: true });
  console.log('Indexes ensured on continuityauditreports: ownerUserId unique');

  console.log('\nDone. Both collections are now visible in Atlas/Compass.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
