'use client';

import { useEffect, useState } from 'react';
import type { MapBoundsPayload } from '@/lib/hooks/admin-map-queries';

/** Debounce map bounds so layer API queries do not fire on every pan frame. */
export function useDebouncedMapBounds(
    bounds: MapBoundsPayload | null,
    delayMs = 350,
): MapBoundsPayload | null {
    const [debounced, setDebounced] = useState(bounds);

    useEffect(() => {
        if (!bounds) {
            setDebounced(null);
            return;
        }
        const timer = setTimeout(() => setDebounced(bounds), delayMs);
        return () => clearTimeout(timer);
    }, [bounds, delayMs]);

    return debounced;
}
