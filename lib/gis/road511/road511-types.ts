/** Road511 `/api/v1/events` event shape (fields we consume). */
export type Road511Event = {
    id?: string
    source_id?: string
    source?: string
    jurisdiction?: string
    type?: string
    sub_type?: string
    cause?: string
    severity?: string
    status?: string
    title?: string
    description?: string
    location?: {
        type?: string
        coordinates?: unknown
    }
    affected_roads?: string[]
    direction?: string
    lanes_affected?: string
    start_time?: string
    end_time?: string
    effective_end_time?: string
    last_updated?: string
    created_at?: string
    latitude?: number
    longitude?: number
    road_class?: string
    metadata?: Record<string, unknown>
}

export type Road511EventsResponse = {
    data?: Road511Event[]
    total?: number
    limit?: number
    offset?: number
    has_more?: boolean
}
