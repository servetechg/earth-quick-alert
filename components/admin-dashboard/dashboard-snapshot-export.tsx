'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'

type SnapshotResponderRecipient = {
  id: string
  name: string
  email: string
  unitType: string
}

type DashboardSnapshotExportProps = {
  exportRootId?: string
  snapshotTitle?: string
  summaryLine?: string
  /** Sub-admin: pick specific responders or send to all scoped responders. */
  subAdminRecipientPicker?: boolean
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

  clonedRoot.querySelectorAll<HTMLElement>('.flex, .grid').forEach((el) => {
    el.style.maxWidth = 'none'
  })
}

export function DashboardSnapshotExport({
  exportRootId = 'dashboard-export-root',
  snapshotTitle = 'Situational Dashboard Snapshot',
  summaryLine,
  subAdminRecipientPicker = false,
}: DashboardSnapshotExportProps) {
  const [open, setOpen] = useState(false)
  const [extraEmails, setExtraEmails] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; message: string } | null>(null)

  const [responders, setResponders] = useState<SnapshotResponderRecipient[]>([])
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  const [sendToAllResponders, setSendToAllResponders] = useState(true)
  const [selectedResponderIds, setSelectedResponderIds] = useState<Set<string>>(new Set())

  const loadRecipients = useCallback(async () => {
    if (!subAdminRecipientPicker) return
    setLoadingRecipients(true)
    try {
      const res = await fetch('/api/admin/dashboard-snapshot/recipients')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to load responders')
      }
      const list = Array.isArray(data.responders) ? data.responders : []
      setResponders(list)
      setSelectedResponderIds(new Set(list.map((r: SnapshotResponderRecipient) => r.id)))
    } catch (e) {
      setResponders([])
      setStatus({
        type: 'err',
        message: e instanceof Error ? e.message : 'Could not load responders',
      })
    } finally {
      setLoadingRecipients(false)
    }
  }, [subAdminRecipientPicker])

  useEffect(() => {
    if (open && subAdminRecipientPicker) {
      void loadRecipients()
    }
  }, [open, subAdminRecipientPicker, loadRecipients])

  const resetDialogState = () => {
    setExtraEmails('')
    setStatus(null)
    setSendToAllResponders(true)
  }

  const toggleResponder = (id: string, checked: boolean) => {
    setSelectedResponderIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

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
      return dataUrl.replace(/^data:image\/png;base64,/, '')
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
    if (subAdminRecipientPicker && !sendToAllResponders && selectedResponderIds.size === 0) {
      setStatus({ type: 'err', message: 'Select at least one responder or choose Send to all.' })
      return
    }

    const base64 = await captureSnapshot()
    if (!base64) return

    setSending(true)
    setStatus(null)
    try {
      const payload: Record<string, unknown> = {
        imageBase64: base64,
        snapshotTitle,
        summaryLine,
        extraEmails,
        filename: `Ready2Go-Dashboard-${new Date().toISOString().slice(0, 10)}.png`,
      }

      if (subAdminRecipientPicker) {
        payload.sendToAllResponders = sendToAllResponders
        if (!sendToAllResponders) {
          payload.responderIds = Array.from(selectedResponderIds)
        }
      }

      const res = await fetch('/api/admin/dashboard-snapshot/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
  const emailDisabled =
    busy ||
    (subAdminRecipientPicker &&
      !sendToAllResponders &&
      selectedResponderIds.size === 0 &&
      !loadingRecipients)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="dashboard-export-ignore gap-2 font-bold text-xs uppercase tracking-wide border-slate-200"
        onClick={() => {
          resetDialogState()
          setOpen(true)
        }}
      >
        <Camera className="h-3.5 w-3.5" />
        Export Snapshot
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-[#33375D]" />
              Dashboard Snapshot
            </DialogTitle>
            <DialogDescription>
              {subAdminRecipientPicker
                ? 'Capture the dashboard and email it to your responders. Choose all responders or select specific people.'
                : 'Capture the current dashboard view and email it to approved responders. You can add extra recipients below.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {subAdminRecipientPicker ? (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <Label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Responders
                </Label>

                {loadingRecipients ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading responders…
                  </div>
                ) : responders.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No approved responders with email were found for your license area.
                  </p>
                ) : (
                  <>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <Checkbox
                        checked={sendToAllResponders}
                        onCheckedChange={(v) => setSendToAllResponders(v === true)}
                        className="mt-0.5"
                      />
                      <span className="text-sm leading-snug">
                        <span className="font-semibold text-slate-800">
                          Send to all responders
                        </span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {responders.length} approved responder
                          {responders.length === 1 ? '' : 's'} in your area
                        </span>
                      </span>
                    </label>

                    {!sendToAllResponders ? (
                      <div className="space-y-2 pt-1 border-t border-slate-200">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            Select recipients
                          </p>
                          <div className="flex gap-2 text-[10px] font-bold uppercase">
                            <button
                              type="button"
                              className="text-[#33375D] hover:underline"
                              onClick={() =>
                                setSelectedResponderIds(new Set(responders.map((r) => r.id)))
                              }
                            >
                              All
                            </button>
                            <button
                              type="button"
                              className="text-slate-400 hover:underline"
                              onClick={() => setSelectedResponderIds(new Set())}
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                        <ul className="max-h-40 overflow-y-auto space-y-2 pr-1">
                          {responders.map((r) => (
                            <li key={r.id}>
                              <label className="flex items-start gap-2.5 cursor-pointer rounded-md px-1 py-0.5 hover:bg-white/80">
                                <Checkbox
                                  checked={selectedResponderIds.has(r.id)}
                                  onCheckedChange={(v) => toggleResponder(r.id, v === true)}
                                  className="mt-0.5"
                                />
                                <span className="min-w-0 text-sm leading-snug">
                                  <span className="font-medium text-slate-800 block truncate">
                                    {r.name}
                                  </span>
                                  <span className="text-xs text-slate-500 block truncate">
                                    {r.unitType} · {r.email}
                                  </span>
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-slate-400 -mt-1">
                Approved responders are included automatically.
              </p>
            )}

            <div>
              <Label
                htmlFor="snapshot-extra-emails"
                className="text-xs font-bold uppercase tracking-wide text-slate-500"
              >
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
              {capturing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download PNG
            </Button>
            <Button
              type="button"
              disabled={emailDisabled}
              onClick={() => void handleEmail()}
              className="gap-2 bg-[#33375D] hover:bg-[#2B2F50]"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Email to Responders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
