import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import AuthOtp from '@/models/AuthOtp';
import type { OtpPurpose } from '@/lib/types/mobile/auth';
import { sendOtpEmail } from '@/lib/email/auth-otp-send';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_LOCK_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function generateOtpCode(): string {
    return String(crypto.randomInt(100000, 1000000));
}

export async function sendOtp(
    email: string,
    purpose: OtpPurpose,
): Promise<{ expiresInSeconds: number; message: string }> {
    const normalized = email.toLowerCase().trim();
    const now = new Date();

    let record = await AuthOtp.findOne({ email: normalized, purpose });
    if (record?.lockedUntil && record.lockedUntil.getTime() > now.getTime()) {
        const err = new Error('OTP_LOCKED') as Error & { status: number };
        err.status = 429;
        throw err;
    }

    if (record?.rateWindowStart) {
        const windowActive = now.getTime() - record.rateWindowStart.getTime() < RATE_LIMIT_WINDOW_MS;
        if (windowActive && (record.sendCountInWindow ?? 0) >= RATE_LIMIT_COUNT) {
            const err = new Error('OTP_RATE_LIMIT') as Error & { status: number };
            err.status = 429;
            throw err;
        }
    }

    const windowExpired =
        !record?.rateWindowStart ||
        now.getTime() - record.rateWindowStart.getTime() >= RATE_LIMIT_WINDOW_MS;
    const sendCountInWindow = windowExpired ? 1 : (record?.sendCountInWindow ?? 0) + 1;
    const rateWindowStart = windowExpired ? now : record!.rateWindowStart!;

    const code = generateOtpCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

    await AuthOtp.findOneAndUpdate(
        { email: normalized, purpose },
        {
            $set: {
                codeHash,
                expiresAt,
                attempts: 0,
                lockedUntil: null,
                lastSentAt: now,
                sendCountInWindow,
                rateWindowStart,
            },
        },
        { upsert: true, new: true },
    );

    await sendOtpEmail(normalized, code, purpose);

    return { message: 'Code sent', expiresInSeconds: Math.floor(OTP_TTL_MS / 1000) };
}

export async function verifyOtp(
    email: string,
    code: string,
    purpose: OtpPurpose,
): Promise<{ ok: true } | { ok: false; code: string; status: number }> {
    const normalized = email.toLowerCase().trim();
    const record = await AuthOtp.findOne({ email: normalized, purpose });
    const now = new Date();

    if (!record) {
        return { ok: false, code: 'INVALID_OTP', status: 400 };
    }

    if (record.lockedUntil && record.lockedUntil.getTime() > now.getTime()) {
        return { ok: false, code: 'OTP_LOCKED', status: 429 };
    }

    if (record.expiresAt.getTime() < now.getTime()) {
        return { ok: false, code: 'INVALID_OTP', status: 400 };
    }

    const match = await bcrypt.compare(code, record.codeHash);
    if (!match) {
        record.attempts += 1;
        if (record.attempts >= MAX_ATTEMPTS) {
            record.lockedUntil = new Date(now.getTime() + OTP_LOCK_MS);
        }
        await record.save();
        return {
            ok: false,
            code: record.attempts >= MAX_ATTEMPTS ? 'OTP_LOCKED' : 'INVALID_OTP',
            status: record.attempts >= MAX_ATTEMPTS ? 429 : 400,
        };
    }

    await AuthOtp.deleteOne({ _id: record._id });
    return { ok: true };
}
