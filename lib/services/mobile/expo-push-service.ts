const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type ExpoPushPayload = {
    to: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    sound?: 'default' | null;
};

export async function sendExpoPushNotification(
    payload: ExpoPushPayload,
): Promise<{ ok: boolean; error?: string }> {
    const token = payload.to?.trim();
    if (!token) {
        return { ok: false, error: 'Missing push token' };
    }

    try {
        const res = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to: token,
                title: payload.title,
                body: payload.body,
                data: payload.data ?? {},
                sound: payload.sound ?? 'default',
            }),
        });

        const data = (await res.json().catch(() => ({}))) as {
            data?: { status?: string; message?: string }[];
        };

        if (!res.ok) {
            return { ok: false, error: `Expo push HTTP ${res.status}` };
        }

        const ticket = data.data?.[0];
        if (ticket?.status === 'error') {
            return { ok: false, error: ticket.message ?? 'Expo push error' };
        }

        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Expo push failed' };
    }
}
