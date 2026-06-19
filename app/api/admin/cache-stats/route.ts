import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getCacheMetrics } from '@/lib/cache/cache-metrics';
import { isRedisConfigured } from '@/lib/cache/redis-backend';

export async function GET() {
    try {
        const session = await getSession();
        const role = String(session?.user?.role ?? '').toLowerCase();
        if (!session?.user?.id || (role !== 'super-admin' && role !== 'admin')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        return NextResponse.json({
            redisConfigured: isRedisConfigured(),
            metrics: getCacheMetrics(),
        });
    } catch (error) {
        console.error('cache-stats error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
