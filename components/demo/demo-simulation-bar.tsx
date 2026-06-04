'use client';

import { useCallback, useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useUser } from '@/lib/store/user-store';
import { DEMO_PRESENTATION_EMAIL } from '@/lib/demo/constants';
import { FlaskConical, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function DemoSimulationBar() {
    const { me } = useUser();
    const [eligible, setEligible] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [scenarioTitle, setScenarioTitle] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (me?.email?.toLowerCase() !== DEMO_PRESENTATION_EMAIL) {
            setEligible(false);
            setEnabled(false);
            setLoading(false);
            return;
        }
        try {
            const res = await fetch('/api/demo/mode', { cache: 'no-store', credentials: 'include' });
            const data = await res.json();
            setEligible(Boolean(data.eligible));
            setEnabled(Boolean(data.enabled));
            setScenarioTitle(String(data.scenarioTitle ?? ''));
        } catch {
            setEligible(false);
        } finally {
            setLoading(false);
        }
    }, [me?.email]);

    useEffect(() => {
        void load();
    }, [load]);

    const onToggle = async (next: boolean) => {
        setSaving(true);
        try {
            const res = await fetch('/api/demo/mode', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: next }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Could not update demo mode');
                return;
            }
            setEnabled(Boolean(data.enabled));
            toast.success(next ? 'Demo simulation enabled' : 'Live data restored');
            window.location.reload();
        } catch {
            toast.error('Could not update demo mode');
        } finally {
            setSaving(false);
        }
    };

    if (loading || !eligible) return null;

    return (
        <div
            className={
                enabled
                    ? 'border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-amber-950'
                    : 'border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-700'
            }
        >
            <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                    <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-sm font-semibold">
                            {enabled ? 'Presentation mode — simulated Arkansas event' : 'Arkansas presentation demo available'}
                        </p>
                        {enabled && scenarioTitle ? (
                            <p className="truncate text-xs opacity-90">{scenarioTitle}</p>
                        ) : (
                            <p className="text-xs opacity-80">
                                Toggle on to simulate the March 31, 2023 Little Rock EF-3 tornado across your dashboard.
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Label htmlFor="demo-simulation-switch" className="text-xs font-medium">
                        Demo simulation
                    </Label>
                    <Switch
                        id="demo-simulation-switch"
                        checked={enabled}
                        disabled={saving}
                        onCheckedChange={onToggle}
                    />
                </div>
            </div>
        </div>
    );
}
