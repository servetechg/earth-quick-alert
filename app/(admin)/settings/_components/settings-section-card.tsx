import type { ReactNode } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface SettingsSectionCardProps {
  title: string
  description: string
  icon: ReactNode
  children: ReactNode
}

export function SettingsSectionCard({
  title,
  description,
  icon,
  children,
}: SettingsSectionCardProps) {
  return (
    <Card className="shadow-card border-border/60 rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  )
}
