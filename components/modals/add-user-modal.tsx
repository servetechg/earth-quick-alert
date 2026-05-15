'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  UserPlus,
  Shield,
  Eye,
  Loader2,
  Mail,
  Lock,
  User,
  Upload,
  FileText,
  CheckCircle2
} from "lucide-react"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MapPin } from "lucide-react"

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddUserModal({ isOpen, onClose, onSuccess }: AddUserModalProps) {
  const [loading, setLoading] = useState(false)
  const [bulkData, setBulkData] = useState<any[] | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'eoc-observer',
    responderFunction: ''
  })

  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      try {
        const lines = text.split(/\r?\n/).filter(line => line.trim())
        if (lines.length < 2) {
          toast.error("CSV file must have at least a header and one data row")
          return
        }

        // Basic CSV parsing (handles simple commas)
        const headers = lines[0].toLowerCase().split(',').map(h => h.trim())
        const rows = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim())
          const obj: any = {}
          headers.forEach((header, index) => {
            if (header === 'name') obj.name = values[index]
            if (header === 'email') obj.email = values[index]
            if (header === 'role') obj.role = values[index] || 'eoc-observer'
            if (header === 'password') obj.password = values[index]
            if (header === 'function' || header === 'responderfunction') obj.responderFunction = values[index]
          })
          return obj
        }).filter(row => row.name && row.email && row.password)

        if (rows.length === 0) {
          toast.error("No valid user data found in CSV. Required headers: name, email, password")
          return
        }

        setBulkData(rows)
        toast.success(`Parsed ${rows.length} users from CSV`)
      } catch (err) {
        toast.error("Failed to parse CSV file")
      }
    }
    reader.readAsText(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = bulkData || formData
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()

      if (res.ok) {
        toast.success(data.message || `User(s) successfully created`)
        onSuccess()
        onClose()
        setFormData({ name: '', email: '', password: '', role: 'eoc-observer', responderFunction: '' })
        setBulkData(null)
      } else {
        toast.error(data.error || 'Failed to create user(s)')
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] rounded-[32px] border-none shadow-2xl p-0 overflow-y-auto max-h-[95vh] bg-white outline-none">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <DialogHeader className="bg-slate-50 p-8 pt-10 border-b border-slate-100 sticky top-0 z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#33375D] text-white shadow-xl shadow-[#33375D]/20">
                  <UserPlus className="text-white" size={28} />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black tracking-tight text-slate-900 uppercase">Add Team Member</DialogTitle>
                  <DialogDescription className="text-slate-500 font-medium leading-tight mt-1 truncate max-w-[200px]">Onboard operational personnel.</DialogDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".csv"
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border-blue-100 bg-white text-blue-600 hover:bg-blue-50 font-bold text-[10px] h-10 px-3 uppercase tracking-wider gap-2 shadow-sm"
                >
                  <Upload size={14} /> Bulk CSV
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="p-8 space-y-5">
            {bulkData ? (
              <div className="bg-emerald-50 border-2 border-emerald-100 rounded-[24px] p-6 text-center animate-in zoom-in-95 duration-300">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-emerald-100 text-emerald-600">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-emerald-900 font-black uppercase tracking-tight text-lg">Batch Data Loaded</h3>
                <p className="text-emerald-600 font-bold text-xs mt-1 uppercase tracking-widest">{bulkData.length} Users Ready for Import</p>
                <button
                  type="button"
                  onClick={() => setBulkData(null)}
                  className="mt-6 text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] hover:underline"
                >
                  Click to cancel and add single user
                </button>

                <div className="mt-6 pt-6 border-t border-emerald-100 flex items-center gap-3 px-2">
                  <FileText className="text-emerald-300 shrink-0" size={16} />
                  <p className="text-[9px] text-emerald-800 text-left font-medium leading-relaxed italic">
                    Email addresses and roles will be validated upon submission. Existing users will be skipped.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Full Name</Label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. John Doe"
                      className="h-14 pl-12 border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 rounded-2xl font-bold text-slate-700 shadow-sm"
                      required={!bulkData}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Email</Label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="name@organization.com"
                      className="h-14 pl-12 border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 rounded-2xl font-bold text-slate-700 shadow-sm"
                      required={!bulkData}
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="responderFunction" className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Specific Function / Role</Label>
                    <div className="relative group">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                      <Input
                        id="responderFunction"
                        value={formData.responderFunction}
                        onChange={(e) => setFormData({ ...formData, responderFunction: e.target.value })}
                        placeholder="e.g. Search & Rescue, Medical, Shelter Lead"
                        className="h-14 pl-12 border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 rounded-2xl font-bold text-slate-700 shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Role</Label>
                      <Select value={formData.role} onValueChange={(val) => setFormData({ ...formData, role: val })}>
                        <SelectTrigger className="h-14 border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 rounded-2xl font-bold text-slate-700 shadow-sm">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-slate-100 shadow-2xl">
                          <SelectItem value="eoc-manager" className="rounded-xl focus:bg-blue-50 py-3">
                            <div className="flex items-center gap-2">
                              <Shield size={16} className="text-indigo-600" />
                              <span className="font-bold text-xs uppercase tracking-tight">Leader</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="eoc-observer" className="rounded-xl focus:bg-blue-50 py-3">
                            <div className="flex items-center gap-2">
                              <Eye size={16} className="text-indigo-600" />
                              <span className="font-bold text-xs uppercase tracking-tight">Responder</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pass" className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Password</Label>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
                        <Input
                          id="pass"
                          type="password"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          className="h-14 pl-12 border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 rounded-2xl font-bold text-slate-700 shadow-sm"
                          required={!bulkData}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3">
              <Shield className="text-amber-600 shrink-0" size={18} />
              <p className="text-[10px] text-amber-700 font-bold uppercase leading-relaxed tracking-wider">
                Total organization capacity is limited to 500 personnel accounts. {bulkData ? 'Bulk import will immediately grant access once verified.' : 'This user will have immediate access to your EOC dashboard.'}
              </p>
            </div>
            {!bulkData && (
              <p className="text-center text-[9px] text-slate-400 font-bold uppercase tracking-widest italic pt-2">
                Tip: Use Bulk CSV for faster onboarding of entire teams
              </p>
            )}
          </div>

          <DialogFooter className="p-8 pt-2 bg-white flex flex-col sm:flex-row gap-3">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 h-14 rounded-2xl border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="h-14 flex-1 gap-2 rounded-2xl bg-[#33375D] font-black uppercase tracking-widest text-white shadow-xl shadow-[#33375D]/20 transition-all hover:bg-[#2B2F50] text-xs">
              {loading ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : bulkData ? <><Upload size={18} /> IMPORT {bulkData.length} USERS</> : <><UserPlus size={18} /> ADD USER</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
