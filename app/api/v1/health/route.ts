import { apiJson } from '@/lib/api/json-response';

export const dynamic = 'force-dynamic';

export async function GET() {
    return apiJson({ status: 'ok', service: 'ready2go-api-v1' });
}
