'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, ShieldCheck, Activity, Users, Zap, Globe, Shield, Heart, ChevronRight, Lock, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function LandingPage() {
    const router = useRouter()
    const [isLoaded, setIsLoaded] = useState(false)
    const [showContent, setShowContent] = useState(false)

    useEffect(() => {
        // Initial splash delay
        const timer = setTimeout(() => {
            setIsLoaded(true)
            setTimeout(() => setShowContent(true), 500)
        }, 2000)

        // Session check
        const role = localStorage.getItem('userRole')
        if (role === 'super-admin') {
            router.push('/super-admin-dashboard')
        } else if (role === 'admin' || role === 'sub-admin') {
            router.push('/admin-dashboard')
        } else if (role === 'user') {
            router.push('/user-dashboard')
        }

        return () => clearTimeout(timer)
    }, [router])

    if (!isLoaded) {
        return (
            <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center z-[100] overflow-hidden">
                <div className="relative mb-8 flex h-24 w-24 shrink-0 items-center justify-center">
                    <div
                        aria-hidden
                        className="absolute inset-0 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin"
                    />
                    <Activity className="relative z-10 block h-8 w-8 shrink-0 text-blue-500 animate-pulse" />
                </div>
                <h1 className="text-4xl font-black text-white tracking-tighter animate-pulse">
                    Ready<span className="text-blue-500">2</span>Go
                </h1>
                <p className="text-blue-400/60 font-bold uppercase tracking-[0.3em] text-[10px] mt-4">Initializing Tactical Safety Grid</p>

                {/* Background effects */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-white text-slate-900 selection:bg-blue-100 selection:text-blue-900">
            {/* Nav */}
            <nav className={cn(
                "fixed top-0 left-0 right-0 z-50 px-6 py-4 transition-all duration-700 h-20 flex items-center bg-white/80 backdrop-blur-md border-b border-slate-100",
                showContent ? "translate-y-0 opacity-100" : "-translate-y-10 opacity-0"
            )}>
                <div className="max-w-7xl mx-auto w-full flex justify-between items-center">
                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => window.location.reload()}>
                        <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white transition-transform group-hover:scale-110 group-hover:rotate-3 shadow-lg shadow-slate-200">
                            <Zap className="w-5 h-5 fill-current" />
                        </div>
                        <span className="text-2xl font-black tracking-tighter">Ready<span className="text-blue-600">2</span>Go</span>
                    </div>

                    <div className="hidden md:flex items-center gap-8">
                        {['Features', 'Resource Map', 'Community', 'About'].map((item) => (
                            <a key={item} href="#" className="text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors">{item}</a>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        <Link href="/login">
                            <Button variant="ghost" className="font-bold text-sm h-10 px-6 rounded-xl hover:bg-slate-50">Log In</Button>
                        </Link>
                        <Link href="/signup">
                            <Button className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm h-10 px-6 rounded-xl shadow-lg shadow-blue-100 transition-all hover:scale-[1.02] active:scale-[0.98]">Sign Up</Button>
                        </Link>
                    </div>
                </div>
            </nav>

            <main className="relative pt-32 pb-20 overflow-hidden">
                {/* Hero Glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl aspect-video bg-gradient-to-b from-blue-50/50 to-transparent rounded-full blur-[100px] -z-10" />

                <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    {/* Hero Left */}
                    <div className={cn(
                        "transition-all duration-1000",
                        showContent ? "translate-x-0 opacity-100" : "-translate-x-20 opacity-0"
                    )}>
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-xs font-black uppercase tracking-widest mb-8">
                            <Activity className="w-4 h-4 animate-pulse" />
                            Active Alert Monitoring 24/7
                        </div>

                        <h1 className="text-5xl md:text-7xl font-black leading-[1.1] tracking-tighter text-slate-900 mb-8">
                            Next-Gen <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Safety System</span>
                        </h1>

                        <p className="text-lg md:text-xl text-slate-500 font-medium leading-relaxed max-w-lg mb-12">
                            A powerful, real-time emergency intelligence dashboard. Protect your family,
                            track resources, and get AI-powered insights during crisis events.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <Link href="/login" className="flex-1 sm:flex-none">
                                <Button className="h-16 px-10 text-lg font-black bg-slate-900 hover:bg-slate-800 text-white rounded-2xl shadow-2xl shadow-slate-200 w-full group">
                                    <Lock className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" />
                                    Access Portal
                                    <ArrowRight className="ml-3 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </Link>
                            <Link href="/signup" className="flex-1 sm:flex-none">
                                <Button variant="outline" className="h-16 px-10 text-lg font-black border-slate-200 text-slate-900 hover:bg-slate-50 rounded-2xl w-full border-2 group">
                                    <UserPlus className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform" />
                                    Create Account
                                </Button>
                            </Link>
                        </div>

                        <div className="mt-12 flex items-center gap-6">
                            <div className="flex -space-x-3">
                                {[1, 2, 3, 4].map((i) => (
                                    <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center overflow-hidden">
                                        <img src={`https://i.pravatar.cc/100?u=${i}`} alt="user" />
                                    </div>
                                ))}
                                <div className="w-10 h-10 rounded-full border-2 border-white bg-blue-600 flex items-center justify-center text-[10px] font-black text-white">+2k</div>
                            </div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Joined the safety grid</p>
                        </div>
                    </div>

                    {/* Hero Right - Interactive Cards */}
                    <div className={cn(
                        "relative transition-all duration-1000 delay-300",
                        showContent ? "translate-x-0 opacity-100" : "translate-x-20 opacity-0"
                    )}>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-4 pt-12">
                                <FeatureCard
                                    icon={<ShieldCheck className="w-6 h-6" />}
                                    title="EOC Controls"
                                    desc="Full emergency operations center controls."
                                    color="bg-blue-50 text-blue-600"
                                />
                                <FeatureCard
                                    icon={<Globe className="w-6 h-6" />}
                                    title="Global Alerts"
                                    desc="Hyper-local alerts for any location."
                                    color="bg-indigo-50 text-indigo-600"
                                />
                            </div>
                            <div className="space-y-4">
                                <FeatureCard
                                    icon={<Activity className="w-6 h-6" />}
                                    title="Live Radar"
                                    desc="Real-time earthquake & weather tracking."
                                    color="bg-red-50 text-red-600"
                                />
                                <FeatureCard
                                    icon={<Users className="w-6 h-6" />}
                                    title="Family Sync"
                                    desc="Instant safety status for your group."
                                    color="bg-emerald-50 text-emerald-600"
                                />
                                <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-2xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                                    <h4 className="text-sm font-black mb-2 uppercase tracking-widest text-blue-400">Tactical Mode</h4>
                                    <p className="text-xs font-medium opacity-70 mb-4 leading-relaxed">Dynamic response system that adapts to crisis severity levels.</p>
                                    <div className="flex items-center gap-2 text-[10px] font-black text-white/90">
                                        LEARN MORE <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Floating elements */}
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-100/50 rounded-full blur-3xl -z-10 animate-pulse" />
                    </div>
                </div>
            </main>

            {/* Sub Hero Section */}
            <section className="bg-slate-50 py-24 border-y border-slate-100">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-4">Core Infrastructure</h2>
                        <p className="text-slate-500 font-medium">Built for speed, reliability, and human safety.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                        {[
                            { icon: <Lock />, title: 'Vault Security', desc: 'Enterprise encryption for your data.' },
                            { icon: <Zap />, title: 'Instant Load', desc: 'Sub-millisecond alert propagation.' },
                            { icon: <Heart />, title: 'Aid Networks', desc: 'Direct connection to relief services.' },
                            { icon: <Shield />, title: 'Smart Guards', desc: 'AI-monitored perimeter safety.' },
                        ].map((item, i) => (
                            <div key={i} className="p-8 bg-white border border-slate-200 rounded-[32px] hover:shadow-xl transition-all duration-500 hover:-translate-y-1 group">
                                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-900 mb-6 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    {item.icon}
                                </div>
                                <h3 className="text-lg font-black text-slate-900 mb-2 uppercase tracking-tight">{item.title}</h3>
                                <p className="text-sm text-slate-500 font-medium leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 border-t border-slate-100 text-center">
                <div className="flex items-center justify-center gap-2 mb-6">
                    <div className="w-6 h-6 bg-slate-900 rounded flex items-center justify-center text-[10px] text-white font-black">R2G</div>
                    <span className="text-lg font-black tracking-tighter">Ready<span className="text-blue-600">2</span>Go</span>
                </div>
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">© 2026 Ready2Go Emergency Systems. All rights reserved.</p>
            </footer>
        </div>
    )
}

function FeatureCard({ icon, title, desc, color }: { icon: React.ReactNode, title: string, desc: string, color: string }) {
    return (
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-xl shadow-slate-200/50 hover:shadow-2xl hover:shadow-blue-100 transition-all duration-500 group">
            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 group-hover:rotate-3", color)}>
                {icon}
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-2 tracking-tight uppercase leading-none">{title}</h3>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">{desc}</p>
            <div className="mt-4 flex items-center text-[10px] font-black text-blue-600 gap-1 opacity-0 group-hover:opacity-100 translate-x-[-10px] group-hover:translate-x-0 transition-all">
                EXPLORE <ChevronRight className="w-3 h-3" />
            </div>
        </div>
    )
}
