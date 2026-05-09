'use client'

import React, { useState, useLayoutEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { SessionIdleWatcher } from '@/components/session-idle-watcher'

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(true)
    const [userName, setUserName] = useState('')
    const [userRole, setUserRole] = useState('')

    useLayoutEffect(() => {
        const role = localStorage.getItem('userRole') || ''
        const storedName = localStorage.getItem('userName')
        const isAuthorized = role === 'admin' || role === 'super-admin' || role === 'sub-admin' || role === 'observer' || role === 'responder' || role === 'manager' || role === 'eoc-manager' || role === 'eoc-observer'
        
        if (!isAuthorized) {
            router.push('/login')
        } else {
            setUserRole(role)
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
        localStorage.removeItem('userEmail')
        localStorage.removeItem('userName')
        localStorage.removeItem('userCity')
        localStorage.removeItem('userCountry')
        localStorage.removeItem('systemMode')
        localStorage.removeItem('isSafe')
        localStorage.removeItem('userLocation')
        router.push('/login')
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted-foreground font-medium">Verifying Session...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-screen min-h-0 bg-background text-foreground">
            <SessionIdleWatcher />
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header
                    userName={userName || 'Admin User'}
                    onLogout={handleLogout}
                    hideSearch={userRole === 'super-admin' || userRole === 'sub-admin'}
                />
                <div className="flex-1 overflow-auto">
                    {children}
                </div>
            </div>
        </div>
    )
}
