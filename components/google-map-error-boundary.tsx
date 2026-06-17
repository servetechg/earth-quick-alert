'use client'

import React from 'react'
import { GoogleMapsUnavailable } from '@/components/google-maps-unavailable'

type GoogleMapErrorBoundaryProps = {
    children: React.ReactNode
}

type GoogleMapErrorBoundaryState = {
    hasError: boolean
}

export class GoogleMapErrorBoundary extends React.Component<
    GoogleMapErrorBoundaryProps,
    GoogleMapErrorBoundaryState
> {
    state: GoogleMapErrorBoundaryState = { hasError: false }

    static getDerivedStateFromError(): GoogleMapErrorBoundaryState {
        return { hasError: true }
    }

    componentDidCatch(error: Error) {
        console.error('Google Map error boundary caught an error:', error)
    }

    render() {
        if (this.state.hasError) {
            return <GoogleMapsUnavailable reason="runtime-error" />
        }
        return this.props.children
    }
}
