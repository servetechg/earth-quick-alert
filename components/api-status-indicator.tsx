// API Status Indicator Component - Show connection status for APIs

'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CloudRain, Activity, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface APIStatus {
    service: 'weather' | 'earthquake';
    status: 'connected' | 'error' | 'disconnected';
    lastUpdate: string;
    errorMessage?: string;
}

export function APIStatusIndicator() {
    const [weatherStatus, setWeatherStatus] = useState<APIStatus>({
        service: 'weather',
        status: 'connected',
        lastUpdate: new Date().toISOString(),
    });

    const [earthquakeStatus, setEarthquakeStatus] = useState<APIStatus>({
        service: 'earthquake',
        status: 'connected',
        lastUpdate: new Date().toISOString(),
    });

    const [checking, setChecking] = useState(false);

    const checkAPIStatus = async () => {
        setChecking(true);

        try {
            // Check earthquake API
            const earthquakeResponse = await fetch('/api/alerts/earthquake?timeframe=hour&minMagnitude=1.0');
            if (earthquakeResponse.ok) {
                setEarthquakeStatus({
                    service: 'earthquake',
                    status: 'connected',
                    lastUpdate: new Date().toISOString(),
                });
            } else {
                setEarthquakeStatus({
                    service: 'earthquake',
                    status: 'error',
                    lastUpdate: new Date().toISOString(),
                    errorMessage: 'Failed to connect',
                });
            }
        } catch (error) {
            setEarthquakeStatus({
                service: 'earthquake',
                status: 'disconnected',
                lastUpdate: new Date().toISOString(),
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
            });
        }

        try {
            // Check weather API (using default location)
            const weatherResponse = await fetch('/api/alerts/weather?lat=37.7749&lon=-122.4194');
            if (weatherResponse.ok) {
                setWeatherStatus({
                    service: 'weather',
                    status: 'connected',
                    lastUpdate: new Date().toISOString(),
                });
            } else {
                setWeatherStatus({
                    service: 'weather',
                    status: 'error',
                    lastUpdate: new Date().toISOString(),
                    errorMessage: 'Failed to connect',
                });
            }
        } catch (error) {
            setWeatherStatus({
                service: 'weather',
                status: 'disconnected',
                lastUpdate: new Date().toISOString(),
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
            });
        }

        setChecking(false);
    };

    useEffect(() => {
        checkAPIStatus();

        // Check every 5 minutes
        const interval = setInterval(checkAPIStatus, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const getStatusBadge = (status: APIStatus['status']) => {
        switch (status) {
            case 'connected':
                return (
                    <Badge className="bg-green-500 text-white">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Connected
                    </Badge>
                );
            case 'error':
                return (
                    <Badge className="bg-yellow-500 text-white">
                        <XCircle className="h-3 w-3 mr-1" />
                        Error
                    </Badge>
                );
            case 'disconnected':
                return (
                    <Badge className="bg-red-500 text-white">
                        <XCircle className="h-3 w-3 mr-1" />
                        Disconnected
                    </Badge>
                );
        }
    };

    return (
        <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">API Status</h3>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={checkAPIStatus}
                    disabled={checking}
                >
                    <RefreshCw className={`mr-2 h-4 w-4 text-[#33375D] ${checking ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            <div className="space-y-3">
                {/* Earthquake API Status */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                        <Activity className="h-5 w-5 text-orange-500" />
                        <div>
                            <p className="font-medium text-sm">Earthquake API</p>
                            <p className="text-xs text-muted-foreground">
                                USGS Real-time Data
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        {getStatusBadge(earthquakeStatus.status)}
                        <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(earthquakeStatus.lastUpdate), { addSuffix: true })}
                        </p>
                    </div>
                </div>

                {/* Weather API Status */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                        <CloudRain className="h-5 w-5 text-blue-500" />
                        <div>
                            <p className="font-medium text-sm">Weather API</p>
                            <p className="text-xs text-muted-foreground">
                                OpenWeatherMap
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        {getStatusBadge(weatherStatus.status)}
                        <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(weatherStatus.lastUpdate), { addSuffix: true })}
                        </p>
                    </div>
                </div>
            </div>

            {/* Error messages */}
            {(weatherStatus.errorMessage || earthquakeStatus.errorMessage) && (
                <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-500">
                    {weatherStatus.errorMessage && <p>Weather: {weatherStatus.errorMessage}</p>}
                    {earthquakeStatus.errorMessage && <p>Earthquake: {earthquakeStatus.errorMessage}</p>}
                </div>
            )}
        </Card>
    );
}
