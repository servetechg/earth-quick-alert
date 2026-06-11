import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { profileIncompleteReminderDelayMs } from '@/lib/config/profile-incomplete-reminder';
import { sendProfileIncompleteReminderEmail } from '@/lib/email/profile-incomplete-reminder-send';
import { sendExpoPushNotification } from '@/lib/services/mobile/expo-push-service';

const MOBILE_ROLE = 'user';

/** Schedule reminder after OTP verification when onboarding is still incomplete. */
export async function scheduleProfileIncompleteReminder(userId: string): Promise<void> {
    await connectDB();
    const delayMs = profileIncompleteReminderDelayMs();
    const dueAt = new Date(Date.now() + delayMs);

    await User.updateOne(
        {
            _id: userId,
            role: MOBILE_ROLE,
            emailVerified: true,
            profileComplete: false,
            profileIncompleteReminderSentAt: null,
        },
        { $set: { profileIncompleteReminderDueAt: dueAt } },
    );
}

export type ProfileIncompleteReminderResult = {
    scanned: number;
    emailed: number;
    pushed: number;
    skipped: number;
    errors: number;
};

export async function processProfileIncompleteReminders(): Promise<ProfileIncompleteReminderResult> {
    await connectDB();

    const delayMs = profileIncompleteReminderDelayMs();
    const now = new Date();
    const legacyCutoff = new Date(Date.now() - delayMs);

    const candidates = await User.find({
        role: MOBILE_ROLE,
        emailVerified: true,
        profileComplete: false,
        profileIncompleteReminderSentAt: null,
        $or: [
            { profileIncompleteReminderDueAt: { $lte: now } },
            {
                profileIncompleteReminderDueAt: null,
                createdAt: { $lte: legacyCutoff },
            },
        ],
    })
        .select('_id email firstName emailVerified expoPushToken profileComplete')
        .lean();

    const result: ProfileIncompleteReminderResult = {
        scanned: candidates.length,
        emailed: 0,
        pushed: 0,
        skipped: 0,
        errors: 0,
    };

    for (const user of candidates) {
        const userId = user._id.toString();

        const fresh = await User.findById(userId).select('profileComplete').lean();
        if (!fresh || fresh.profileComplete) {
            result.skipped += 1;
            continue;
        }

        let emailSent = false;
        let pushSent = false;
        let hadError = false;

        try {
            emailSent = await sendProfileIncompleteReminderEmail(
                user.email,
                user.firstName ?? '',
            );
            if (emailSent) result.emailed += 1;
        } catch (e) {
            hadError = true;
            console.error('profile-incomplete-reminder email:', userId, e);
        }

        const pushToken = user.expoPushToken?.trim();
        if (pushToken) {
            try {
                const push = await sendExpoPushNotification({
                    to: pushToken,
                    title: 'Complete your Ready2Go profile 🚨',
                    body: 'Finish onboarding so we can help you during emergencies.',
                    data: { screen: 'Onboarding' },
                });
                if (push.ok) {
                    pushSent = true;
                    result.pushed += 1;
                } else if (push.error) {
                    hadError = true;
                    console.error('profile-incomplete-reminder push:', userId, push.error);
                }
            } catch (e) {
                hadError = true;
                console.error('profile-incomplete-reminder push:', userId, e);
            }
        }

        if (!emailSent && !pushSent && !hadError) {
            result.skipped += 1;
            continue;
        }

        if (hadError && !emailSent && !pushSent) {
            result.errors += 1;
            continue;
        }

        await User.updateOne(
            { _id: userId, profileComplete: false, profileIncompleteReminderSentAt: null },
            { $set: { profileIncompleteReminderSentAt: new Date() } },
        );
    }

    return result;
}

export async function saveExpoPushToken(userId: string, expoPushToken: string): Promise<void> {
    await connectDB();
    await User.updateOne(
        { _id: userId, role: MOBILE_ROLE },
        { $set: { expoPushToken: expoPushToken.trim() } },
    );
}

export async function clearExpoPushToken(userId: string): Promise<void> {
    await connectDB();
    await User.updateOne({ _id: userId }, { $set: { expoPushToken: '' } });
}
