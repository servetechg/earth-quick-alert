import {
  FlaskConical,
  Building2,
  Radio,
  Factory,
  Droplets,
  Shield,
  Siren,
  Zap,
  Landmark,
  Wheat,
  Building,
  HeartPulse,
  Server,
  Atom,
  Train,
  Waves,
  type LucideIcon,
} from 'lucide-react'

/** CISA 16 National Critical Infrastructure Sectors (Dashboard A + B). */
export type CriticalInfraSectorId =
  | 'ci_chemical'
  | 'ci_commercial'
  | 'ci_communications'
  | 'ci_manufacturing'
  | 'ci_dams'
  | 'ci_defense'
  | 'ci_emergency_services'
  | 'ci_energy'
  | 'ci_financial'
  | 'ci_food_ag'
  | 'ci_government'
  | 'ci_healthcare'
  | 'ci_it'
  | 'ci_nuclear'
  | 'ci_transportation'
  | 'ci_water'

export interface CriticalInfraSectorDef {
  id: CriticalInfraSectorId
  label: string
  shortLabel: string
  Icon: LucideIcon
  color: string
  /** Google Places type when live lookup is supported */
  googlePlaceType?: string
  /** Additional place types merged in nearby search */
  googlePlaceTypes?: string[]
}

export const CRITICAL_INFRASTRUCTURE_SECTORS: CriticalInfraSectorDef[] = [
  {
    id: 'ci_chemical',
    label: 'Chemical Storage & Manufacturing',
    shortLabel: 'Chemical',
    Icon: FlaskConical,
    color: '#7C3AED',
  },
  {
    id: 'ci_commercial',
    label: 'Commercial Facilities',
    shortLabel: 'Commercial',
    Icon: Building2,
    color: '#6366F1',
    googlePlaceTypes: ['shopping_mall', 'bank', 'airport'],
  },
  {
    id: 'ci_communications',
    label: 'Communications',
    shortLabel: 'Communications',
    Icon: Radio,
    color: '#0EA5E9',
  },
  {
    id: 'ci_manufacturing',
    label: 'Critical Manufacturing',
    shortLabel: 'Manufacturing',
    Icon: Factory,
    color: '#64748B',
  },
  {
    id: 'ci_dams',
    label: 'Dams',
    shortLabel: 'Dams',
    Icon: Droplets,
    color: '#0284C7',
  },
  {
    id: 'ci_defense',
    label: 'Defense Industrial Base',
    shortLabel: 'Defense',
    Icon: Shield,
    color: '#334155',
  },
  {
    id: 'ci_emergency_services',
    label: 'Emergency Services',
    shortLabel: 'Emergency Svc',
    Icon: Siren,
    color: '#DC2626',
    googlePlaceTypes: ['fire_station', 'police'],
  },
  {
    id: 'ci_energy',
    label: 'Energy',
    shortLabel: 'Energy',
    Icon: Zap,
    color: '#EAB308',
    googlePlaceType: 'gas_station',
  },
  {
    id: 'ci_financial',
    label: 'Financial Services',
    shortLabel: 'Financial',
    Icon: Landmark,
    color: '#059669',
    googlePlaceType: 'bank',
  },
  {
    id: 'ci_food_ag',
    label: 'Food & Agriculture',
    shortLabel: 'Food & Ag',
    Icon: Wheat,
    color: '#84CC16',
    googlePlaceTypes: ['supermarket', 'grocery_or_supermarket'],
  },
  {
    id: 'ci_government',
    label: 'Government Facilities',
    shortLabel: 'Government',
    Icon: Building,
    color: '#1E3A8A',
    googlePlaceType: 'city_hall',
  },
  {
    id: 'ci_healthcare',
    label: 'Healthcare & Public Health',
    shortLabel: 'Healthcare',
    Icon: HeartPulse,
    color: '#EF4444',
    googlePlaceTypes: ['hospital', 'pharmacy', 'doctor'],
  },
  {
    id: 'ci_it',
    label: 'Information Technology',
    shortLabel: 'IT',
    Icon: Server,
    color: '#8B5CF6',
  },
  {
    id: 'ci_nuclear',
    label: 'Nuclear Reactors, Materials & Waste',
    shortLabel: 'Nuclear',
    Icon: Atom,
    color: '#F97316',
  },
  {
    id: 'ci_transportation',
    label: 'Transportation Systems',
    shortLabel: 'Transportation',
    Icon: Train,
    color: '#2563EB',
    googlePlaceTypes: ['transit_station', 'bus_station', 'train_station'],
  },
  {
    id: 'ci_water',
    label: 'Water & Wastewater',
    shortLabel: 'Water',
    Icon: Waves,
    color: '#06B6D4',
  },
]

export function criticalSectorById(id: string): CriticalInfraSectorDef | undefined {
  return CRITICAL_INFRASTRUCTURE_SECTORS.find((s) => s.id === id)
}
