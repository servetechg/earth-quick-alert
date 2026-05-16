'use client'

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react'
import { AUTH_SESSION_CHANGED_EVENT, USER_PROFILE_UPDATED_EVENT } from '@/lib/sync-client-user-profile'

/**
 * Source of truth for the currently signed-in user on the client.
 *
 * Why this exists:
 *   The Header (and other client components) previously read profile fields
 *   directly from localStorage. localStorage is device-local, so when a user
 *   updated their profile on laptop A, laptop B kept showing stale data even
 *   after a hard reload. This provider treats the server (`GET /api/user/profile`)
 *   as the source of truth and re-fetches on mount + tab focus + after profile
 *   mutations dispatched via `USER_PROFILE_UPDATED_EVENT` or `AUTH_SESSION_CHANGED_EVENT`
 *   (login / logout).
 */

export interface CurrentUser {
    name: string
    email: string
    role: string
    phoneNumber?: string
    profilePic?: string
    profilePicPublicId?: string
    location?: string
    city?: string
    state?: string
    country?: string
    responderVertical?: string
}

interface UserStore {
    me: CurrentUser | null
    /** True until the first fetch attempt resolves (success or 401). */
    loading: boolean
    error: string | null
    /** Force a re-fetch from `/api/user/profile`. Awaitable. */
    refresh: () => Promise<void>
    /** Local clear — call from the logout flow after `/api/logout`. */
    clear: () => void
}

const UserContext = createContext<UserStore | undefined>(undefined)

/** Mirror server fields into localStorage so legacy readers (and SSR first-paint) stay in sync. */
function mirrorToLocalStorage(user: CurrentUser | null) {
    if (typeof window === 'undefined') return
    if (!user) {
        localStorage.removeItem('userName')
        localStorage.removeItem('userEmail')
        localStorage.removeItem('userProfilePic')
        localStorage.removeItem('userLocation')
        localStorage.removeItem('userCity')
        localStorage.removeItem('userState')
        localStorage.removeItem('userCountry')
        return
    }
    localStorage.setItem('userName', user.name ?? '')
    localStorage.setItem('userEmail', user.email ?? '')
    localStorage.setItem('userProfilePic', user.profilePic ?? '')
    if (user.location != null) localStorage.setItem('userLocation', user.location)
    if (user.role) localStorage.setItem('userRole', user.role)
    if (user.city != null) localStorage.setItem('userCity', user.city)
    if (user.state != null) localStorage.setItem('userState', user.state)
    if (user.country != null) localStorage.setItem('userCountry', user.country)
}

export function UserProvider({ children }: { children: React.ReactNode }) {
    const [me, setMe] = useState<CurrentUser | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Prevent overlapping refreshes (e.g. focus event firing rapidly).
    const inflightRef = useRef<Promise<void> | null>(null)

    const doFetch = useCallback(async () => {
        try {
            const res = await fetch('/api/user/profile', {
                cache: 'no-store',
                credentials: 'include',
            })
            if (res.status === 401) {
                setMe(null)
                setError(null)
                mirrorToLocalStorage(null)
                return
            }
            if (!res.ok) {
                setError(`Failed to load profile (${res.status})`)
                return
            }
            const data = await res.json()
            if (data?.success && data.user) {
                setMe(data.user as CurrentUser)
                setError(null)
                mirrorToLocalStorage(data.user as CurrentUser)
            } else {
                setError('Unexpected profile response shape')
            }
        } catch (err) {
            console.error('UserProvider fetch error:', err)
            setError('Network error: could not reach profile API')
        }
    }, [])

    const refresh = useCallback(async () => {
        if (inflightRef.current) return inflightRef.current
        const p = (async () => {
            try {
                await doFetch()
            } finally {
                inflightRef.current = null
            }
        })()
        inflightRef.current = p
        return p
    }, [doFetch])

    const clear = useCallback(() => {
        setMe(null)
        setError(null)
        mirrorToLocalStorage(null)
    }, [])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            await refresh()
            if (!cancelled) setLoading(false)
        })()
        return () => {
            cancelled = true
        }
    }, [refresh])

    // Re-fetch when the tab regains focus — fixes the "open page on laptop B and
    // still see stale name" case after the user edited their profile elsewhere.
    useEffect(() => {
        const onFocus = () => {
            if (document.visibilityState === 'visible') {
                void refresh()
            }
        }
        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onFocus)
        return () => {
            window.removeEventListener('focus', onFocus)
            document.removeEventListener('visibilitychange', onFocus)
        }
    }, [refresh])

    // Profile saves, login, and logout — re-sync from `/api/user/profile`.
    useEffect(() => {
        const handler = () => {
            void refresh()
        }
        window.addEventListener(USER_PROFILE_UPDATED_EVENT, handler)
        window.addEventListener(AUTH_SESSION_CHANGED_EVENT, handler)
        return () => {
            window.removeEventListener(USER_PROFILE_UPDATED_EVENT, handler)
            window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, handler)
        }
    }, [refresh])

    const value: UserStore = { me, loading, error, refresh, clear }
    return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
    const ctx = useContext(UserContext)
    if (!ctx) {
        throw new Error('useUser must be used within a UserProvider')
    }
    return ctx
}

/** Convenience: returns just the user object (or null). Throws if used outside provider. */
export function useCurrentUser() {
    return useUser().me
}
