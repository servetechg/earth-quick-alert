import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('text') || searchParams.get('q') || ''

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ results: [] })
  }

  const apiKey =
    process.env.GEOAPIFY_API_KEY ||
    process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY ||
    '9abe9caf7f5943d189e9ef564c5cdec7'

  try {
    const geoapifyUrl = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(
      query.trim(),
    )}&apiKey=${apiKey}`

    const res = await fetch(geoapifyUrl, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 }, // Cache for 5 minutes
    })

    if (!res.ok) {
      console.error(`Geoapify Autocomplete API error: status ${res.status}`)
      return NextResponse.json({ results: [] })
    }

    const data = await res.json()

    if (!data || !Array.isArray(data.features)) {
      return NextResponse.json({ results: [] })
    }

    const results = data.features.map((feature: any) => {
      const props = feature.properties || {}
      const coords = feature.geometry?.coordinates || [0, 0]

      const lng = props.lon ?? coords[0] ?? 0
      const lat = props.lat ?? coords[1] ?? 0

      const city =
        props.city ||
        props.town ||
        props.village ||
        props.county ||
        props.municipality ||
        props.name ||
        ''
      const state = props.state || props.region || props.state_code || ''
      const country = props.country || ''
      const zipcode = props.postcode || ''
      const formatted = props.formatted || [city, state, country].filter(Boolean).join(', ')

      return {
        place_id: props.place_id || `${lat}_${lng}_${Math.random()}`,
        formatted,
        city,
        state,
        country,
        zipcode,
        lat: Number(lat),
        lng: Number(lng),
      }
    })

    return NextResponse.json({ results })
  } catch (error: any) {
    console.error('Geoapify autocomplete handler error:', error)
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 })
  }
}
