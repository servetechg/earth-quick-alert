'use client'

import React, { useMemo } from 'react'
import { Building2, ChevronDown, Layers } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  ALERT_ZONE_MAP_LAYERS,
  DISASTER_ZONE_LAYER,
  HIFLD_OPERATIONAL_MAP_LAYERS,
  IMPLEMENTED_CRITICAL_INFRA_MAP_SECTORS,
  OPEN_SOURCE_MAP_LAYERS,
  ROAD_CLOSURES_MAP_LAYER,
} from '@/lib/gis/map-layer-config'

interface MapLayersDropdownProps {
  layers: Record<string, boolean>
  onChange: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void
  showCriticalInfra?: boolean
  showDisasterZones?: boolean
}

function LayerRow({
  id,
  label,
  color,
  Icon,
  checked,
  onToggle,
  compact,
}: {
  id: string
  label: string
  color: string
  Icon: React.ComponentType<{ className?: string }>
  checked: boolean
  onToggle: () => void
  compact?: boolean
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
          'font-black text-[#33375D]/95 uppercase tracking-wide cursor-pointer select-none flex-1 leading-tight',
          compact ? 'text-[10px]' : 'text-[11px]',
        )}
      >
        {label}
      </Label>
    </div>
  )
}

export function MapLayersDropdown({
  layers,
  onChange,
  showCriticalInfra = false,
  showDisasterZones = false,
}: MapLayersDropdownProps) {
  const enabledCount = useMemo(() => {
    let count = ALERT_ZONE_MAP_LAYERS.filter((l) => layers[l.id]).length
    if (layers[ROAD_CLOSURES_MAP_LAYER.id]) count += 1
    count += OPEN_SOURCE_MAP_LAYERS.filter((l) => layers[l.id]).length
    count += HIFLD_OPERATIONAL_MAP_LAYERS.filter((l) => layers[l.id]).length
    if (showCriticalInfra) {
      count += IMPLEMENTED_CRITICAL_INFRA_MAP_SECTORS.filter((s) => layers[s.id]).length
    }
    if (showDisasterZones && layers[DISASTER_ZONE_LAYER.id]) {
      count += 1
    }
    return count
  }, [layers, showCriticalInfra, showDisasterZones])

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
          {ALERT_ZONE_MAP_LAYERS.map((layer) => (
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
          <LayerRow
            id={ROAD_CLOSURES_MAP_LAYER.id}
            label={ROAD_CLOSURES_MAP_LAYER.label}
            color={ROAD_CLOSURES_MAP_LAYER.color}
            Icon={ROAD_CLOSURES_MAP_LAYER.Icon}
            checked={!!layers[ROAD_CLOSURES_MAP_LAYER.id]}
            onToggle={() => toggle(ROAD_CLOSURES_MAP_LAYER.id)}
          />
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
          {HIFLD_OPERATIONAL_MAP_LAYERS.map((layer) => (
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

        {/* {showDisasterZones && (
          <div className="mt-3 pt-2 border-t border-slate-100">
            <LayerRow
              id={DISASTER_ZONE_LAYER.id}
              label={DISASTER_ZONE_LAYER.label}
              color={DISASTER_ZONE_LAYER.color}
              Icon={DISASTER_ZONE_LAYER.Icon}
              checked={!!layers[DISASTER_ZONE_LAYER.id]}
              onToggle={() => toggle(DISASTER_ZONE_LAYER.id)}
            />
          </div>
        )} */}

        {showCriticalInfra && (
          <div className="mt-3 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5 px-1 pb-2">
              <Building2 className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                Critical Infrastructure
              </span>
            </div>
            <div className="space-y-0.5 pl-1">
              {IMPLEMENTED_CRITICAL_INFRA_MAP_SECTORS.map((sector) => (
                <LayerRow
                  key={sector.id}
                  id={sector.id}
                  label={sector.shortLabel}
                  color={sector.color}
                  Icon={sector.Icon}
                  checked={!!layers[sector.id]}
                  onToggle={() => toggle(sector.id)}
                  compact
                />
              ))}
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
