'use client'

import { Toaster as Sonner, type ToasterProps } from 'sonner'

/** App-wide Sonner host — most admin pages call `toast` from `sonner`. */
export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-right"
      richColors
      closeButton
      {...props}
    />
  )
}
