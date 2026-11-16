/**
 * One-time UAT test account bootstrap (local / staging only).
 * Run: npx tsx scripts/uat-bootstrap.ts
 */
import { createRequire } from 'module';
import { resolve } from 'path';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: resolve(process.cwd(), '.env.local') });
require('dotenv').config({ path: resolve(process.cwd(), '.env') });

import bcrypt from 'bcryptjs';
import connectDB from '../lib/mongodb';
import User from '../models/User';

const UAT_MOBILE = {
    email: 'uat_mobile@yopmail.com',
    password: 'UatMobile123!',
    firstName: 'UAT',
    lastName: 'Mobile',
};

const UAT_SUBADMIN = {
    email: 'uat_subadmin@yopmail.com',
    password: 'UatSubAdmin123!',
    name: 'UAT Sub Admin',
    role: 'sub-admin' as const,
    state: 'Arkansas',
    city: 'Little Rock',
    country: 'USA',
    accountStatus: 'approved' as const,
};

async function upsertMobileUser() {
    const email = UAT_MOBILE.email.toLowerCase();
    const hash = await bcrypt.hash(UAT_MOBILE.password, 10);
    let user = await User.findOne({ email }).select('+password');
    if (!user) {
        user = await User.create({
            email,
            password: hash,
            firstName: UAT_MOBILE.firstName,
            lastName: UAT_MOBILE.lastName,
            name: `${UAT_MOBILE.firstName} ${UAT_MOBILE.lastName}`,
            role: 'user',
            emailVerified: true,
            profileComplete: false,
            accountStatus: 'approved',
        });
        console.log('Created mobile UAT user:', email);
    } else {
        user.password = hash;
        user.role = 'user';
        user.emailVerified = true;
        user.accountStatus = 'approved';
        await user.save();
        console.log('Updated mobile UAT user:', email);
    }
}

async function upsertSubAdmin() {
    const email = UAT_SUBADMIN.email.toLowerCase();
    const hash = await bcrypt.hash(UAT_SUBADMIN.password, 10);
    let user = await User.findOne({ email }).select('+password');
    if (!user) {
        await User.create({
            email,
            password: hash,
            name: UAT_SUBADMIN.name,
            role: UAT_SUBADMIN.role,
            state: UAT_SUBADMIN.state,
            city: UAT_SUBADMIN.city,
            country: UAT_SUBADMIN.country,
            accountStatus: UAT_SUBADMIN.accountStatus,
        });
        console.log('Created sub-admin UAT user:', email);
    } else {
        user.password = hash;
        user.role = UAT_SUBADMIN.role;
        user.accountStatus = UAT_SUBADMIN.accountStatus;
        await user.save();
        console.log('Updated sub-admin UAT user:', email);
    }
}

async function main() {
    await connectDB();
    await upsertMobileUser();
    await upsertSubAdmin();
    console.log('UAT bootstrap complete.');
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
