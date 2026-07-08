'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { LogOut, Menu, User } from 'lucide-react'
import { Sidebar } from '@/components/sidebar'
import { UserSidebar } from '@/components/user-sidebar'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useUser } from '@/lib/store/user-store'
import { NotificationBell } from '@/components/notifications/notification-bell'

interface HeaderProps {
  userName?: string
  onLogout?: () => void
  /** When true, the top search field is hidden (e.g. super-admin layout). */
  hideSearch?: boolean
  /** Strip demo notification bell (e.g. hospital responder minimal shell). */
  hideNotificationBell?: boolean
}

export function Header({
  userName = 'Admin User',
  onLogout,
  hideSearch: _hideSearch = false,
  hideNotificationBell = false,
}: HeaderProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  // Server is the source of truth via UserProvider. localStorage is only used as a
  // first-paint fallback so the header doesn't flicker before /api/user/profile
  // resolves on initial mount.
  const { me } = useUser()

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-close sidebar on pathname change
  useEffect(() => {
    setShowSidebar(false)
  }, [pathname])

  const displayName = useMemo(() => {
    if (me?.name) return me.name
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('userName')
      if (cached) return cached
    }
    return userName || 'User'
  }, [me?.name, userName])

  const userEmail = useMemo(() => {
    if (me?.email) return me.email
    if (typeof window !== 'undefined') return localStorage.getItem('userEmail') || ''
    return ''
  }, [me?.email])

  const userRole = useMemo(() => {
    if (me?.role) return me.role
    if (typeof window !== 'undefined') return localStorage.getItem('userRole') || ''
    return ''
  }, [me?.role])

  const isUserSafe =
    typeof window !== 'undefined' ? localStorage.getItem('isSafe') !== 'false' : true

  const editProfileHref = useMemo(() => {
    if (userRole === 'super-admin') return '/settings?tab=profile'
    if (userRole === 'sub-admin') return '/sub-admin-settings?tab=profile'
    if (userRole === 'responder') return '/responder-settings'
    return '/user/settings'
  }, [userRole])

  const avatarSrc = useMemo(() => {
    const pic =
      me?.profilePic?.trim() ||
      (typeof window !== 'undefined' ? localStorage.getItem('userProfilePic')?.trim() : '')
    return (
      pic ||
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=100&auto=format&fit=crop'
    )
  }, [me?.profilePic])

  return (
    <header className="border-b border-slate-100 bg-white px-4 md:px-8 py-3 flex items-center justify-between gap-8 h-16 sticky top-0 z-50">
      <div className="flex items-center gap-4 flex-1">
        <button
          onClick={() => setShowSidebar(true)}
          className="p-2 md:hidden rounded-md hover:bg-slate-50 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Sheet open={showSidebar} onOpenChange={setShowSidebar}>
          <SheetContent side="left" className="p-0 bg-[#33375D] border-r-0 w-[280px] sm:w-[300px]">
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            {userRole === 'user' ? (
              <UserSidebar className="flex w-full" />
            ) : (
              <Sidebar className="flex w-full" />
            )}
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex items-center gap-2 ">
        {!hideNotificationBell && (
          <div className="flex items-center gap-4 border-r border-slate-100 pr-4 mr-1">
            <NotificationBell />
          </div>
        )}

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-3 hover:bg-slate-50 py-1.5 px-3 rounded-xl transition-all group"
          >
            <Avatar className="w-9 h-9 border border-slate-200 transition-all group-hover:border-indigo-100">
              <AvatarImage src={avatarSrc} className="rounded-full overflow-hidden object-cover" />
              <AvatarFallback className="rounded-full flex items-center justify-center bg-slate-100 text-[10px] font-bold">{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="text-left hidden sm:block">
              <p className="text-[13px] font-black text-slate-900 leading-none">{displayName}</p>
              <p className="text-[11px] font-bold text-slate-400 mt-1">{userRole === 'admin' || userRole === 'super-admin' ? 'Emergency Coordinator' : (userEmail || 'email@gmail.com')}</p>
            </div>
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-100 shadow-2xl rounded-[24px] py-3 z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right">
              <div className="px-5 py-3 mb-2 border-b border-slate-50 md:hidden">
                <p className="text-sm font-black text-slate-900 leading-tight">{displayName}</p>
                <p className="text-[11px] text-slate-400 font-bold">{userEmail}</p>
              </div>

              <Link
                href={editProfileHref}
                onClick={() => setShowDropdown(false)}
                className="flex items-center gap-3 px-4 py-3 mx-2 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-all"
              >
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                  <User className="w-4 h-4" />
                </div>
                Edit Profile
              </Link>

              <div className="h-px bg-slate-100 my-2 mx-4" />

              <button
                onClick={() => {
                  setShowDropdown(false)
                  onLogout?.()
                }}
                className="flex items-center gap-3 px-4 py-3 mx-2 rounded-2xl text-sm font-bold text-red-600 hover:bg-red-50 transition-all w-[calc(100%-16px)] text-left"
              >
                <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center text-red-500">
                  <LogOut className="w-4 h-4" />
                </div>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
