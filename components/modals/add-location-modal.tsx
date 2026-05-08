'use client'

import { useState } from 'react'
import { X, MapPin, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { geocodeAddress } from '@/lib/services/mock-map-service'

interface AddLocationModalProps {
    isOpen: boolean
    onClose: () => void
    onAdd: (location: {
        nickname: string
        address: string
        lat: number
        lng: number
        alertPreferences: Record<string, boolean>
    }) => void
}

export function AddLocationModal({ isOpen, onClose, onAdd }: AddLocationModalProps) {
    const [nickname, setNickname] = useState('')
    const [address, setAddress] = useState('')
    const [alertPreferences, setAlertPreferences] = useState({
        earthquake: true,
        hurricane: true,
        tornado: true,
        flood: true,
        wildfire: true,
        severeWeather: true,
        news: true,
        community: true,
    })

    if (!isOpen) return null

    const handleAdd = async () => {
        if (!nickname || !address) {
            alert('Please fill in all fields')
            return
        }

        const coords = await geocodeAddress(address)

        onAdd({
            nickname,
            address,
            lat: coords.lat,
            lng: coords.lng,
            alertPreferences,
        })

        // Reset form
        setNickname('')
        setAddress('')
        onClose()
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
                    <div className="flex items-center gap-2">
                        <MapPin className="w-6 h-6 text-blue-600" />
                        <h2 className="text-2xl font-bold">Add Location</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <p className="text-gray-600">
                        Add a location to receive alerts for places you care about.
                    </p>

                    <div>
                        <label className="block text-sm font-semibold mb-2">Location Nickname</label>
                        <input
                            type="text"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            placeholder="e.g., Home, Work, School"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-2">Address</label>
                        <input
                            type="text"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="123 Main St, San Francisco, CA"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-3">Alert Preferences</label>
                        <div className="space-y-2">
                            {Object.entries(alertPreferences).map(([key, value]) => (
                                <label key={key} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={value}
                                        onChange={(e) =>
                                            setAlertPreferences(prev => ({ ...prev, [key]: e.target.checked }))
                                        }
                                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                                    />
                                    <span className="text-sm capitalize">
                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4 border-t">
                        <Button variant="outline" onClick={onClose} className="flex-1">
                            Cancel
                        </Button>
                        <Button onClick={handleAdd} className="flex-1 bg-[#33375D] text-white hover:bg-[#2B2F50]">
                            <MapPin className="w-4 h-4 mr-2" />
                            Add Location
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
