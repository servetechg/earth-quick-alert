'use client'

import { useState, useRef, useEffect } from 'react'
import { Bell, Search, LogOut, Menu, X, Users, User, Settings, ChevronDown } from 'lucide-react'
import { menuItems } from '@/components/sidebar'
import { menuItems as userMenuItems } from '@/components/user-sidebar'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface HeaderProps {
  userName?: string
  onLogout?: () => void
}

export function Header({ userName = 'Admin User', onLogout }: HeaderProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const displayName = userName || (typeof window !== 'undefined' ? localStorage.getItem('userName') : '') || 'User'
  const userEmail = typeof window !== 'undefined' ? localStorage.getItem('userEmail') : ''
  const userRole = typeof window !== 'undefined' ? localStorage.getItem('userRole') : ''
  const isUserSafe = typeof window !== 'undefined' ? localStorage.getItem('isSafe') !== 'false' : true

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

        <div className="flex-1 max-w-sm hidden md:block">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search ....."
              className="pl-10 bg-white border-slate-200 rounded-lg h-10 w-full focus:ring-1 focus:ring-blue-100 transition-all shadow-none text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 ">
        <div className="flex items-center gap-4 border-r border-slate-100 pr-4 mr-1">
          <div className="relative p-2 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer group">
            <Bell fill='#33375D' size={22} className="text-slate-900 transition-colors" />
            <span className="absolute top-1.5 right-1.5 h-4 w-4 bg-rose-600 text-[9px] font-black text-white flex items-center justify-center rounded-full border-2 border-white">3</span>
          </div>
        </div>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-3 hover:bg-slate-50 py-1.5 px-3 rounded-xl transition-all group"
          >
            <Avatar className="w-9 h-9 border border-slate-200 transition-all group-hover:border-indigo-100">
              <AvatarImage src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=100&auto=format&fit=crop" className="rounded-full overflow-hidden object-cover" />
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
                href="/user/settings"
                onClick={() => setShowDropdown(false)}
                className="flex items-center gap-3 px-4 py-3 mx-2 rounded-2xl text-sm font-black text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-all"
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
                className="flex items-center gap-3 px-4 py-3 mx-2 rounded-2xl text-sm font-black text-red-600 hover:bg-red-50 transition-all w-[calc(100%-16px)] text-left"
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
