'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  AlertCircle,
  Bell,
  Map,
  Users,
  Brain,
  ClipboardList,
  FileText,
  Settings,
  HelpCircle,
  LogOut,
  X,
  Building2,
  Shield,
  Bed,
  Crosshair,
  Wrench,
  CloudRain,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import logo from '../public/logo.png'
import { Button } from '@/components/ui/button'

export const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/admin-dashboard' },
  { icon: AlertCircle, label: 'Emergency Events', href: '/emergency-events' },
  { icon: Map, label: 'GIS & Mapping', href: '/gis-mapping' },
  { icon: Bell, label: 'Alerts & Communication', href: '/alerts-communication' },
  { icon: Brain, label: 'Virtual EOC / AI Center', href: '/virtual-eoc-ai-center' },
  { icon: Sparkles, label: 'AI Risk Assessment', href: '/ai-risk-assessment' },
  { icon: ClipboardList, label: 'After Action Review', href: '/after-action-review' },
  { icon: FileText, label: 'COOP/BC Plans', href: '/emergency-plan' },
  { icon: FileText, label: 'Preparedness Information', href: '/preparedness-information' },
  { icon: Users, label: 'Responders & Agencies', href: '/responders-agencies' },
]

export const bottomItems = [
  { icon: Settings, label: 'Settings', href: '/virtual-eoc-settings' },
  { icon: HelpCircle, label: 'Help', href: '#' },
  { icon: LogOut, label: 'Log out', href: '#' },
]

export function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    setUserRole(localStorage.getItem('userRole'))
  }, [])

  const isSuperAdminRole = userRole === 'super-admin'
  const isEOCRole = userRole === 'eoc-manager' || userRole === 'eoc-observer'
  const isOperationalAdmin = userRole === 'admin' || userRole === 'sub-admin' || userRole === 'observer' || userRole === 'responder' || userRole === 'manager'

  const eocMenuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/virtual-eoc' },
    { icon: Bed, label: 'Lodging & Essentials', href: '/virtual-eoc/lodging' },
    { icon: Crosshair, label: 'Emergency Center', href: '/virtual-eoc/center' },
    { icon: Wrench, label: 'Emergency Maintenance', href: '/virtual-eoc/maintenance' },
    { icon: CloudRain, label: 'Weather & Traffic Feed', href: '/virtual-eoc/weather-traffic' },
    { icon: RefreshCw, label: 'Recovery Resources', href: '/virtual-eoc/recovery' },
  ]

  const adminMenuItems = isSuperAdminRole
    ? [
      { icon: LayoutDashboard, label: 'Dashboard', href: '/super-admin-dashboard' },
      { icon: Bell, label: 'Alerts & Communication', href: '/alerts-communication' },
      { icon: FileText, label: 'Preparedness Information', href: '/preparedness-information' },
      { icon: Building2, label: 'Licenses', href: '/admin/licenses' },
      { icon: Shield, label: 'Sub-Admins', href: '/admin/sub-admins' },
      { icon: Users, label: 'Responder and Leader Approval', href: '/admin/users' },
      { icon: Sparkles, label: 'AI Risk Assessment', href: '/ai-risk-assessment' },
    ]
    : isEOCRole
      ? eocMenuItems
      : isOperationalAdmin
        ? [
          ...menuItems,
          { icon: Users, label: 'Responder and Leader Approval', href: '/admin/users' },
        ]
        : [
          ...menuItems,
        ]

  const filteredBottomItems = isSuperAdminRole
    ? bottomItems.filter(item => item.label === 'Log out')
    : bottomItems;

  return (
    <div className="hidden md:flex w-72 bg-[#33375D] text-white flex-col h-full border-r border-slate-700/50">
      {/* Logo Section */}
      <Link href="/" className="p-8 flex flex-col items-center hover:bg-white/5 transition-colors">
        <Image
          src={logo}
          alt="Ready2Go Logo"
          width={140}
          height={70}
          className="mb-2"
        />
      </Link>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {adminMenuItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'w-full flex items-center gap-3 px-5 py-3 rounded-xl text-left transition-all duration-200 group',
                isActive
                  ? 'bg-[#FFD75E] text-[#33375D] shadow-lg shadow-yellow-500/20'
                  : 'text-slate-200 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className={cn("w-5 h-5 flex-shrink-0 transition-colors", isActive ? "text-[#33375D]" : "text-slate-400 group-hover:text-white")} />
              <span className="text-[15px] font-bold tracking-tight">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Bottom Navigation */}
      <div className="p-4 mb-4">
        <div className="bg-[#44496B] rounded-2xl p-4 space-y-1 shadow-inner">
          {filteredBottomItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href

            // Handle Help button specially
            if (item.label === 'Help') {
              return (
                <button
                  key={item.label}
                  onClick={() => setShowHelpModal(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors text-slate-300 hover:bg-white/10 hover:text-white"
                >
                  <Icon className="w-5 h-5 flex-shrink-0 text-slate-400" />
                  <span className="text-sm font-bold">{item.label}</span>
                </button>
              )
            }

            if (item.label === 'Log out') {
              return (
                <button
                  key={item.label}
                  onClick={async () => {
                    try {
                      await fetch('/api/logout', { method: 'POST' })
                    } catch (error) {
                      console.error('Logout failed:', error)
                    }
                    localStorage.removeItem('userRole')
                    localStorage.removeItem('userEmail')
                    localStorage.removeItem('userName')
                    router.push('/login')
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors text-slate-300 hover:bg-white/10 hover:text-white"
                >
                  <Icon className="w-5 h-5 flex-shrink-0 text-slate-400" />
                  <span className="text-sm font-bold">{item.label}</span>
                </button>
              )
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors',
                  isActive
                    ? 'bg-[#FFD75E] text-[#33375D]'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className={cn("w-5 h-5 flex-shrink-0", isActive ? "text-[#33375D]" : "text-slate-400")} />
                <span className="text-sm font-bold">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: '#34385E' }}>
          <div className="relative w-full h-full flex flex-col items-center justify-center text-center px-4">
            <button
              onClick={() => setShowHelpModal(false)}
              className="absolute top-8 right-8 p-2 hover:bg-white/10 rounded-md transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>

            {/* Ready2Go Logo - Placeholder */}
            <div className="mb-8 flex justify-center">
              <Image
                src={logo}
                alt="Ready2Go Logo"
                width={200}
                height={100}
                className="h-auto"
              />
            </div>

            {/* Title and Description */}
            <h2 className="text-4xl font-bold text-white mb-4">Contact Us</h2>
            <p className="text-gray-200 mb-8 max-w-lg text-lg">
              Have questions or want to learn more? Get in touch with our team
              <br />
              or schedule a demo.
            </p>

            {/* Schedule Demo Button */}
            <Button className="bg-white text-slate-800 hover:bg-gray-100 px-8 py-2 text-base">
              Schedule a Demo
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
