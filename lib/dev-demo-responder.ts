import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';

export const DEV_DEMO_RESPONDER_EMAIL = 'responder.demo@local.test';
export const DEV_DEMO_RESPONDER_PASSWORD = 'ResponderDemo2026!';
const DEMO_NAME = 'Demo Hospital Responder';

/** Idempotent demo account for local dev only. */
export async function upsertDevDemoResponder(): Promise<void> {
    if (process.env.NODE_ENV === 'production') return;

    await connectDB();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(DEV_DEMO_RESPONDER_PASSWORD, salt);

    const existing = await User.findOne({ email: DEV_DEMO_RESPONDER_EMAIL }).select('+password');
    if (existing) {
        existing.password = hashedPassword;
        existing.role = 'responder';
        existing.responderVertical = 'hospital';
        existing.responderFunction = 'County hospital (demo)';
        existing.accountStatus = 'approved';
        await existing.save();
        return;
    }

    await User.create({
        name: DEMO_NAME,
        email: DEV_DEMO_RESPONDER_EMAIL,
        password: hashedPassword,
        role: 'responder',
        responderVertical: 'hospital',
        responderFunction: 'County hospital (demo)',
        accountStatus: 'approved',
        licenseId: null,
    });
}

export function isDevDemoResponderAttempt(email: string, password: string): boolean {
    if (process.env.NODE_ENV === 'production') return false;
    const e = String(email).toLowerCase().trim();
    return e === DEV_DEMO_RESPONDER_EMAIL && password === DEV_DEMO_RESPONDER_PASSWORD;
}
