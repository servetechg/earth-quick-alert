'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserNotificationItem, UserNotificationListResponse } from '@/lib/notifications/types';

const NOTIFICATIONS_QUERY_KEY = ['admin-notifications'] as const;

async function fetchNotifications(limit = 30): Promise<UserNotificationListResponse> {
    const res = await fetch(`/api/admin/notifications?limit=${limit}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load notifications');
    return res.json() as Promise<UserNotificationListResponse>;
}

export function useAdminNotifications(limit = 30) {
    return useQuery({
        queryKey: [...NOTIFICATIONS_QUERY_KEY, limit],
        queryFn: () => fetchNotifications(limit),
        refetchInterval: 30_000,
        refetchOnWindowFocus: true,
    });
}

export function useMarkNotificationRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/admin/notifications/${id}/read`, { method: 'PATCH' });
            if (!res.ok) throw new Error('Failed to mark read');
            return res.json() as Promise<{ item: UserNotificationItem; unreadCount: number }>;
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
        },
    });
}

export function useMarkAllNotificationsRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/admin/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'mark_all_read' }),
            });
            if (!res.ok) throw new Error('Failed to mark all read');
            return res.json();
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
        },
    });
}
