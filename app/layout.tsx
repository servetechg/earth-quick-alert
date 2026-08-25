import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/components/providers/auth-provider'
import { EmergencyProvider } from '@/components/providers/emergency-provider'
import { UserProvider } from '@/lib/store/user-store'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Emergency Dashboard - Hazard Portal',
  description: 'Real-time situational awareness, alerts, and community response tools for hazard management',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

import { SafetyProvider } from '@/components/providers/safety-provider'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className={`font-sans antialiased`} suppressHydrationWarning>
        <AuthProvider>
          <UserProvider>
            <SafetyProvider>
              <EmergencyProvider>
                {children}
              </EmergencyProvider>
            </SafetyProvider>
          </UserProvider>
        </AuthProvider>
        <Toaster />
        <SonnerToaster />
        <Analytics />
      </body>
    </html>
  )
}
