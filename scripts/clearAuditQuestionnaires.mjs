import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const collections = ['auditquestions'];

const run = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is missing.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  for (const name of collections) {
    const before = await db.collection(name).countDocuments();
    const res = await db.collection(name).deleteMany({});
    const after = await db.collection(name).countDocuments();
    console.log(`Collection ${name}: deleted ${res.deletedCount} (before ${before}, after ${after})`);
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Failed to clear questionnaire data:', err);
  process.exit(1);
});
