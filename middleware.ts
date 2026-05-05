import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    const session = request.cookies.get('session')?.value
    const userRole = request.cookies.get('userRole')?.value
    const accountStatus = request.cookies.get('accountStatus')?.value
    const { pathname } = request.nextUrl

    // Define public routes that don't need auth
    const isPublicRoute = pathname === '/' || pathname === '/login' || pathname === '/signup' || pathname.startsWith('/_next') || pathname === '/favicon.ico'

    // 1. If no session, only allow public routes or pending-approval
    if (!session && !isPublicRoute && pathname !== '/pending-approval') {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // 2. If authenticated, but account status is pending, ONLY allow /pending-approval and logout API
    if (session && accountStatus === 'pending' && pathname !== '/pending-approval') {
        return NextResponse.redirect(new URL('/pending-approval', request.url))
    }

    // 3. If authenticated and status is approved, prevent going to pending-approval
    if (session && accountStatus === 'approved' && pathname === '/pending-approval') {
        return NextResponse.redirect(new URL('/user-dashboard', request.url))
    }

    // 4. Role-based protection for approved users
    if (accountStatus === 'approved') {
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
            '/admin/users',
            '/ai-risk-assessment',
        ]

        const isAdminRoute = adminRoutes.some(route => pathname.startsWith(route))
        const isAdminRole = userRole === 'admin' || userRole === 'super-admin' || userRole === 'sub-admin' || userRole === 'observer' || userRole === 'responder' || userRole === 'manager' || userRole === 'eoc-manager' || userRole === 'eoc-observer'
        const isEOCRole = userRole === 'eoc-manager' || userRole === 'eoc-observer'

        // 1. EOC Roles specific redirection and restrictions
        if (isEOCRole) {
            // If EOC role is on standard admin-dashboard or user-dashboard, redirect to Virtual EOC dashboard
            if (pathname === '/admin-dashboard' || pathname === '/eoc-dashboard' || pathname === '/user-dashboard' || pathname === '/') {
                return NextResponse.redirect(new URL('/virtual-eoc', request.url))
            }
            // Block EOC roles from management pages
            const managementRoutes = ['/admin/users', '/admin/licenses', '/admin/sub-admins', '/super-admin-dashboard']
            if (managementRoutes.some(route => pathname.startsWith(route))) {
                return NextResponse.redirect(new URL('/virtual-eoc', request.url))
            }
        }

        // 2. Super Admin or Admin/Sub-Admin routes
        if (pathname.startsWith('/super-admin-dashboard') && userRole !== 'super-admin') {
            return NextResponse.redirect(new URL('/admin-dashboard', request.url))
        }

        // 2b. AI Risk Assessment — super-admin only (not in sub-admin / admin / other sidebars)
        if (pathname.startsWith('/ai-risk-assessment')) {
            if (isEOCRole) {
                return NextResponse.redirect(new URL('/virtual-eoc', request.url))
            }
            if (userRole !== 'super-admin') {
                const dest =
                    userRole === 'admin' || userRole === 'sub-admin' || userRole === 'observer' || userRole === 'responder' || userRole === 'manager'
                        ? '/admin-dashboard'
                        : '/user-dashboard'
                return NextResponse.redirect(new URL(dest, request.url))
            }
        }

        // 3. Allow admin and sub-admin to access their respective management pages if they are in adminRoutes
        const restrictedForSubAdmin = pathname.startsWith('/admin/licenses') || pathname.startsWith('/admin/sub-admins')
        if (restrictedForSubAdmin && (userRole !== 'super-admin' && userRole !== 'admin' && userRole !== 'sub-admin')) {
             return NextResponse.redirect(new URL('/admin-dashboard', request.url))
        }

        // 4. Restriction: If on admin route but NOT an admin, go to user dashboard
        if (isAdminRoute && !isAdminRole) {
            return NextResponse.redirect(new URL('/user-dashboard', request.url))
        }

        // 5. Restriction: If on user dashboard but IS an admin (and not EOC), go to admin dashboard
        if (pathname === '/user-dashboard' && isAdminRole && !isEOCRole) {
            return NextResponse.redirect(new URL('/admin-dashboard', request.url))
        }

        // 6. Redirect EOC roles to EOC dashboard if they are on admin dashboard
        if (pathname === '/admin-dashboard' && isEOCRole) {
             return NextResponse.redirect(new URL('/virtual-eoc', request.url))
        }
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
