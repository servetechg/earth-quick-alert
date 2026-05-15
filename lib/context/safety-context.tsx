'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

import { geocodeAddress, reverseGeocode } from '@/lib/services/mock-map-service'
import { alertProcessor } from '@/lib/services/alert-processor'
import { AlertSource, EarthquakeAlert, WeatherAlert } from '@/lib/types/api-alerts'
import { useGeolocation } from '@/lib/hooks/use-geolocation'

export type SafetyStatus = 'SAFE' | 'DANGER' | 'PENDING' | 'true' | 'false'

export interface FamilyMember {
    _id: string
    name: string
    relationship: string
    location?: string
    status: SafetyStatus
    statusReason?: string
    lastUpdated: Date
}

interface SafetyContextType {
    myStatus: SafetyStatus
    familyMembers: FamilyMember[]
    loading: boolean
    updateMyStatus: (status: SafetyStatus) => Promise<void>
    addFamilyMember: (data: { name: string; relationship: string; location?: string }) => Promise<{ success: boolean; error?: string }>
    updateFamilyMemberLocation: (id: string, location: string) => Promise<void>
    removeFamilyMember: (id: string) => Promise<void>
    refreshSafetyData: () => Promise<void>
    verifyFamilySafety: () => Promise<void>
    lastSyncedLocation: string | null
    lastSyncedTime: Date | null
    syncLocation: () => Promise<void>
    isSyncing: boolean
}

const SafetyContext = createContext<SafetyContextType | undefined>(undefined)

export function SafetyProvider({ children }: { children: React.ReactNode }) {
    const [myStatus, setMyStatus] = useState<SafetyStatus>('SAFE')
    const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
    const [loading, setLoading] = useState(true)
    const [lastSyncedLocation, setLastSyncedLocation] = useState<string | null>(null)
    const [lastSyncedTime, setLastSyncedTime] = useState<Date | null>(null)
    const [isSyncing, setIsSyncing] = useState(false)

    const { location: geoLoc } = useGeolocation()

    const fetchSafetyData = useCallback(async () => {
        try {
            setLoading(true)
            const response = await fetch('/api/user/safety')
            const data = await response.json()
            if (response.ok) {
                setMyStatus(data.isSafe !== false ? 'SAFE' : 'DANGER')
                setFamilyMembers(data.familyMembers || [])
                setLastSyncedLocation(data.location || null)

                // Update localStorage for header/dashboard sync status
                localStorage.setItem('isSafe', (data.isSafe !== false).toString())
            } else if (response.status === 401) {
                // Clear data if unauthorized
                setFamilyMembers([])
            }
        } catch (error) {
            console.error('Failed to fetch safety data:', error)
        } finally {
            setLoading(false)
        }
    }, [])

    // Sync live location to server
    const syncLocation = useCallback(async () => {
        if (!geoLoc) return

        try {
            setIsSyncing(true)
            const address = await reverseGeocode(geoLoc.lat, geoLoc.lng)

            if (address) {
                console.log(`Syncing location: ${address}`)
                const response = await fetch('/api/user/update-location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ location: address }),
                })

                if (response.ok) {
                    setLastSyncedLocation(address)
                    setLastSyncedTime(new Date())
                }
            }
        } catch (error) {
            console.error('Failed to sync live location:', error)
        } finally {
            setIsSyncing(false)
        }
    }, [geoLoc])

    useEffect(() => {
        if (!geoLoc) return

        // Auto-sync if location name is different or hasn't been synced yet
        const autoSync = async () => {
            const address = await reverseGeocode(geoLoc.lat, geoLoc.lng)
            if (address && address !== lastSyncedLocation) {
                syncLocation()
            }
        }

        const timeoutId = setTimeout(autoSync, 2000)
        return () => clearTimeout(timeoutId)
    }, [geoLoc, lastSyncedLocation, syncLocation])

    useEffect(() => {
        fetchSafetyData()
    }, [fetchSafetyData])

    const updateMyStatus = async (status: SafetyStatus) => {
        try {
            const isSafe = status === 'SAFE'
            const response = await fetch('/api/user/safety', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isSafe }),
            })
            if (response.ok) {
                setMyStatus(status)
                localStorage.setItem('isSafe', isSafe.toString())
            }
        } catch (error) {
            console.error('Failed to update status:', error)
        }
    }

    const addFamilyMember = async (memberData: { name: string; relationship: string; location?: string }) => {
        try {
            const response = await fetch('/api/user/safety', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(memberData),
            })
            const data = await response.json()
            if (response.ok) {
                setFamilyMembers(data.familyMembers)
                return { success: true }
            } else {
                console.error('Failed to add family member:', data)
                return { success: false, error: data.error || 'Failed to add family member' }
            }
        } catch (error: any) {
            console.error('Failed to add family member:', error)
            return { success: false, error: error.message || 'Unknown error occurred' }
        }
    }

    const updateFamilyMemberLocation = async (id: string, location: string) => {
        try {
            const response = await fetch('/api/user/safety', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, location }),
            })
            const data = await response.json()
            if (response.ok) {
                setFamilyMembers(data.familyMembers)
            }
        } catch (error) {
            console.error('Failed to update family member location:', error)
        }
    }

    const removeFamilyMember = async (id: string) => {
        try {
            const response = await fetch(`/api/user/safety?id=${id}`, {
                method: 'DELETE',
            })
            const data = await response.json()
            if (response.ok) {
                setFamilyMembers(data.familyMembers)
            }
        } catch (error) {
            console.error('Failed to remove family member:', error)
        }
    }

    const verifyFamilySafety = async () => {
        console.log('--- Starting Individual Family Safety Verification ---')
        const updatedMembers = [...familyMembers]
        let hasChanges = false

        for (let i = 0; i < updatedMembers.length; i++) {
            const member = updatedMembers[i]
            if (!member.location) continue

            try {
                const coords = await geocodeAddress(member.location)
                const lat = coords.lat
                const lon = coords.lng

                // Fetch alerts for this specific location
                const alerts = await alertProcessor.fetchAllAlerts({ lat, lon })

                const hasEarthquakeRisk = alerts.some(a =>
                    a.source === AlertSource.EARTHQUAKE_API &&
                    (a as EarthquakeAlert).magnitude > 5.0
                )

                const hasWeatherRisk = alerts.some(a =>
                    a.source === AlertSource.WEATHER_API &&
                    ((a as WeatherAlert).severity === 'high' || (a as WeatherAlert).severity === 'severe')
                )

                const newStatus = (hasEarthquakeRisk || hasWeatherRisk) ? 'false' : 'true'
                let newReason = ''
                if (hasEarthquakeRisk && hasWeatherRisk) newReason = 'EARTHQUAKE & WEATHER ALERT'
                else if (hasEarthquakeRisk) newReason = 'EARTHQUAKE ALERT'
                else if (hasWeatherRisk) newReason = 'WEATHER ALERT'

                if (member.status !== newStatus || member.statusReason !== newReason) {
                    console.log(`Updating status for ${member.name} in ${member.location} to ${newStatus}`)

                    // Update in MongoDB
                    const response = await fetch('/api/user/safety', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: member._id, status: newStatus, statusReason: newReason }),
                    })

                    if (response.ok) {
                        const data = await response.json()
                        setFamilyMembers(data.familyMembers)
                        hasChanges = true
                    }
                }
            } catch (err) {
                console.error(`Verification failed for ${member.name}:`, err)
            }
        }

        if (!hasChanges) {
            console.log('No safety status changes detected for family members.')
        }
    }

    return (
        <SafetyContext.Provider value={{
            myStatus,
            familyMembers,
            loading,
            updateMyStatus,
            addFamilyMember,
            updateFamilyMemberLocation,
            removeFamilyMember,
            refreshSafetyData: fetchSafetyData,
            verifyFamilySafety,
            lastSyncedLocation,
            lastSyncedTime,
            syncLocation,
            isSyncing
        }}>
            {children}
        </SafetyContext.Provider>
    )
}

export function useSafety() {
    const context = useContext(SafetyContext)
    if (context === undefined) {
        throw new Error('useSafety must be used within a SafetyProvider')
    }
    return context
}
