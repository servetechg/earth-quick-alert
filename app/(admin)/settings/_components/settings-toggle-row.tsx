import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface SettingsToggleRowProps {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  switchClassName?: string
}

export function SettingsToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  switchClassName,
}: SettingsToggleRowProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/50 px-4 py-3">
      <div className="space-y-0.5">
        <Label className="text-sm font-semibold">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className={cn('data-[state=checked]:bg-[#33375D]', switchClassName)}
      />
    </div>
  )
}
