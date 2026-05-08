'use client';

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Zap, Bell, Eye, CheckCircle, AlertCircle, Shield, Terminal, Radio, Activity, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EnhancedAlertModal } from './modals/enhanced-alert-modal'
import { ActiveEmergencyEventsModal } from './modals/active-emergency-events-modal'
import { GISEOCActivatedModal } from './modals/gis-eoc-activated-modal'
import { SituationReportModal } from './modals/situation-report-modal'
import { RecoveryToolsModal } from './modals/recovery-tools-modal'
import { ManageRespondersModal } from './modals/manage-responders-modal'

interface QuickActionButtonsProps {
  onSendAlert?: () => void
  onOpenEvents?: () => void
  onActivateEOC?: () => void
  onOpenSitRep?: () => void
  onOpenRecovery?: () => void
}

export function QuickActionButtons({
  onSendAlert,
  onOpenEvents,
  onActivateEOC,
  onOpenSitRep,
  onOpenRecovery
}: QuickActionButtonsProps) {
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false)
  const [isEventsModalOpen, setIsEventsModalOpen] = useState(false)
  const [isEOCModalOpen, setIsEOCModalOpen] = useState(false)
  const [isSitRepModalOpen, setIsSitRepModalOpen] = useState(false)
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false)
  const [isRespondersModalOpen, setIsRespondersModalOpen] = useState(false)

  const actions = [
    { label: 'Activate Virtual EOC', color: 'bg-red-600 hover:bg-red-500 shadow-red-600/20', icon: Zap, onClick: () => setIsEOCModalOpen(true), badge: 'Command' },
    { label: 'Enhanced Alert Matrix', color: 'bg-[#33375D] hover:bg-[#2B2F50] shadow-[#33375D]/25', icon: Bell, onClick: () => setIsAlertModalOpen(true), badge: 'Matrix' },
    { label: 'Personnel & Access', color: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20', icon: Shield, onClick: () => setIsRespondersModalOpen(true), badge: 'Identity' },
    { label: 'SitRep Matrix', color: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20', icon: Activity, onClick: () => setIsSitRepModalOpen(true), badge: 'Core' },
    { label: 'Recovery Suite', color: 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20', icon: Shield, onClick: () => setIsRecoveryModalOpen(true), badge: 'Vault' }
  ]

  return (
    <>
      <div className="bg-white border border-slate-100 rounded-[40px] p-8 relative overflow-hidden group shadow-xl shadow-slate-200/50">
        {/* Background Artifact */}
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity pointer-events-none">
          <Terminal size={120} className="rotate-12" />
        </div>

        <div className="relative z-10 flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#33375D] rounded-2xl flex items-center justify-center text-white shadow-xl shadow-[#33375D]/25">
              <Terminal size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">Command Interface</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">High-Priority Administrative Actions</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#33375D]/10 border border-[#33375D]/20 rounded-xl">
             <Target size={12} className="text-[#33375D]" />
             <span className="text-[10px] font-black text-[#33375D] uppercase tracking-[0.2em]">Operational Console</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 relative z-10">
          {actions.map((action, idx) => (
            <Button
              key={idx}
              onClick={action.onClick}
              className={cn(
                "h-auto flex-col items-start gap-4 p-6 rounded-3xl border border-slate-100 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg text-white group/btn",
                action.color
              )}
            >
              <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center group-hover/btn:scale-110 transition-transform">
                <action.icon size={20} />
              </div>
              <div className="flex flex-col items-start gap-1">
                <span className="text-[13px] font-black uppercase tracking-tight leading-none text-left">{action.label}</span>
                <span className="text-[9px] font-black uppercase tracking-[0.3em] opacity-40 group-hover/btn:opacity-100 transition-opacity">{action.badge} ACCESS</span>
              </div>
            </Button>
          ))}
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center text-[8px] font-black text-slate-400 uppercase tracking-[0.4em] italic">
           <span>Authorization Req: Super Admin Level 4</span>
           <span>ECC-256 Signature Validated</span>
        </div>
      </div>

      <EnhancedAlertModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
      />
      <ManageRespondersModal
        isOpen={isRespondersModalOpen}
        onClose={() => setIsRespondersModalOpen(false)}
      />
      <ActiveEmergencyEventsModal
        isOpen={isEventsModalOpen}
        onClose={() => setIsEventsModalOpen(false)}
      />
      <GISEOCActivatedModal
        isOpen={isEOCModalOpen}
        onClose={() => setIsEOCModalOpen(false)}
      />
      <SituationReportModal
        isOpen={isSitRepModalOpen}
        onClose={() => setIsSitRepModalOpen(false)}
      />
      <RecoveryToolsModal
        isOpen={isRecoveryModalOpen}
        onClose={() => setIsRecoveryModalOpen(false)}
      />
    </>
  )
}
