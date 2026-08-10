export type CitizenActivityCategory =
    | 'help_request'
    | 'shelter_checkin'
    | 'power_outage'
    | 'medical_assistance'
    | 'safe_checkin'
    | 'supply_request'
    | 'evacuation'
    | 'road_hazard'
    | 'damage_report'
    | 'water_rescue'
    | 'volunteer'
    | 'missing_person'

export type CitizenActivityPriority = 'critical' | 'high' | 'normal' | 'low'

export type CitizenActivitySource = 'citizen' | 'system' | 'responder'

export interface CitizenActivityMediaRef {
    url: string
    fileName?: string
    mimeType?: string
    publicId?: string
    resourceType?: 'image' | 'video' | 'raw'
}

export interface CitizenActivityItem {
    id: string
    category: CitizenActivityCategory
    title: string
    line1: string
    line2?: string
    location?: string
    timestamp: string
    displayTime: string
    priority: CitizenActivityPriority
    status?: string
    source: CitizenActivitySource
    /** Populated from CitizenActivity records (mobile / web). */
    citizenName?: string
    citizenAddress?: string
    takeAction?: string
    resolutionStatus?: 'pending' | 'completed'
    userId?: string
    pictures?: CitizenActivityMediaRef[]
    videos?: CitizenActivityMediaRef[]
}

export type CitizenActivityFilter =
    | 'all'
    | 'help'
    | 'safety'
    | 'infrastructure'
    | 'medical'

export interface CitizenActivityStats {
    helpRequests: number
    safeCheckIns: number
    infrastructureAlerts: number
    medicalAssistance: number
    total: number
}

export interface CitizenActivityFeedResponse {
    items: CitizenActivityItem[]
    stats: CitizenActivityStats
    source?: 'live'
}
