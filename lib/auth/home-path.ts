/**
 * Canonical post-login home paths by role.
 * Shared by middleware + client nav so routing stays consistent.
 */
export function homePathForRole(role: string | null | undefined): string {
    const r = String(role ?? '').toLowerCase().trim();
    if (r === 'super-admin') return '/super-admin-dashboard';
    if (r === 'eoc-manager' || r === 'eoc-observer') return '/virtual-eoc';
    if (r === 'responder' || r === 'public_official') return '/responder-dashboard';
    if (
        r === 'admin' ||
        r === 'sub-admin' ||
        r === 'observer' ||
        r === 'manager'
    ) {
        return '/admin-dashboard';
    }
    if (r === 'user') return '/user-dashboard';
    return '/login';
}

export function isApprovedStatus(status: string | null | undefined): boolean {
    const s = String(status ?? '').toLowerCase().trim();
    // Treat missing status as approved when a valid session JWT exists —
    // older sessions sometimes lack the separate accountStatus cookie.
    return !s || s === 'approved';
}

export function isPendingStatus(status: string | null | undefined): boolean {
    return String(status ?? '').toLowerCase().trim() === 'pending';
}
