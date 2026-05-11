import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared outer layout for admin app-router pages — matches Preparedness Information
 * (horizontal padding, top spacing, bottom breathing room, max width).
 */
export function AdminPageShell({
  children,
  className,
  innerClassName,
}: {
  children: React.ReactNode
  className?: string
  innerClassName?: string
}) {
  return (
    <main className={cn('min-h-screen bg-slate-50/50 pb-20', className)}>
      <div
        className={cn(
          'mx-auto w-full max-w-[1800px] space-y-8 px-5 pt-6 lg:px-5',
          innerClassName,
        )}
      >
        {children}
      </div>
    </main>
  )
}
