export type AfterActionTimelineColor = 'red' | 'blue' | 'green' | 'purple'

export interface AfterActionTimelineEvent {
    id: number
    time: string
    type: string
    title: string
    description: string
    color: AfterActionTimelineColor
}

export interface AfterActionInsight {
    id: string
    category: string
    description: string
    status?: 'Pending' | 'Addressed'
    time?: string
}

export interface AfterActionPerformanceMetric {
    label: string
    val: string
    status: 'optimal' | 'nominal' | 'stressed'
    /** 0–100 progress bar width */
    percent: number
}

export interface AfterActionReviewMetadata {
    efRating?: number
    peakWindMph?: number
    pathLengthMiles?: number
    pathWidthYards?: number
    durationMinutes?: number
    counties?: string[]
    structuresAffected?: number
    injuriesDirect?: number
    citizenReports?: number
    responderDeployments?: number
    nwsProducts?: number
    location?: string
    issuedAt?: string
    resolvedAt?: string
    historicalMatchConfidence?: number
}

export interface AfterActionReviewData {
    id: string
    name: string
    type: string
    duration: string
    durationDetail?: string
    insights: number
    events: AfterActionTimelineEvent[]
    aiInsights: AfterActionInsight[]
    performanceIndicators: AfterActionPerformanceMetric[]
    strategicEnhancements: string[]
    scenarioId?: string
    demo?: boolean
    metadata?: AfterActionReviewMetadata
}
