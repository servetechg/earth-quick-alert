'use client'

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { EmergencyEvent, EventStatus, EventTimelineItem } from '@/lib/types/emergency'

interface EventStore {
    events: EmergencyEvent[]
    isLoading: boolean
    error: string | null
    createEvent: (event: Omit<EmergencyEvent, 'id' | 'createdAt' | 'updatedAt' | 'timeline'>) => Promise<EmergencyEvent | null>
    updateEvent: (eventId: string, updates: Partial<EmergencyEvent>) => Promise<void>
    addTimelineItem: (eventId: string, item: Omit<EventTimelineItem, 'id' | 'timestamp'>) => Promise<void>
    getActiveEvents: () => EmergencyEvent[]
    getEventById: (eventId: string) => EmergencyEvent | undefined
    resolveEvent: (eventId: string) => Promise<void>
    deleteEvent: (eventId: string) => Promise<void>
    refreshEvents: () => Promise<void>
    fetchEvents: () => Promise<void>
}

const EventContext = createContext<EventStore | undefined>(undefined)

export function EventProvider({ children }: { children: React.ReactNode }) {
    const [events, setEvents] = useState<EmergencyEvent[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchEvents = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/events')
            if (res.ok) {
                const data = await res.json()
                setEvents(data)
            } else {
                setError('Failed to load events')
            }
        } catch (err) {
            console.error('Fetch events error:', err)
            setError('Network error: Failed to connect to server')
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchEvents()
    }, [fetchEvents])

    const createEvent = useCallback(async (eventData: Omit<EmergencyEvent, 'id' | 'createdAt' | 'updatedAt' | 'timeline'>): Promise<EmergencyEvent | null> => {
        try {
            const res = await fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            })
            if (res.ok) {
                const newEvent = await res.json()
                setEvents(prev => [newEvent, ...prev])
                return newEvent
            }
            return null
        } catch (err) {
            console.error('Create event error:', err)
            return null
        }
    }, [])

    const updateEvent = useCallback(async (eventId: string, updates: Partial<EmergencyEvent>) => {
        // For simplicity, we just update the status/resolvedAt for now via a specific resolving logic Or re-fetch
        try {
            const res = await fetch(`/api/events/${eventId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            })
            if (res.ok) {
                await fetchEvents()
            }
        } catch (err) {
            console.error('Update event error:', err)
        }
    }, [fetchEvents])

    const addTimelineItem = useCallback(async (eventId: string, item: Omit<EventTimelineItem, 'id' | 'timestamp'>) => {
        // Implementation for timeline updates via API
        console.log('Timeline updates to follow in next iteration')
    }, [])

    const getActiveEvents = useCallback((): EmergencyEvent[] => {
        return events.filter(event => event.status === 'active' || event.status === 'monitoring')
    }, [events])

    const getEventById = useCallback((eventId: string): EmergencyEvent | undefined => {
        return events.find(event => event.id === eventId || (event as any)._id === eventId)
    }, [events])

    const resolveEvent = useCallback(async (eventId: string) => {
        await updateEvent(eventId, {
            status: 'resolved' as EventStatus,
            resolvedAt: new Date()
        })
    }, [updateEvent])

    const deleteEvent = useCallback(async (eventId: string) => {
        try {
            const res = await fetch(`/api/events?id=${eventId}`, {
                method: 'DELETE'
            })
            if (res.ok) {
                setEvents(prev => prev.filter(event => event.id !== eventId && (event as any)._id !== eventId))
            }
        } catch (err) {
            console.error('Delete event error:', err)
        }
    }, [])

    const value: EventStore = {
        events,
        isLoading,
        error,
        createEvent,
        updateEvent,
        addTimelineItem,
        getActiveEvents,
        getEventById,
        resolveEvent,
        deleteEvent,
        refreshEvents: fetchEvents,
        fetchEvents
    }

    return <EventContext.Provider value={value}>{children}</EventContext.Provider>
}

export function useEvents() {
    const context = useContext(EventContext)
    if (context === undefined) {
        throw new Error('useEvents must be used within an EventProvider')
    }
    return context
}
