export type RoadClosureStatus = 'Closed' | 'Restricted' | 'Lane Closure' | 'Unknown'

export type RoadClosureSegment = {
    id: string
    roadName: string
    status: RoadClosureStatus
    reason?: string
    startLocation?: string
    endLocation?: string
    updatedAt: string
    source: string
    path: { lat: number; lng: number }[]
}
