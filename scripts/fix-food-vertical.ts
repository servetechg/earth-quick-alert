import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const s = new mongoose.Schema({
    name: String, email: String, password: String, role: String,
    accountStatus: String, responderFunction: String, responderVertical: String,
});
const U = mongoose.model('User', s);

async function run() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const r = await U.updateOne(
        { email: 'food_demo@yopmail.com' },
        { $set: { responderVertical: 'food-logistics' } }
    );
    console.log('Updated:', r.modifiedCount);
    await mongoose.disconnect();
}

run();
