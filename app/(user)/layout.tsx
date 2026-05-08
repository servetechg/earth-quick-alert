'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { UserSidebar } from '@/components/user-sidebar'
import { Header } from '@/components/header'
import { useEvents } from '@/lib/store/event-store'
import { useSafety } from '@/lib/context/safety-context'

export default function UserLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const router = useRouter()
    const pathname = usePathname()
    const { getActiveEvents } = useEvents()
    const { refreshSafetyData } = useSafety()
    const [userName, setUserName] = useState('')
    const [isLoading, setIsLoading] = useState(true)

    const isVirtualEOC = pathname?.startsWith('/virtual-eoc')

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
                <div className={`flex-1 overflow-auto ${isVirtualEOC ? 'w-full h-full' : ''}`}>
                    {children}
                </div>
            </div>
        </div>
    )
}
