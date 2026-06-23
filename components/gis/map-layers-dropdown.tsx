'use client'

import React, { useMemo } from 'react'
import { ChevronDown, Layers } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { OPEN_SOURCE_MAP_LAYERS } from '@/lib/gis/map-layer-config'

interface MapLayersDropdownProps {
  layers: Record<string, boolean>
  onChange: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void
}

function LayerRow({
  id,
  label,
  color,
  Icon,
  checked,
  onToggle,
}: {
  id: string
  label: string
  color: string
  Icon: React.ComponentType<{ className?: string }>
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 px-1 rounded-lg hover:bg-slate-50">
      <Checkbox
        id={`layer-dd-${id}`}
        checked={checked}
        onCheckedChange={onToggle}
        className="border-slate-300 data-[state=checked]:bg-[#33375D] data-[state=checked]:border-[#33375D]"
      />
      <div
        className="w-5 h-5 rounded flex items-center justify-center text-white shrink-0 shadow-sm"
        style={{ backgroundColor: color }}
      >
        <Icon className="w-3 h-3 stroke-[2.5]" />
      </div>
      <Label
        htmlFor={`layer-dd-${id}`}
        className={cn(
          'font-black text-[#33375D]/95 uppercase tracking-wide cursor-pointer select-none flex-1 leading-tight text-[11px]',
        )}
      >
        {label}
      </Label>
    </div>
  )
}

export function MapLayersDropdown({ layers, onChange }: MapLayersDropdownProps) {
  const enabledCount = useMemo(
    () => OPEN_SOURCE_MAP_LAYERS.filter((l) => layers[l.id]).length,
    [layers],
  )

  const toggle = (id: string) => {
    onChange((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap',
            'flex items-center gap-1.5 bg-white text-[#33375D] shadow-sm border border-slate-100 hover:bg-slate-50',
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          Filter
          {enabledCount > 0 && (
            <span className="ml-0.5 rounded-full bg-[#33375D] text-white text-[9px] px-1.5 py-0.5 min-w-[18px] text-center">
              {enabledCount}
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-72 max-h-[min(70vh,520px)] overflow-y-auto p-3 rounded-2xl border-slate-200 shadow-xl z-500"
      >
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1 pb-2 mb-1 border-b border-slate-100">
          Map Layers
        </p>
        <div className="space-y-0.5">
          {OPEN_SOURCE_MAP_LAYERS.map((layer) => (
            <LayerRow
              key={layer.id}
              id={layer.id}
              label={layer.label}
              color={layer.color}
              Icon={layer.Icon}
              checked={!!layers[layer.id]}
              onToggle={() => toggle(layer.id)}
            />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
