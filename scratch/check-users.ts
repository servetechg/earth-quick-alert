import connectDB from './lib/mongodb';
import User from './models/User';

async function checkUsers() {
    await connectDB();
    const users = await User.find({}, 'email role accountStatus').lean();
    // console.log(JSON.stringify(users, null, 2));
    process.exit(0);
}

checkUsers().catch(err => {
    console.error(err);
    process.exit(1);
});
