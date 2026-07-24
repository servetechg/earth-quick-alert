const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type ExpoPushPayload = {
    to: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    sound?: 'default' | null;
    /** Android notification channel id (must match a channel created on the device). */
    channelId?: string;
    priority?: 'default' | 'normal' | 'high';
};

type ExpoTicket = {
    status?: string;
    message?: string;
    details?: { error?: string };
};

function normalizeTickets(data: unknown): ExpoTicket[] {
    if (!data || typeof data !== 'object') return [];
    const root = data as { data?: ExpoTicket | ExpoTicket[] };
    if (Array.isArray(root.data)) return root.data;
    if (root.data && typeof root.data === 'object') return [root.data];
    return [];
}

export async function sendExpoPushNotification(
    payload: ExpoPushPayload,
): Promise<{ ok: boolean; error?: string }> {
    const token = payload.to?.trim();
    if (!token) {
        return { ok: false, error: 'Missing push token' };
    }

    try {
        const body: Record<string, unknown> = {
            to: token,
            title: payload.title,
            body: payload.body,
            data: payload.data ?? {},
            sound: payload.sound ?? 'default',
        };
        if (payload.channelId) body.channelId = payload.channelId;
        if (payload.priority) body.priority = payload.priority;

        const res = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const raw = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { ok: false, error: `Expo push HTTP ${res.status}` };
        }

        const tickets = normalizeTickets(raw);
        const errored = tickets.find((t) => t.status === 'error');
        if (errored) {
            return {
                ok: false,
                error: errored.message ?? errored.details?.error ?? 'Expo push error',
            };
        }

        // Expo may return an empty body on some edge cases — treat as failure.
        if (tickets.length === 0) {
            return { ok: false, error: 'Expo push returned no ticket' };
        }

        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Expo push failed' };
    }
}
