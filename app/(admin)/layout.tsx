'use client'

import React, { useState, useLayoutEffect, useRef, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { SessionIdleWatcher } from '@/components/session-idle-watcher'
import { AdminPageLoader } from '@/components/admin-page-loader'
import { notifyAuthSessionChanged } from '@/lib/sync-client-user-profile'
import { DemoSimulationBar } from '@/components/demo/demo-simulation-bar'
import { QueryProvider } from '@/components/providers/query-provider'

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const router = useRouter()
    const pathname = usePathname()
    const scrollContainerRef = useRef<HTMLDivElement | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [userName, setUserName] = useState('')
    const [userRole, setUserRole] = useState('')
    const [responderVertical, setResponderVertical] = useState('')

    // The admin shell has its own internal scroll container (the children area),
    // so Next.js's default window-level scroll restoration cannot reset it on
    // route changes. Snap it back to the top whenever the pathname changes.
    useEffect(() => {
        scrollContainerRef.current?.scrollTo({ top: 0, left: 0 })
    }, [pathname])

    useLayoutEffect(() => {
        const role = localStorage.getItem('userRole') || ''
        const storedName = localStorage.getItem('userName')
        const isAuthorized =
            role === 'admin' ||
            role === 'super-admin' ||
            role === 'sub-admin' ||
            role === 'observer' ||
            role === 'responder' ||
            role === 'manager' ||
            role === 'eoc-manager' ||
            role === 'eoc-observer' ||
            role === 'public_official'
        if (!isAuthorized) {
            router.push('/login')
        } else {
            setUserRole(role)
            setResponderVertical(localStorage.getItem('responderVertical') || '')
            if (storedName) setUserName(storedName)
            setIsLoading(false)
        }
    }, [router])

    const handleLogout = async () => {
        try {
            await fetch('/api/logout', { method: 'POST' })
        } catch (error) {
            console.error('Logout failed:', error)
        }
        localStorage.removeItem('userRole')
        localStorage.removeItem('responderVertical')
        localStorage.removeItem('responderFunction')
        localStorage.removeItem('userEmail')
        localStorage.removeItem('userName')
        localStorage.removeItem('userCity')
        localStorage.removeItem('userState')
        localStorage.removeItem('userCountry')
        localStorage.removeItem('systemMode')
        localStorage.removeItem('isSafe')
        localStorage.removeItem('userLocation')
        notifyAuthSessionChanged()
        router.push('/login')
    }

    if (isLoading) {
        return <AdminPageLoader layout="fullscreen" message="Verifying Session..." />
    }

    const isHospitalResponder =
        userRole === 'responder' &&
        (responderVertical === 'hospital' || responderVertical === 'healthcare-hospital')

    return (
        <QueryProvider>
        <div className="flex h-screen min-h-0 bg-background text-foreground">
            <SessionIdleWatcher />
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header
                    userName={userName || 'Admin User'}
                    onLogout={handleLogout}
                    hideSearch={userRole === 'super-admin'}
                    hideNotificationBell={isHospitalResponder}
                />
                <DemoSimulationBar />
                <div ref={scrollContainerRef} className="flex-1 overflow-auto">
                    {children}
                </div>
            </div>
        </div>
        </QueryProvider>
    )
}
