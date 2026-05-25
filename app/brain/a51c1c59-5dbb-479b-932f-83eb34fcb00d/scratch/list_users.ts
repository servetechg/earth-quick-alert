import mongoose from 'mongoose';
import connectDB from '../../lib/mongodb';
import User from '../../models/User';

async function listUsers() {
    await connectDB();
    const users = await User.find({}, 'email role accountStatus').lean();
    // console.log(JSON.stringify(users, null, 2));
    process.exit(0);
}

listUsers().catch(err => {
    console.error(err);
    process.exit(1);
});
