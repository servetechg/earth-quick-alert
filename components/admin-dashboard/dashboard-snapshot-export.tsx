'use client'

import { useState } from 'react'
import html2canvas from 'html2canvas-pro'
import { Camera, Loader2, Mail, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

type DashboardSnapshotExportProps = {
  exportRootId?: string
  snapshotTitle?: string
  summaryLine?: string
}

const EXPORT_MIN_WIDTH_PX = 1600
const EXPORT_PADDING_PX = 32

function prepareCloneForCapture(clonedRoot: HTMLElement, captureWidth: number) {
  clonedRoot.style.width = `${captureWidth}px`
  clonedRoot.style.maxWidth = 'none'
  clonedRoot.style.minWidth = `${captureWidth}px`
  clonedRoot.style.overflow = 'visible'
  clonedRoot.style.padding = `${EXPORT_PADDING_PX}px`
  clonedRoot.style.boxSizing = 'border-box'
  clonedRoot.style.backgroundColor = '#f1f5f9'

  clonedRoot.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const cls = el.className
    if (typeof cls === 'string') {
      if (cls.includes('overflow-hidden') || cls.includes('overflow-x-hidden')) {
        el.style.overflow = 'visible'
      }
      if (cls.includes('min-w-0')) {
        el.style.minWidth = 'auto'
      }
      if (cls.includes('max-w-[')) {
        el.style.maxWidth = 'none'
      }
    }
  })

  // Ensure multi-column dashboard layout renders at full width in the clone
  clonedRoot.querySelectorAll<HTMLElement>('.flex, .grid').forEach((el) => {
    el.style.maxWidth = 'none'
  })
}

export function DashboardSnapshotExport({
  exportRootId = 'dashboard-export-root',
  snapshotTitle = 'Situational Dashboard Snapshot',
  summaryLine,
}: DashboardSnapshotExportProps) {
  const [open, setOpen] = useState(false)
  const [extraEmails, setExtraEmails] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; message: string } | null>(null)

  const captureSnapshot = async (): Promise<string | null> => {
    const root = document.getElementById(exportRootId)
    if (!root) {
      setStatus({ type: 'err', message: 'Dashboard export area not found.' })
      return null
    }

    setCapturing(true)
    setStatus(null)

    const scrollEl = document.documentElement
    const prevScrollTop = scrollEl.scrollTop
    const prevRootWidth = root.style.width
    const prevRootMaxWidth = root.style.maxWidth
    const prevRootOverflow = root.style.overflow

    scrollEl.scrollTop = 0
    root.scrollIntoView({ block: 'start' })

    const captureWidth = Math.max(
      root.scrollWidth,
      root.offsetWidth,
      root.getBoundingClientRect().width,
      EXPORT_MIN_WIDTH_PX,
    )
    const captureHeight = Math.max(root.scrollHeight, root.offsetHeight)

    root.style.width = `${captureWidth}px`
    root.style.maxWidth = 'none'
    root.style.overflow = 'visible'

    // Let layout reflow at the export width before capture
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => setTimeout(resolve, 120))

    try {
      const scale = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3)

      const canvas = await html2canvas(root, {
        useCORS: true,
        allowTaint: true,
        scale,
        backgroundColor: '#f1f5f9',
        logging: false,
        width: captureWidth + EXPORT_PADDING_PX * 2,
        height: Math.max(root.scrollHeight, captureHeight) + EXPORT_PADDING_PX * 2,
        windowWidth: captureWidth + EXPORT_PADDING_PX * 2,
        windowHeight: Math.max(root.scrollHeight, captureHeight) + EXPORT_PADDING_PX * 2,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        ignoreElements: (el) => el.classList?.contains('dashboard-export-ignore') ?? false,
        onclone: (_doc, clonedRoot) => {
          prepareCloneForCapture(clonedRoot as HTMLElement, captureWidth)
        },
      })

      const dataUrl = canvas.toDataURL('image/png', 1.0)
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
      return base64
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to capture dashboard'
      setStatus({ type: 'err', message: msg })
      return null
    } finally {
      root.style.width = prevRootWidth
      root.style.maxWidth = prevRootMaxWidth
      root.style.overflow = prevRootOverflow
      scrollEl.scrollTop = prevScrollTop
      setCapturing(false)
    }
  }

  const handleDownload = async () => {
    const base64 = await captureSnapshot()
    if (!base64) return
    const link = document.createElement('a')
    link.href = `data:image/png;base64,${base64}`
    link.download = `Ready2Go-Dashboard-${new Date().toISOString().slice(0, 10)}.png`
    link.click()
    setStatus({ type: 'ok', message: 'Snapshot downloaded.' })
  }

  const handleEmail = async () => {
    const base64 = await captureSnapshot()
    if (!base64) return

    setSending(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/dashboard-snapshot/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          snapshotTitle,
          summaryLine,
          extraEmails,
          filename: `Ready2Go-Dashboard-${new Date().toISOString().slice(0, 10)}.png`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to email snapshot')
      }
      setStatus({
        type: 'ok',
        message: `Snapshot emailed to ${data.sentCount ?? data.recipientCount ?? 0} recipient(s).`,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to email snapshot'
      setStatus({ type: 'err', message: msg })
    } finally {
      setSending(false)
    }
  }

  const busy = capturing || sending

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="dashboard-export-ignore gap-2 font-bold text-xs uppercase tracking-wide border-slate-200"
        onClick={() => {
          setStatus(null)
          setOpen(true)
        }}
      >
        <Camera className="h-3.5 w-3.5" />
        Export Snapshot
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-[#33375D]" />
              Dashboard Snapshot
            </DialogTitle>
            <DialogDescription>
              Capture the current dashboard view and email it to approved responders. You can add
              extra recipients below (comma or newline separated).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="snapshot-extra-emails" className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Additional recipients (optional)
              </Label>
              <Textarea
                id="snapshot-extra-emails"
                value={extraEmails}
                onChange={(e) => setExtraEmails(e.target.value)}
                placeholder="responder@agency.gov, ops@example.org"
                rows={3}
                className="mt-1.5 text-sm"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Approved responders are always included automatically.
              </p>
            </div>

            {status && (
              <div
                className={`rounded-lg border px-3 py-2 text-sm ${
                  status.type === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {status.message}
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void handleDownload()}
              className="gap-2"
            >
              {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PNG
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void handleEmail()}
              className="gap-2 bg-[#33375D] hover:bg-[#2B2F50]"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Email to Responders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
