'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const IDLE_MS = 30 * 60 * 1000

export const SECURITY_PREFS_UPDATED_EVENT = 'r2g-security-prefs-updated'

function clearSiteSessionStorage() {
  try {
    const keys = [
      'userRole',
      'userEmail',
      'userName',
      'userCity',
      'userState',
      'userCountry',
      'systemMode',
      'isSafe',
      'userLocation',
    ]
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

export function SessionIdleWatcher() {
  const router = useRouter()
  const enabledRef = useRef(false)
  const lastBumpRef = useRef(0)
  const checkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const signOutIdle = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
    } catch {
      /* ignore */
    }
    clearSiteSessionStorage()
    router.replace('/login')
  }, [router])

  const bump = useCallback(() => {
    if (!enabledRef.current) return
    lastBumpRef.current = Date.now()
  }, [])

  const refreshEnabled = useCallback(async () => {
    try {
      const res = await fetch('/api/user/security', { credentials: 'same-origin' })
      if (!res.ok) {
        enabledRef.current = false
        return
      }
      const j = await res.json().catch(() => ({}))
      enabledRef.current = Boolean(j?.data?.sessionTimeoutEnabled)
      if (enabledRef.current) {
        bump()
      }
    } catch {
      enabledRef.current = false
    }
  }, [bump])

  useEffect(() => {
    void refreshEnabled()
    window.addEventListener(SECURITY_PREFS_UPDATED_EVENT, refreshEnabled)

    const onActivity = () => {
      const now = Date.now()
      if (now - lastBumpRef.current > 4000) {
        bump()
      }
    }

    const opts: AddEventListenerOptions = { passive: true }
    window.addEventListener('mousemove', onActivity, opts)
    window.addEventListener('mousedown', onActivity, opts)
    window.addEventListener('keydown', onActivity, opts)
    window.addEventListener('scroll', onActivity, opts)
    window.addEventListener('touchstart', onActivity, opts)
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') bump()
    })

    checkTimerRef.current = setInterval(() => {
      if (!enabledRef.current || lastBumpRef.current === 0) return
      if (Date.now() - lastBumpRef.current >= IDLE_MS) {
        enabledRef.current = false
        void signOutIdle()
      }
    }, 30_000)

    return () => {
      window.removeEventListener(SECURITY_PREFS_UPDATED_EVENT, refreshEnabled)
      window.removeEventListener('mousemove', onActivity)
      window.removeEventListener('mousedown', onActivity)
      window.removeEventListener('keydown', onActivity)
      window.removeEventListener('scroll', onActivity)
      window.removeEventListener('touchstart', onActivity)
      if (checkTimerRef.current) {
        clearInterval(checkTimerRef.current)
        checkTimerRef.current = null
      }
    }
  }, [bump, refreshEnabled, signOutIdle])

  return null
}
