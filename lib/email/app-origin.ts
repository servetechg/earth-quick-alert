export function getAppOrigin(): string {
    if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
        return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, '');
    }
    if (process.env.RENDER_EXTERNAL_URL?.trim()) {
        return process.env.RENDER_EXTERNAL_URL.trim().replace(/\/$/, '');
    }
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`;
    }
    if (process.env.NODE_ENV === 'production') {
        return 'https://earthquickalert.vercel.app';
    }
    return 'http://localhost:3000';
}

export function buildResponderSignupUrl(token: string): string {
    return `${getAppOrigin()}/signup?responderInvite=${encodeURIComponent(token)}`;
}
