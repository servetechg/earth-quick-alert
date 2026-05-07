'use client'

import React, { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type UploadResult = { url: string; public_id: string }

export function ImageUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UploadResult | null>(null)

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  async function onUpload() {
    if (!file) return
    setLoading(true)
    setError(null)

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'earthquick')

      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const json = await res.json()

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || json?.message || 'Upload failed')
      }

      setResult({ url: json.url, public_id: json.public_id })
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  async function onDelete() {
    if (!result?.public_id) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_id: result.public_id }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || json?.message || 'Delete failed')
      }
      setResult(null)
    } catch (e: any) {
      setError(e?.message || 'Delete failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="space-y-2">
        <div className="text-sm font-semibold">Cloudinary image upload</div>
        <div className="text-xs text-muted-foreground">Pick a jpeg/png/webp (max 10MB), then upload.</div>
      </div>

      <div className="flex gap-3 items-center">
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <Button onClick={onUpload} disabled={!file || loading}>
          {loading ? 'Working…' : 'Upload'}
        </Button>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {previewUrl && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Local preview</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Selected" className="max-h-56 rounded-md border object-contain bg-white" />
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Uploaded</div>
          <div className="text-xs break-all">
            <div>
              <span className="font-semibold">public_id:</span> {result.public_id}
            </div>
            <div>
              <span className="font-semibold">url:</span> {result.url}
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result.url} alt="Uploaded" className="max-h-56 rounded-md border object-contain bg-white" />

          <Button variant="destructive" onClick={onDelete} disabled={loading}>
            {loading ? 'Working…' : 'Delete from Cloudinary'}
          </Button>
        </div>
      )}
    </Card>
  )
}

