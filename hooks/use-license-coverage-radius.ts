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
            if (!address.trim()) {
                if (fallbacks.stateName) {
                    await fetchCoverageMax({
                        stateName: fallbacks.stateName,
                        countryName: fallbacks.countryName,
                    });
                }
                return;
            }

            try {
                const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || '9abe9caf7f5943d189e9ef564c5cdec7';
                const res = await fetch(
                    `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(address)}&apiKey=${apiKey}`
                );
                if (res.ok) {
                    const data = await res.json();
                    const feature = data.features?.[0];
                    const props = feature?.properties;
                    if (props?.lat && props?.lon) {
                        onCenter?.({ lat: Number(props.lat), lng: Number(props.lon) });
                    }
                    const stateName = props?.state || fallbacks.stateName;
                    const countryName = props?.country || fallbacks.countryName;
                    await fetchCoverageMax({
                        stateName: stateName,
                        countryName: countryName,
                    });
                    return {
                        stateName: stateName || '',
                        countryName: countryName || '',
                        stateCode: props?.state_code || '',
                        countryCode: props?.country_code || '',
                    };
                }
            } catch (err) {
                console.error('Geoapify geocoding error:', err);
            }

            if (fallbacks.stateName) {
                await fetchCoverageMax({
                    stateName: fallbacks.stateName,
                    countryName: fallbacks.countryName,
                });
            }
            return null;
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
