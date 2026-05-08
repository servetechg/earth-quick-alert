'use client'

import * as React from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Left accent + title block used on Licenses, Alerts, Preparedness, Settings, etc. */
export interface AdminPageHeaderProps {
  title: string
  description: string
  /** Right column (buttons, badges). Omit when empty. */
  actions?: React.ReactNode
  /** Licenses / Sub-Admins use `uppercase`; set false for sentence-case titles. @default true */
  titleUppercase?: boolean
  className?: string
}

export function AdminPageHeader({
  title,
  description,
  actions,
  titleUppercase = true,
  className,
}: AdminPageHeaderProps) {
  return (
    <Card
      className={cn(
        'border-slate-200 rounded-2xl bg-white p-8 shadow-sm transition-all relative overflow-hidden group hover:shadow-md',
        className,
      )}
    >
      <div
        className="absolute top-0 left-0 h-full w-1.5 bg-[#33375D]"
        aria-hidden
      />
      <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <h1
            className={cn(
              'mb-2 text-3xl font-black tracking-tight text-slate-900',
              titleUppercase && 'uppercase',
            )}
          >
            {title}
          </h1>
          <p className="max-w-4xl font-medium leading-relaxed text-slate-500">{description}</p>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-4 md:justify-end">{actions}</div>
        ) : null}
      </div>
    </Card>
  )
}
