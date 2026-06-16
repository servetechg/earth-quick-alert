/**
 * Remove sentences that express absence or unavailability of data.
 * If the entire field becomes empty after filtering, returns "" so the
 * calling component silently hides the section.
 */
export function dropAbsenceSentences(text: string): string {
  if (!text) return '';

  // Patterns that signal "nothing to report" — these should never appear in the UI.
  const ABSENCE_PATTERNS = [
    /\bno\s+(exact|specific|additional|further|numeric|coordinate|lat|lon|data|information|detail|value|statistic|record|figure|report|mention|reference|description|measurement|reading|estimate|count|amount|total|depth|height|speed|rate|size|scale|acreage|area|zone|range|county|region|location|address|place|town|city|code|number|id|identifier|type|category|source|agency|name|title|date|time|timestamp|period|duration|expir|deadline|end|start|begin)\b/i,
    /\bnot\s+(specified|available|provided|listed|given|present|included|reported|recorded|found|mentioned|noted|documented|stated|indicated|shown|displayed|returned|defined|set|entered|populated|filled|captured|stored|tracked|logged|measured|calculated|determined|identified|confirmed|verified|known|applicable)\b/i,
    /\b(is|are|was|were|has|have)\s+not\s+(specified|available|provided|listed|given|present|included|reported|recorded|found|mentioned|noted|documented|stated|indicated|shown|displayed|returned|defined|set|entered|populated|filled|captured|stored|tracked|logged|measured|calculated|determined|identified|confirmed|verified|known)\b/i,
    /\b(no|zero|none|null|empty|missing|absent|unknown|unavailable|undetermined|unspecified|unlisted|unprovided|unreported|unrecorded|unstated|undefined|blank|n\/a)\s+(data|info|information|detail|details|value|values|statistic|statistics|figure|figures|number|numbers|amount|amounts|total|totals|record|records|field|fields|coordinate|coordinates|lat|lon|longitude|latitude)\b/i,
    /\bno\s+\w+(\s+\w+)?\s+(are|is|were|was)\s+(available|provided|specified|listed|given|present|included|reported|recorded|found|noted)/i,
    /\b(latitude|longitude|coordinates?|lat|lon|latlng)\s+(are|is|were|was)?\s*(not\s+)?(provided|available|specified|given|included|present|listed|reported|recorded|found|mentioned|shown)\b/i,
    /see\s+open\s*fema/i,
    /\bexpir(ation|y|es?)?\s+(date\s+)?(is\s+)?(not\s+)?(specified|available|provided|listed|given|present|included)\b/i,
    /\bno\s+(additional|further|other|more)\s+(geographic|location|area|zone|region|county|state|place)\b/i,
    /\bnot\s+enough\s+(data|information|detail)\b/i,
    /\black(s|ing)?\s+(data|information|detail|value|statistic|coordinate|number)\b/i,
    /\bsuggesting\s+the\s+incident\s+may\s+still\s+be\s+active\b/i,
    /\bunder\s+ongoing\s+monitoring\b/i,
    /\bsubject\s+to\s+further\s+updates\b/i,
  ];

  // Split into sentences (keep trailing space/punctuation with each sentence)
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];

  const kept = sentences.filter((sentence) => {
    const s = sentence.toLowerCase();
    return !ABSENCE_PATTERNS.some((re) => re.test(s));
  });

  return kept.join('').trim();
}

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
