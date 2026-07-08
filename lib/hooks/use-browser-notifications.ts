'use client';

import { useEffect, useRef } from 'react';
import type { UserNotificationItem } from '@/lib/notifications/types';

const SHOWN_IDS_KEY = 'r2g-shown-desktop-notifications';

function loadShownIds(): Set<string> {
    if (typeof window === 'undefined') return new Set();
    try {
        const raw = sessionStorage.getItem(SHOWN_IDS_KEY);
        if (!raw) return new Set();
        return new Set(JSON.parse(raw) as string[]);
    } catch {
        return new Set();
    }
}

function saveShownIds(ids: Set<string>) {
    if (typeof window === 'undefined') return;
    const trimmed = [...ids].slice(-100);
    sessionStorage.setItem(SHOWN_IDS_KEY, JSON.stringify(trimmed));
}

/**
 * Shows native browser notifications for new unread inbox items (web admins).
 * Requires permission; requests once when user has unread items.
 */
export function useBrowserDesktopNotifications(
    items: UserNotificationItem[] | undefined,
    enabled: boolean,
) {
    const shownRef = useRef<Set<string>>(loadShownIds());

    useEffect(() => {
        if (!enabled || typeof window === 'undefined' || !('Notification' in window)) return;
        if (!items?.length) return;

        const unread = items.filter((n) => !n.read);
        if (unread.length === 0) return;

        const showNew = async () => {
            if (Notification.permission === 'default') {
                await Notification.requestPermission().catch(() => 'denied');
            }
            if (Notification.permission !== 'granted') return;

            for (const item of unread) {
                if (shownRef.current.has(item.id)) continue;
                shownRef.current.add(item.id);
                try {
                    new Notification(item.title, {
                        body: item.body,
                        tag: item.id,
                        icon: '/logo.png',
                    });
                } catch {
                    /* ignore */
                }
            }
            saveShownIds(shownRef.current);
        };

        void showNew();
    }, [items, enabled]);
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return 'unsupported';
    }
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return Notification.requestPermission();
}
