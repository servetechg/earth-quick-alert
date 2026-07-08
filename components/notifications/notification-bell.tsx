'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Activity,
    Bell,
    CheckCheck,
    HeartPulse,
    Loader2,
    ScrollText,
    ShieldAlert,
    Sparkles,
    Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    useAdminNotifications,
    useMarkAllNotificationsRead,
    useMarkNotificationRead,
} from '@/lib/hooks/use-notifications';
import { useBrowserDesktopNotifications } from '@/lib/hooks/use-browser-notifications';
import type { NotificationType, UserNotificationItem } from '@/lib/notifications/types';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const TYPE_ICONS: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
    citizen_activity: Activity,
    citizen_report_resolved: CheckCheck,
    alert_dispatched: ShieldAlert,
    disaster_survey: ScrollText,
    ai_report: Sparkles,
    responder_approval: Users,
    system: Bell,
};

const PRIORITY_STYLES: Record<UserNotificationItem['priority'], string> = {
    critical: 'border-l-red-500',
    high: 'border-l-amber-500',
    normal: 'border-l-slate-300',
    low: 'border-l-emerald-400',
};

function NotificationRow({
    item,
    onOpen,
}: {
    item: UserNotificationItem;
    onOpen: (item: UserNotificationItem) => void;
}) {
    const Icon = TYPE_ICONS[item.type] ?? Bell;
    return (
        <button
            type="button"
            onClick={() => onOpen(item)}
            className={cn(
                'flex w-full gap-3 border-l-4 px-3 py-3 text-left transition-colors hover:bg-slate-50',
                PRIORITY_STYLES[item.priority],
                !item.read && 'bg-slate-50/80',
            )}
        >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#33375D]/10 text-[#33375D]">
                <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                    <span
                        className={cn(
                            'text-sm leading-snug text-slate-900',
                            !item.read && 'font-bold',
                        )}
                    >
                        {item.title}
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold text-slate-400">
                        {item.displayTime}
                    </span>
                </span>
                <span className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.body}</span>
            </span>
            {!item.read ? (
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-hidden />
            ) : null}
        </button>
    );
}

export function NotificationBell() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const { data, isLoading, isFetching } = useAdminNotifications(25);
    const markRead = useMarkNotificationRead();
    const markAllRead = useMarkAllNotificationsRead();

    const items = data?.items ?? [];
    const unreadCount = data?.unreadCount ?? 0;

    useBrowserDesktopNotifications(items, true);

    const badgeLabel = useMemo(() => {
        if (unreadCount <= 0) return null;
        if (unreadCount > 99) return '99+';
        return String(unreadCount);
    }, [unreadCount]);

    const handleOpenItem = useCallback(
        (item: UserNotificationItem) => {
            if (!item.read) {
                void markRead.mutateAsync(item.id).catch(() => {});
            }
            setOpen(false);
            if (item.deepLink?.startsWith('/')) {
                router.push(item.deepLink);
            }
        },
        [markRead, router],
    );

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="relative rounded-xl p-2 transition-colors hover:bg-slate-50"
                    aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                >
                    <Bell fill="#33375D" size={22} className="text-slate-900" />
                    {badgeLabel ? (
                        <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white bg-rose-600 px-0.5 text-[9px] font-black text-white">
                            {badgeLabel}
                        </span>
                    ) : null}
                    {isFetching && !isLoading ? (
                        <span className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    ) : null}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-[min(100vw-2rem,380px)] rounded-2xl border-slate-200 p-0 shadow-xl"
                sideOffset={8}
            >
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <DropdownMenuLabel className="p-0 text-sm font-black text-slate-900">
                        Notifications
                    </DropdownMenuLabel>
                    {unreadCount > 0 ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-lg text-[11px] font-bold text-[#33375D]"
                            disabled={markAllRead.isPending}
                            onClick={() => void markAllRead.mutateAsync()}
                        >
                            Mark all read
                        </Button>
                    ) : null}
                </div>

                <div className="max-h-[min(60vh,420px)] overflow-y-auto">
                    {isLoading ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading…
                        </div>
                    ) : items.length === 0 ? (
                        <div className="px-4 py-10 text-center">
                            <HeartPulse className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                            <p className="text-sm font-semibold text-slate-700">You&apos;re all caught up</p>
                            <p className="mt-1 text-xs text-slate-500">
                                Citizen reports and system updates will appear here.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {items.map((item) => (
                                <NotificationRow key={item.id} item={item} onOpen={handleOpenItem} />
                            ))}
                        </div>
                    )}
                </div>

                {items.length > 0 ? (
                    <>
                        <DropdownMenuSeparator className="m-0" />
                        <DropdownMenuItem
                            className="cursor-pointer justify-center rounded-none py-3 text-center text-xs font-bold text-[#33375D]"
                            onSelect={() => {
                                setOpen(false);
                                router.push('/citizen-activity-feed');
                            }}
                        >
                            View citizen activity feed
                        </DropdownMenuItem>
                    </>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
