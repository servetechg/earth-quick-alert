'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { UserSidebar } from '@/components/user-sidebar'
import { Header } from '@/components/header'
import { useEvents } from '@/lib/store/event-store'
import { useSafety } from '@/lib/context/safety-context'
import { notifyAuthSessionChanged } from '@/lib/sync-client-user-profile'

export default function UserLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const router = useRouter()
    const pathname = usePathname()
    const { getActiveEvents } = useEvents()
    const { refreshSafetyData } = useSafety()
    const scrollContainerRef = useRef<HTMLDivElement | null>(null)
    const [userName, setUserName] = useState('')
    const [isLoading, setIsLoading] = useState(true)

    const isVirtualEOC = pathname?.startsWith('/virtual-eoc')

    // Internal scroll container — Next.js only resets window scroll on route
    // changes, so we manually snap this back to the top whenever the route changes.
    useEffect(() => {
        scrollContainerRef.current?.scrollTo({ top: 0, left: 0 })
    }, [pathname])

    useEffect(() => {
        const userRole = localStorage.getItem('userRole')
        const storedName = localStorage.getItem('userName')

        const isAdminRole = userRole === 'admin' || userRole === 'super-admin' || userRole === 'sub-admin' || userRole === 'observer' || userRole === 'responder' || userRole === 'manager'
        
        if (isAdminRole) {
            router.push('/')
            return
        }

        if (!userRole) {
            router.push('/login')
            return
        }

        // Emergency Auto-Redirect logic
        const activeEvents = getActiveEvents()
        const hasCriticalEmergency = activeEvents.some(event => event.severity === 'critical' || event.severity === 'severe')
        const systemMode = localStorage.getItem('systemMode')
        const isUserSafe = localStorage.getItem('isSafe') !== 'false'

        // Priority 1: If user is NOT safe, MUST show Virtual EOC
        if (!isUserSafe && !isVirtualEOC) {
            router.push('/virtual-eoc')
            return
        }

        // Priority 2: System-wide danger or critical emergency
        if ((hasCriticalEmergency || systemMode === 'danger') && !isVirtualEOC) {
            router.push('/virtual-eoc')
            return
        }

        if (storedName) setUserName(storedName)

        // Refresh family member data on mount/layout entry
        refreshSafetyData()

        setIsLoading(false)
    }, [router, getActiveEvents, isVirtualEOC, refreshSafetyData])

    const handleLogout = async () => {
        try {
            await fetch('/api/logout', { method: 'POST' })
        } catch (error) {
            console.error('Logout failed:', error)
        }
        localStorage.removeItem('userRole')
        localStorage.removeItem('userEmail')
        localStorage.removeItem('userName')
        notifyAuthSessionChanged()
        router.push('/login')
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#33375D]/25 border-t-[#33375D]" />
                    <p className="text-muted-foreground font-medium">Loading Dashboard...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-screen min-h-0 bg-background text-foreground">
            {!isVirtualEOC && <UserSidebar />}
            <div className="flex-1 flex flex-col overflow-hidden">
                {!isVirtualEOC && <Header userName={userName} onLogout={handleLogout} />}
                <div
                    ref={scrollContainerRef}
                    className={`flex-1 overflow-auto ${isVirtualEOC ? 'w-full h-full' : ''}`}
                >
                    {children}
                </div>
            </div>
        </div>
    )
}
