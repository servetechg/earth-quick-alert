import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Define minimal User schema for the script to avoid importing Next.js specific things
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

async function createDemoElectricUser() {
    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI is not set in .env');
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const email = 'electric_demo@yopmail.com';
        const password = 'electric_demo_pass';

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log(`Demo Electric Company user already exists with email: ${email}`);
            process.exit(0);
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const newUser = new User({
            name: 'Demo Electric Responder',
            email: email,
            password: hashedPassword,
            role: 'responder',
            accountStatus: 'approved',
            responderFunction: 'Regional electric company (demo)',
            responderVertical: 'utility-electric',
        });

        await newUser.save();

        console.log('\n✅ Demo Electric Company user created successfully!');
        console.log('--------------------------------------------------');
        console.log(`Email:    ${email}`);
        console.log(`Password: ${password}`);
        console.log(`Role:     responder`);
        console.log(`Vertical: utility-electric`);
        console.log('--------------------------------------------------\n');

    } catch (error) {
        console.error('Error creating demo electric user:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

createDemoElectricUser();
