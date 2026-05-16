'use client'

import { useLayoutEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Hotel,
  Pill,
  Bus,
  LogOut,
  X,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import logo from '../public/logo.png'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getResponderDashboardKind, RESPONDER_VERTICAL_LABELS, type ResponderVertical } from '@/lib/responder-verticals'
import { notifyAuthSessionChanged } from '@/lib/sync-client-user-profile'

type NavItem = { icon: typeof LayoutDashboard; label: string; href: string }

function navForVertical(v: string): NavItem[] {
  const kind = getResponderDashboardKind(v)
  const common: NavItem[] = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/responder-dashboard' }, 
    // { icon: Bell, label: 'Alerts & communication', href: '/alerts-communication' },
    // { icon: Map, label: 'GIS & mapping', href: '/gis-mapping' },
    // { icon: FileText, label: 'Emergency plans', href: '/emergency-plan' },
  ]
  // Hospital: dashboard-only nav (bed grid lives on the dashboard itself).
  if (kind === 'hospital') {
    return common
  }
  // Police: dashboard-only (deployment tables + dialogs live on /responder-dashboard).
  if (kind === 'police') {
    return common
  }
  if (kind === 'hotel') {
    return [
      common[0],
      { icon: Hotel, label: 'Lodging availability', href: '/responder-lodging-status' },
      ...common.slice(1),
    ]
  }
  if (kind === 'pharmacy') {
    return [
      common[0],
      { icon: Pill, label: 'Pharmacy sites & map', href: '/responder-pharmacy-sites' },
      ...common.slice(1),
    ]
  }
  if (kind === 'transit') {
    return [
      common[0],
    ]
  }
  return common
}

export function ResponderSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [vertical, setVertical] = useState<string>('')
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    setVertical(localStorage.getItem('responderVertical') || '')
    setReady(true)
  }, [])

  const items = navForVertical(vertical)
  const subtitle = vertical
    ? RESPONDER_VERTICAL_LABELS[vertical as ResponderVertical] ?? vertical
    : 'Responder portal'

  if (!ready) {
    return (
      <div
        className="hidden md:flex min-h-0 w-70 shrink-0 flex-col bg-[#33375D] text-white h-full border-r border-slate-700/50"
        aria-hidden
      >
        <div className="p-8 flex flex-col items-center shrink-0 animate-pulse">
          <div className="h-14 w-32 rounded-lg bg-white/10 mb-4" />
        </div>
      </div>
    )
  }

  return (
    <div className="hidden md:flex min-h-0 w-70 shrink-0 flex-col bg-[#33375D] text-white h-full border-r border-slate-700/50">
      <Link href="/responder-dashboard" className="p-8 flex flex-col items-center shrink-0 hover:bg-white/5 transition-colors">
        <Image src={logo} alt="Ready2Go" width={140} height={70} className="mb-2" />
        <p className="text-[10px] font-black uppercase tracking-widest text-[#FFD75E]/90 text-center px-2 leading-relaxed">
          Responder
          <br />
          <span className="text-white/80 font-bold normal-case tracking-tight text-xs">{subtitle}</span>
        </p>
      </Link>

      <nav className="flex min-h-0 flex-1 flex-col" aria-label="Responder navigation">
        <ScrollArea
          type="hover"
          className="min-h-0 flex-1"
          scrollBarClassName="w-2 border-l-0 bg-transparent p-0.5"
          scrollThumbClassName="bg-white/25 hover:bg-[#FFD75E]/90"
        >
          <div className="space-y-1 p-4 pr-2">
            {items.map((item) => {
              const Icon = item.icon
              const isActive = Boolean(
                pathname && (pathname === item.href || pathname.startsWith(`${item.href}/`)),
              )
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'w-full flex items-center gap-3 px-5 py-3 rounded-xl text-left transition-all duration-200 group',
                    isActive
                      ? 'bg-[#FFD75E] text-[#33375D] shadow-lg shadow-yellow-500/20'
                      : 'text-slate-200 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <Icon className={cn('w-5 h-5 flex-shrink-0', isActive ? 'text-[#33375D]' : 'text-slate-400')} />
                  <span className="text-[15px] font-bold tracking-tight">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </ScrollArea>
      </nav>

      <div className="shrink-0 p-4 mb-4">
        <div className="bg-[#44496B] rounded-2xl p-4 space-y-1 shadow-inner">
          <Link
            href="/responder-settings"
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors',
              pathname && pathname === '/responder-settings'
                ? 'bg-[#FFD75E] text-[#33375D]'
                : 'text-slate-300 hover:bg-white/10 hover:text-white',
            )}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-bold">Settings</span>
          </Link>
          {/* <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <HelpCircle className="w-5 h-5 flex-shrink-0 text-slate-400" />
            <span className="text-sm font-bold">Help</span>
          </button> */}
          <button
            type="button"
            onClick={async () => {
              try {
                await fetch('/api/logout', { method: 'POST' })
              } catch (e) {
                console.error(e)
              }
              localStorage.removeItem('userRole')
              localStorage.removeItem('responderVertical')
              localStorage.removeItem('responderFunction')
              localStorage.removeItem('userEmail')
              localStorage.removeItem('userName')
              notifyAuthSessionChanged()
              router.push('/login')
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="w-5 h-5 flex-shrink-0 text-slate-400" />
            <span className="text-sm font-bold">Log out</span>
          </button>
        </div>
      </div>

      {showHelpModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center" style={{ backgroundColor: '#34385E' }}>
          <div className="relative w-full h-full flex flex-col items-center justify-center text-center px-4">
            <button
              type="button"
              onClick={() => setShowHelpModal(false)}
              className="absolute top-8 right-8 p-2 hover:bg-white/10 rounded-md transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>
            <div className="mb-8 flex justify-center">
              <Image src={logo} alt="Ready2Go" width={200} height={100} className="h-auto" />
            </div>
            <h2 className="text-4xl font-bold text-white mb-4">Responder support</h2>
            <p className="text-gray-200 mb-8 max-w-xl text-lg">
              Contact your EOC administrator or organization super admin for access changes, vertical assignment, or
              API data feeds.
            </p>
            <Button className="bg-white text-slate-800 hover:bg-gray-100 px-8 py-2 text-base">Schedule a Demo</Button>
          </div>
        </div>
      )}
    </div>
  )
}
