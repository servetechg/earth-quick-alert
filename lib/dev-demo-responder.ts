import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';

export const DEV_DEMO_RESPONDER_EMAIL = 'responder.demo@local.test';
export const DEV_DEMO_RESPONDER_PASSWORD = 'ResponderDemo2026!';
const DEMO_HOSPITAL_NAME = 'Demo Hospital Responder';

/** Police vertical — same dashboard kind as law enforcement responders. */
export const DEV_DEMO_POLICE_RESPONDER_EMAIL = 'police.responder.demo@local.test';
export const DEV_DEMO_POLICE_RESPONDER_PASSWORD = 'PoliceResponderDemo2026!';
const DEMO_POLICE_NAME = 'Demo Police Responder';

/** Pharmacy vertical — GIS pop-up pharmacy / resource deployment (demo). */
export const DEV_DEMO_PHARMACY_RESPONDER_EMAIL = 'pharmacy.responder.demo@local.test';
export const DEV_DEMO_PHARMACY_RESPONDER_PASSWORD = 'PharmacyResponderDemo2026!';
const DEMO_PHARMACY_NAME = 'Demo Pharmacy Responder';

/** Public transportation vertical — mass transit + vehicles deployed (demo). */
export const DEV_DEMO_TRANSIT_RESPONDER_EMAIL = 'transit.responder.demo@local.test';
export const DEV_DEMO_TRANSIT_RESPONDER_PASSWORD = 'TransitResponderDemo2026!';
const DEMO_TRANSIT_NAME = 'Demo Transit Responder';

/** Idempotent demo account for local dev only (hospital vertical). */
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
        name: DEMO_HOSPITAL_NAME,
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

/** Idempotent demo account for local dev only (police vertical). */
export async function upsertDevDemoPoliceResponder(): Promise<void> {
    if (process.env.NODE_ENV === 'production') return;

    await connectDB();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(DEV_DEMO_POLICE_RESPONDER_PASSWORD, salt);

    const existing = await User.findOne({ email: DEV_DEMO_POLICE_RESPONDER_EMAIL }).select('+password');
    if (existing) {
        existing.password = hashedPassword;
        existing.role = 'responder';
        existing.responderVertical = 'police';
        existing.responderFunction = 'County PD / HQ (demo)';
        existing.accountStatus = 'approved';
        await existing.save();
        return;
    }

    await User.create({
        name: DEMO_POLICE_NAME,
        email: DEV_DEMO_POLICE_RESPONDER_EMAIL,
        password: hashedPassword,
        role: 'responder',
        responderVertical: 'police',
        responderFunction: 'County PD / HQ (demo)',
        accountStatus: 'approved',
        licenseId: null,
    });
}

export function isDevDemoPoliceResponderAttempt(email: string, password: string): boolean {
    if (process.env.NODE_ENV === 'production') return false;
    const e = String(email).toLowerCase().trim();
    return e === DEV_DEMO_POLICE_RESPONDER_EMAIL && password === DEV_DEMO_POLICE_RESPONDER_PASSWORD;
}

/** Idempotent demo account for local dev only (pharmacy vertical). */
export async function upsertDevDemoPharmacyResponder(): Promise<void> {
    if (process.env.NODE_ENV === 'production') return;

    await connectDB();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(DEV_DEMO_PHARMACY_RESPONDER_PASSWORD, salt);

    const existing = await User.findOne({ email: DEV_DEMO_PHARMACY_RESPONDER_EMAIL }).select('+password');
    if (existing) {
        existing.password = hashedPassword;
        existing.role = 'responder';
        existing.responderVertical = 'pharmacy';
        existing.responderFunction = 'County Rx resource deployment (demo)';
        existing.accountStatus = 'approved';
        await existing.save();
        return;
    }

    await User.create({
        name: DEMO_PHARMACY_NAME,
        email: DEV_DEMO_PHARMACY_RESPONDER_EMAIL,
        password: hashedPassword,
        role: 'responder',
        responderVertical: 'pharmacy',
        responderFunction: 'County Rx resource deployment (demo)',
        accountStatus: 'approved',
        licenseId: null,
    });
}

export function isDevDemoPharmacyResponderAttempt(email: string, password: string): boolean {
    if (process.env.NODE_ENV === 'production') return false;
    const e = String(email).toLowerCase().trim();
    return e === DEV_DEMO_PHARMACY_RESPONDER_EMAIL && password === DEV_DEMO_PHARMACY_RESPONDER_PASSWORD;
}

/** Idempotent demo account for local dev only (transit vertical). */
export async function upsertDevDemoTransitResponder(): Promise<void> {
    if (process.env.NODE_ENV === 'production') return;

    await connectDB();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(DEV_DEMO_TRANSIT_RESPONDER_PASSWORD, salt);

    const existing = await User.findOne({ email: DEV_DEMO_TRANSIT_RESPONDER_EMAIL }).select('+password');
    if (existing) {
        existing.password = hashedPassword;
        existing.role = 'responder';
        existing.responderVertical = 'transit';
        existing.responderFunction = 'Regional mass transit (demo)';
        existing.accountStatus = 'approved';
        await existing.save();
        return;
    }

    await User.create({
        name: DEMO_TRANSIT_NAME,
        email: DEV_DEMO_TRANSIT_RESPONDER_EMAIL,
        password: hashedPassword,
        role: 'responder',
        responderVertical: 'transit',
        responderFunction: 'Regional mass transit (demo)',
        accountStatus: 'approved',
        licenseId: null,
    });
}

export function isDevDemoTransitResponderAttempt(email: string, password: string): boolean {
    if (process.env.NODE_ENV === 'production') return false;
    const e = String(email).toLowerCase().trim();
    return e === DEV_DEMO_TRANSIT_RESPONDER_EMAIL && password === DEV_DEMO_TRANSIT_RESPONDER_PASSWORD;
}
