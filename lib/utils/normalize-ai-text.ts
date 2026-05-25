/**
 * Coerce AI JSON fields to display-safe strings.
 * OpenAI occasionally returns structured objects instead of prose bullets.
 */
export function normalizeAiBullet(item: unknown): string {
  if (typeof item === 'string') return item.trim()
  if (typeof item === 'number' || typeof item === 'boolean') return String(item)

  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>
    const name = pickField(o, ['name', 'title', 'event', 'type'])
    const location = pickField(o, ['location', 'primaryLocation', 'area', 'county'])
    const time = pickField(o, ['time', 'formattedTimestamp', 'timestamp', 'date'])
    const severity = pickField(o, ['severity', 'level'])
    const description = pickField(o, ['description', 'summary', 'text', 'bullet'])

    if (description && !name && !location) return description

    const parts = [name, location, time, severity].filter(Boolean)
    if (parts.length) return parts.join(' — ')
  }

  const fallback = String(item ?? '').trim()
  return fallback === '[object Object]' ? '' : fallback
}

export function normalizeAiBulletList(items: unknown, max = 20): string[] {
  if (!Array.isArray(items)) return []
  return items
    .map((x) => normalizeAiBullet(x))
    .filter(Boolean)
    .slice(0, max)
}

function pickField(o: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = o[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}
