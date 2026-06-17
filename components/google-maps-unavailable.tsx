'use client'

import { MapPinOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export type GoogleMapsUnavailableReason =
    | 'missing-key'
    | 'invalid-key'
    | 'load-failed'
    | 'runtime-error'

const COPY: Record<
    GoogleMapsUnavailableReason,
    { title: string; description: string }
> = {
    'missing-key': {
        title: 'Google Maps unavailable',
        description:
            'A Google Maps API key is not configured. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your environment to enable the map.',
    },
    'invalid-key': {
        title: 'Google Maps unavailable',
        description:
            'The Google Maps API key appears invalid or restricted for this site. Check your Google Cloud Console key settings.',
    },
    'load-failed': {
        title: 'Google Maps unavailable',
        description:
            'Google Maps could not be loaded. Verify your API key, billing, and network connection.',
    },
    'runtime-error': {
        title: 'Oops! Something went wrong',
        description:
            'The map could not be displayed. Other dashboard data is still available below.',
    },
}

interface GoogleMapsUnavailableProps {
    reason?: GoogleMapsUnavailableReason
    className?: string
}

export function GoogleMapsUnavailable({
    reason = 'runtime-error',
    className,
}: GoogleMapsUnavailableProps) {
    const { title, description } = COPY[reason]

    return (
        <div
            className={cn(
                'w-full h-full min-h-[400px] rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-3 px-6 text-center',
                className,
            )}
            role="status"
            aria-live="polite"
        >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white border border-slate-200 shadow-sm">
                <MapPinOff className="h-7 w-7 text-slate-400" aria-hidden />
            </div>
            <div className="max-w-md space-y-1.5">
                <p className="text-sm font-black uppercase tracking-widest text-slate-600">
                    {title}
                </p>
                <p className="text-xs font-medium leading-relaxed text-slate-500">
                    {description}
                </p>
            </div>
        </div>
    )
}
