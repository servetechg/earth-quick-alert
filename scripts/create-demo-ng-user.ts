import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'user' },
    accountStatus: { type: String, default: 'approved' },
    responderFunction: { type: String, default: '' },
    responderVertical: { type: String, default: '' },
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function createDemoNGUser() {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI is not set in .env');
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const email = 'ng_demo@yopmail.com';
        const password = 'ng_demo_pass';

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log(`Demo National Guard user already exists with email: ${email}`);
            process.exit(0);
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            name: 'Demo National Guard',
            email,
            password: hashedPassword,
            role: 'responder',
            accountStatus: 'approved',
            responderFunction: 'National Guard (demo)',
            responderVertical: 'national-guard',
        });

        await newUser.save();

        console.log('\n✅ Demo National Guard user created successfully!');
        console.log('--------------------------------------------------');
        console.log(`Email:    ${email}`);
        console.log(`Password: ${password}`);
        console.log(`Role:     responder`);
        console.log(`Vertical: national-guard`);
        console.log('--------------------------------------------------\n');

    } catch (error) {
        console.error('Error creating demo NG user:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

createDemoNGUser();
