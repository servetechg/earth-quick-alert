'use client'

import React from "react"
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Clock, ShieldCheck, Mail, LogOut } from 'lucide-react'
import Image from 'next/image'
import logo from '../../public/logo.png'

export default function PendingApprovalPage() {
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' })
      localStorage.clear()
      router.push('/login')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-10 flex flex-col items-center">
          <Image
            src={logo}
            alt="Ready2Go Logo"
            width={140}
            height={80}
            className="mb-6"
          />
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 p-8 sm:p-12 border border-slate-100 text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mx-auto mb-8">
            <Clock size={40} className="animate-pulse" />
          </div>

          <h1 className="text-3xl font-bold text-slate-900 mb-4">Registration Pending</h1>
          <p className="text-slate-500 font-medium leading-relaxed mb-8">
            Your account has been successfully created and is now awaiting verification from our Super Admin team.
            You will receive an email once your access has been granted.
          </p>

          <div className="space-y-4 mb-10">
            <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left">
              <div className="mt-1 text-slate-400">
                <ShieldCheck size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">Enhanced Security</p>
                <p className="text-xs text-slate-500 font-medium">Every account is manually verified to ensure the safety of our emergency response network.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left">
              <div className="mt-1 text-slate-400">
                <Mail size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">Support Availability</p>
                <p className="text-xs text-slate-500 font-medium">If you have urgent needs, please contact your organization administrator.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Button
              variant="outline"
              onClick={handleLogout}
              className="w-full border-slate-200 text-slate-600 font-bold py-7 rounded-2xl hover:bg-slate-50 transition-all flex items-center justify-center gap-3 text-lg"
            >
              <LogOut size={20} />
              Sign Out and Try Later
            </Button>
          </div>
        </div>

        <p className="mt-10 text-center text-slate-400 text-xs font-semibold uppercase tracking-widest">
          © 2026 Ready2Go Operations • Emergency Response Network
        </p>
      </div>
    </div>
  )
}
