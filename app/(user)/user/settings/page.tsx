'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, Mail, MapPin, ArrowLeft, Save, CheckCircle2, AlertCircle } from 'lucide-react'

export default function EditProfilePage() {
    const router = useRouter()
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [location, setLocation] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState({ type: '', text: '' })

    useEffect(() => {
        // Load initial data from localStorage
        setName(localStorage.getItem('userName') || '')
        setEmail(localStorage.getItem('userEmail') || '')
        setLocation(localStorage.getItem('userLocation') || '')
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage({ type: '', text: '' })

        try {
            const response = await fetch('/api/user/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, location }),
            })

            const data = await response.json()

            if (response.ok) {
                // Update localStorage
                localStorage.setItem('userName', name)
                localStorage.setItem('userEmail', email)
                localStorage.setItem('userLocation', location)

                setMessage({ type: 'success', text: 'Profile updated successfully!' })

                // Optional: Refresh page to update Header if not using a shared state
                // window.location.reload() 
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to update profile' })
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'An error occurred. Please try again.' })
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="flex-1 overflow-auto bg-slate-50 p-6 md:p-8">
            <div className="max-w-3xl mx-auto space-y-8">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full hover:bg-slate-200"
                        onClick={() => router.back()}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Edit Profile</h1>
                        <p className="text-slate-500 font-medium">Manage your personal information and preferences.</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    <Card className="p-8 border-slate-200 shadow-sm bg-white rounded-3xl space-y-8">
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</Label>
                                    <div className="relative">
                                        <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                        <Input
                                            id="name"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="pl-12 py-6 rounded-2xl border-slate-200 focus:ring-blue-500 font-medium"
                                            placeholder="Enter your name"
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                        <Input
                                            id="email"
                                            type="email"
                                            value={email}
                                            disabled
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="pl-12 py-6 rounded-2xl border-slate-200 focus:ring-blue-500 font-medium"
                                            placeholder="Enter your email"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="location" className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Base Location</Label>
                                <div className="relative">
                                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                    <Input
                                        id="location"
                                        value={location}
                                        onChange={(e) => setLocation(e.target.value)}
                                        className="pl-12 py-6 rounded-2xl border-slate-200 focus:ring-blue-500 font-medium"
                                        placeholder="City, Area (e.g. San Francisco, CA)"
                                    />
                                </div>
                                <p className="text-[11px] text-slate-400 font-bold italic ml-1">This location is used for targeted emergency alerts when geolocator is inactive.</p>
                            </div>
                        </div>

                        {message.text && (
                            <div className={`p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                                }`}>
                                {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                                <p className="text-sm font-bold">{message.text}</p>
                            </div>
                        )}

                        <div className="pt-4 flex flex-col sm:flex-row gap-4">
                            <Button
                                type="submit"
                                disabled={loading}
                                className="flex-1 bg-[#34385E] hover:bg-[#2A2D4A] text-white font-black py-7 rounded-2xl shadow-lg transition-all active:scale-[0.98] text-lg uppercase tracking-widest gap-2"
                            >
                                <Save className="w-5 h-5" />
                                {loading ? 'UPDATING...' : 'SAVE CHANGES'}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                className="flex-1 border-slate-200 text-slate-600 font-black py-7 rounded-2xl hover:bg-slate-50 transition-all text-lg uppercase tracking-widest"
                                onClick={() => router.back()}
                            >
                                CANCEL
                            </Button>
                        </div>
                    </Card>
                </form>
            </div>
        </main>
    )
}
