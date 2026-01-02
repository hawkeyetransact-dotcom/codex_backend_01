import Link from 'mongoose';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

console.log("Attempting to connect to MongoDB...");
// Mask password in URI log
const uri = process.env.MONGO_URI || "";
const maskedUri = uri.replace(/:([^:@]{1,})@/, ":****@");
console.log("URI:", maskedUri);

mongoose.connect(uri)
    .then(() => {
        console.log("SUCCESS: Database connected!");
        process.exit(0);
    })
    .catch((err) => {
        console.error("FAILURE: Connection failed:", err.message);
        process.exit(1);
    });
