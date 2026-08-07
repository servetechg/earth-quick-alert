import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { handleApiCors } from '@/lib/api/cors'
import {
    homePathForRole,
    isApprovedStatus,
    isPendingStatus,
} from '@/lib/auth/home-path'

const SECRET_KEY = process.env.JWT_SECRET || 'ready2go-emergency-dashboard-secret-key-2026'
const key = new TextEncoder().encode(SECRET_KEY)

type SessionIdentity = {
    role: string
    accountStatus: string
}

async function resolveIdentity(request: NextRequest): Promise<SessionIdentity | null> {
    const raw = request.cookies.get('session')?.value
    if (!raw) return null

    try {
        const { payload } = await jwtVerify(raw, key, { algorithms: ['HS256'] })
        const user = (payload as { user?: Record<string, unknown> }).user
        if (!user || typeof user !== 'object') return null

        const role = String(user.role ?? request.cookies.get('userRole')?.value ?? '').trim()
        if (!role) return null

        const accountStatus = String(
            user.accountStatus ??
                request.cookies.get('accountStatus')?.value ??
                'approved',
        ).trim()

        return { role, accountStatus }
    } catch {
        // Invalid / expired JWT — treat as signed out.
        return null
    }
}

function redirectTo(request: NextRequest, path: string) {
    return NextResponse.redirect(new URL(path, request.url))
}

export async function middleware(request: NextRequest) {
    const apiCors = handleApiCors(request)
    if (apiCors) return apiCors

    const { pathname } = request.nextUrl
    const identity = await resolveIdentity(request)
    const cookieRole = request.cookies.get('userRole')?.value
    const cookieStatus = request.cookies.get('accountStatus')?.value

    // Prefer JWT claims; fall back to cookies only when JWT is absent/invalid.
    const userRole = identity?.role || cookieRole || ''
    const accountStatus = identity?.accountStatus || cookieStatus || ''
    const hasSession = Boolean(identity)

    // `/` — never show a blank landing for signed-in staff; send them home.
    if (pathname === '/') {
        if (!hasSession) {
            return redirectTo(request, '/login')
        }
        if (isPendingStatus(accountStatus)) {
            return redirectTo(request, '/pending-approval')
        }
        if (isApprovedStatus(accountStatus)) {
            return redirectTo(request, homePathForRole(userRole))
        }
        // Unknown status with a valid session — still prefer role home over login.
        return redirectTo(request, homePathForRole(userRole))
    }

    const isPublicRoute =
        pathname === '/login' ||
        pathname === '/signup' ||
        pathname.startsWith('/_next') ||
        pathname === '/favicon.ico'

    // Signed-in users hitting auth pages go to their dashboard.
    if (hasSession && (pathname === '/login' || pathname === '/signup')) {
        if (isPendingStatus(accountStatus)) {
            return redirectTo(request, '/pending-approval')
        }
        return redirectTo(request, homePathForRole(userRole))
    }

    // 1. No session → public only
    if (!hasSession && !isPublicRoute && pathname !== '/pending-approval') {
        return redirectTo(request, '/login')
    }

    // 2. Pending accounts stay on pending-approval
    if (hasSession && isPendingStatus(accountStatus) && pathname !== '/pending-approval') {
        return redirectTo(request, '/pending-approval')
    }

    // 3. Approved users leave pending-approval
    if (hasSession && isApprovedStatus(accountStatus) && pathname === '/pending-approval') {
        return redirectTo(request, homePathForRole(userRole))
    }

    // 4. Role-based protection for approved users
    if (hasSession && isApprovedStatus(accountStatus)) {
        const adminRoutes = [
            '/super-admin-dashboard',
            '/admin-dashboard',
            '/emergency-events',
            '/alerts-communication',
            '/gis-mapping',
            '/responders-agencies',
            '/virtual-eoc-ai-center',
            '/after-action-review',
            '/emergency-plan',
            '/preparedness-information',
            '/virtual-eoc-settings',
            '/settings',
            '/sub-admin-settings',
            '/admin/users',
            '/ai-risk-assessment',
            '/citizen-activity-feed',
            '/disaster-surveys',
        ]

        const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route))
        const isAdminRole =
            userRole === 'admin' ||
            userRole === 'super-admin' ||
            userRole === 'sub-admin' ||
            userRole === 'observer' ||
            userRole === 'responder' ||
            userRole === 'public_official' ||
            userRole === 'manager' ||
            userRole === 'eoc-manager' ||
            userRole === 'eoc-observer'
        const isEOCRole = userRole === 'eoc-manager' || userRole === 'eoc-observer'

        const responderAllowedRoutes = [
            '/responder-dashboard',
            '/responder-bed-status',
            '/responder-field-status',
            '/responder-lodging-status',
            '/responder-pharmacy-sites',
            '/responder-transit-deployment',
            '/alerts-communication',
            '/virtual-eoc-settings',
            '/responder-guides',
            '/emergency-plan',
            '/gis-mapping',
        ]
        const isResponderAllowedPath =
            pathname.startsWith('/responder-dashboard') ||
            responderAllowedRoutes.some(
                (r) => pathname === r || pathname.startsWith(`${r}/`),
            )

        const responderExclusiveRoutes = [
            '/responder-dashboard',
            '/responder-bed-status',
            '/responder-field-status',
            '/responder-lodging-status',
            '/responder-pharmacy-sites',
            '/responder-transit-deployment',
            '/responder-guides',
        ]
        const isResponderExclusivePage = responderExclusiveRoutes.some(
            (r) => pathname === r || pathname.startsWith(`${r}/`),
        )
        if (isResponderExclusivePage && userRole !== 'responder' && userRole !== 'public_official') {
            return redirectTo(request, homePathForRole(userRole))
        }

        if (userRole === 'responder' || userRole === 'public_official') {
            if (pathname === '/admin-dashboard' || pathname === '/user-dashboard') {
                return redirectTo(request, '/responder-dashboard')
            }
            if (isAdminRoute && !isResponderAllowedPath) {
                return redirectTo(request, '/responder-dashboard')
            }
        }

        if (isEOCRole) {
            if (
                pathname === '/admin-dashboard' ||
                pathname === '/eoc-dashboard' ||
                pathname === '/user-dashboard' ||
                pathname === '/'
            ) {
                return redirectTo(request, '/virtual-eoc')
            }
            const managementRoutes = [
                '/admin/users',
                '/admin/licenses',
                '/admin/sub-admins',
                '/super-admin-dashboard',
            ]
            if (managementRoutes.some((route) => pathname.startsWith(route))) {
                return redirectTo(request, '/virtual-eoc')
            }
        }

        if (pathname.startsWith('/super-admin-dashboard') && userRole !== 'super-admin') {
            return redirectTo(request, homePathForRole(userRole))
        }

        if (pathname.startsWith('/ai-risk-assessment')) {
            if (isEOCRole) {
                return redirectTo(request, '/virtual-eoc')
            }
            const canAccessAiRisk =
                userRole === 'super-admin' ||
                userRole === 'admin' ||
                userRole === 'sub-admin' ||
                userRole === 'observer' ||
                userRole === 'manager'
            if (!canAccessAiRisk) {
                return redirectTo(request, homePathForRole(userRole))
            }
        }

        if (pathname.startsWith('/citizen-activity-feed')) {
            if (isEOCRole) {
                return redirectTo(request, '/virtual-eoc')
            }
            const canAccessCitizenFeed =
                userRole === 'super-admin' ||
                userRole === 'admin' ||
                userRole === 'sub-admin' ||
                userRole === 'observer' ||
                userRole === 'manager'
            if (!canAccessCitizenFeed) {
                return redirectTo(request, homePathForRole(userRole))
            }
        }

        const restrictedForSubAdmin =
            pathname.startsWith('/admin/licenses') || pathname.startsWith('/admin/sub-admins')
        if (
            restrictedForSubAdmin &&
            userRole !== 'super-admin' &&
            userRole !== 'admin' &&
            userRole !== 'sub-admin'
        ) {
            return redirectTo(request, homePathForRole(userRole))
        }

        if (isAdminRoute && !isAdminRole) {
            return redirectTo(request, '/user-dashboard')
        }

        if (
            pathname === '/user-dashboard' &&
            isAdminRole &&
            !isEOCRole &&
            userRole !== 'responder' &&
            userRole !== 'public_official'
        ) {
            return redirectTo(request, homePathForRole(userRole))
        }

        if (pathname === '/admin-dashboard' && isEOCRole) {
            return redirectTo(request, '/virtual-eoc')
        }
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        '/api/:path*',
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
}
