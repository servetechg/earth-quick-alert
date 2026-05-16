import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const s = new mongoose.Schema({
    name: String, email: String, responderVertical: String, role: String
});
const U = mongoose.models.User || mongoose.model('User', s);

async function run() {
    await mongoose.connect(process.env.MONGODB_URI!);
    const user = await U.findOne({ email: 'ng_demo@yopmail.com' });
    console.log('USER FROM DB:', user);
    await mongoose.disconnect();
}

run();
