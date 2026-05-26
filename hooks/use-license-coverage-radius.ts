'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { GOOGLE_MAPS_API_KEY } from '@/lib/constants/google-maps-config';
import {
    centerFromGeocodeGeometry,
    clampLicenseRadiusMile,
    parseRegionCodesFromGeocodeResult,
} from '@/lib/geo/license-coverage-radius';

export type CoverageRegionOpts = {
    stateCode?: string;
    countryCode?: string;
    stateName?: string;
    countryName?: string;
};

export function useLicenseCoverageRadius() {
    const [maxRadiusMile, setMaxRadiusMile] = useState<number | null>(null);
    const [hasStateCoverage, setHasStateCoverage] = useState(false);
    const [coverageLoading, setCoverageLoading] = useState(false);

    const resetCoverage = useCallback(() => {
        setMaxRadiusMile(null);
        setHasStateCoverage(false);
        setCoverageLoading(false);
    }, []);

    const fetchCoverageMax = useCallback(async (opts: CoverageRegionOpts) => {
        if (!opts.stateCode && !opts.stateName) {
            setHasStateCoverage(false);
            setMaxRadiusMile(null);
            return null;
        }

        setCoverageLoading(true);
        try {
            const params = new URLSearchParams();
            if (opts.stateCode) params.set('stateCode', opts.stateCode);
            if (opts.countryCode) params.set('countryCode', opts.countryCode);
            if (opts.stateName) params.set('stateName', opts.stateName);
            if (opts.countryName) params.set('countryName', opts.countryName);

            const res = await fetch(`/api/admin/coverage-max?${params.toString()}`);
            const data = await res.json();

            if (!res.ok) {
                setHasStateCoverage(false);
                setMaxRadiusMile(null);
                toast.error(data.error || 'Could not determine state coverage limit');
                return null;
            }

            const max = data.maxRadiusMile as number;
            setMaxRadiusMile(max);
            setHasStateCoverage(true);
            return max;
        } catch {
            setHasStateCoverage(false);
            setMaxRadiusMile(null);
            toast.error('Failed to load state coverage limit');
            return null;
        } finally {
            setCoverageLoading(false);
        }
    }, []);

    const clampRadius = useCallback(
        (radiusMile: number) =>
            clampLicenseRadiusMile(radiusMile, maxRadiusMile ?? radiusMile),
        [maxRadiusMile]
    );

    const geocodeAddressAndFetchCoverage = useCallback(
        async (
            address: string,
            fallbacks: { stateName?: string; countryName?: string },
            onCenter?: (center: { lat: number; lng: number }) => void
        ) => {
            if (!address.trim() || !GOOGLE_MAPS_API_KEY) {
                if (fallbacks.stateName) {
                    await fetchCoverageMax({
                        stateName: fallbacks.stateName,
                        countryName: fallbacks.countryName,
                    });
                }
                return;
            }

            try {
                const res = await fetch(
                    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`
                );
                const data = await res.json();
                const result = data.results?.[0];
                const center = centerFromGeocodeGeometry(result?.geometry);
                if (center) onCenter?.(center);

                const region = parseRegionCodesFromGeocodeResult(result ?? {});
                await fetchCoverageMax({
                    stateCode: region.stateCode || undefined,
                    countryCode: region.countryCode || undefined,
                    stateName: region.stateName || fallbacks.stateName,
                    countryName: region.countryName || fallbacks.countryName,
                });
                return region;
            } catch {
                if (fallbacks.stateName) {
                    await fetchCoverageMax({
                        stateName: fallbacks.stateName,
                        countryName: fallbacks.countryName,
                    });
                }
                return null;
            }
        },
        [fetchCoverageMax]
    );

    return {
        maxRadiusMile,
        hasStateCoverage,
        coverageLoading,
        fetchCoverageMax,
        resetCoverage,
        clampRadius,
        geocodeAddressAndFetchCoverage,
    };
}
