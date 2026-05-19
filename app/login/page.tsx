'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, Mail, Lock, Shield, Key } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import logo from '../../public/logo.png'
import { useUser } from '@/lib/store/user-store'

export default function LoginPage() {
  const router = useRouter()
  const { refresh: refreshUserProfile } = useUser()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.ok) {
        localStorage.setItem('userRole', data.user.role)
        localStorage.setItem('userEmail', data.user.email)
        localStorage.setItem('userName', data.user.name || '')
        localStorage.setItem('systemMode', data.systemMode || 'safe')
        localStorage.setItem('isSafe', String(data.user.isSafe ?? true))
        localStorage.setItem('userLocation', data.user.location || '')
        localStorage.setItem('userCity', data.user.city || '')
        localStorage.setItem('userState', data.user.state || '')
        localStorage.setItem('userCountry', data.user.country || '')
        if (data.user.responderVertical) {
          localStorage.setItem('responderVertical', data.user.responderVertical)
        } else {
          localStorage.removeItem('responderVertical')
        }
        if (data.user.responderFunction) {
          localStorage.setItem('responderFunction', data.user.responderFunction)
        } else {
          localStorage.removeItem('responderFunction')
        }

        await refreshUserProfile()

        if (data.user.role === 'super-admin') {
          router.push('/super-admin-dashboard')
        } else if (data.user.role === 'admin' || data.user.role === 'sub-admin') {
          router.push('/admin-dashboard')
        } else if (data.user.role === 'responder' || data.user.role === 'public_official') {
          router.push('/responder-dashboard')
        } else if (data.user.role === 'eoc-manager' || data.user.role === 'eoc-observer') {
          router.push('/virtual-eoc')
        } else {
          // Regular user redirection based on safety status
          if (!data.user.isSafe) {
            router.push('/virtual-eoc')
          } else {
            router.push('/user-dashboard')
          }
        }
      } else {
        setError(data.error || 'Invalid email or password.')
      }
    } catch (err) {
      setError('An error occurred during login. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] selection:bg-[#33375D]/10">
      {/* Left Side: Branding (Visible on Desktop) */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#33375D] flex-col items-center justify-center p-12 text-white relative overflow-hidden">


        <div className="relative z-10 text-center max-w-md">
          <div className="flex flex-col items-center mb-12">
            <Image
              src={logo}
              alt="Ready2Go Logo"
              width={220}
              height={130}
              className="animate-in fade-in zoom-in duration-1000 mb-8 drop-shadow-2xl"
            />
          </div>

          <h1 className="text-4xl font-black mb-6 tracking-tighter uppercase whitespace-nowrap">
            Sign In to <span className="text-[#FFD75E]">Dashboard</span>
          </h1>

          <p className="text-xl text-slate-300/80 font-medium leading-relaxed mb-12">
            Access your dashboard and stay updated with real-time alerts.
          </p>


        </div>
      </div>

      {/* Right Side: Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 lg:p-12 relative">
        <div className="w-full max-w-lg">
          {/* Mobile Logo (Visible on Mobile) */}
          <div className="lg:hidden text-center mb-10 flex flex-col items-center">
            <Image
              src={logo}
              alt="Ready2Go Logo"
              width={140}
              height={80}
              className="mb-4"
            />
          </div>

          <div className="bg-white rounded-[48px] shadow-2xl shadow-slate-200/60 p-8 sm:p-10 lg:p-14 border border-slate-100 animate-in fade-in slide-in-from-bottom-8 duration-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
              <Shield size={160} className="text-[#33375D]" />
            </div>

            <div className="mb-14 text-center relative z-10">
              <h2 className="text-5xl font-black text-[#33375D] mb-3 tracking-tighter uppercase leading-none">Sign In</h2>
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em]">Enter your details</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6 relative z-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  Email Address
                </label>
                <div className="relative group mt-1">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#33375D] transition-colors">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-16 pr-6 py-5 font-semibold bg-slate-50 border border-slate-200 rounded-3xl focus:outline-none focus:ring-4 focus:ring-[#33375D]/5 focus:border-[#33375D] transition-all text-[#33375D] placeholder:text-slate-300"
                    required
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center ml-1 mb-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Password
                  </label>
                  <button type="button" className="text-[10px] font-black text-[#33375D] hover:underline uppercase tracking-widest underline-offset-4">Forgot Password?</button>
                </div>
                <div className="relative group">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#33375D] transition-colors">
                    <Lock size={18} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-16 pr-16 py-5 font-semibold bg-slate-50 border border-slate-200 rounded-3xl focus:outline-none focus:ring-4 focus:ring-[#33375D]/5 focus:border-[#33375D] transition-all text-[#33375D] placeholder:text-slate-300"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#33375D] transition-colors"
                  >
                    {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-5 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-[10px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="shrink-0" />
                    {error}
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#33375D] hover:bg-[#44496B] text-white font-black py-8 rounded-3xl shadow-2xl shadow-[#33375D]/20 transition-all active:scale-[0.98] text-sm uppercase tracking-[0.2em] mt-4"
              >
                {loading ? (
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </div>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <div className="mt-14 text-center pt-10 border-t border-slate-50 relative z-10">
              <p className="text-slate-400 font-bold text-[11px] uppercase tracking-widest">
                New here? Don't have an account?{' '}
                <button
                  onClick={() => router.push('/signup')}
                  className="text-[#33375D] font-black hover:underline underline-offset-4 decoration-2"
                >
                  Create Account
                </button>
              </p>
            </div>
          </div>

          <p className="mt-14 text-center text-slate-400 text-[9px] font-black uppercase tracking-[0.4em]">
            © 2026 Ready2Go Operations
          </p>
        </div>
      </div>
    </div>
  )
}
