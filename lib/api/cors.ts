import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Permissive CORS for mobile / Expo / external clients calling `/api/*`. */
const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
        'Content-Type, Authorization, X-Requested-With, Accept, Origin',
    'Access-Control-Max-Age': '86400',
};

export function applyCorsHeaders(response: NextResponse): NextResponse {
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
        response.headers.set(key, value);
    }
    return response;
}

export function corsPreflightResponse(): NextResponse {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export function isApiRoute(pathname: string): boolean {
    return pathname.startsWith('/api/');
}

export function handleApiCors(request: NextRequest): NextResponse | null {
    if (!isApiRoute(request.nextUrl.pathname)) return null;
    if (request.method === 'OPTIONS') {
        return corsPreflightResponse();
    }
    return applyCorsHeaders(NextResponse.next());
}
