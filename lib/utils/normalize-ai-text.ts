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
 * Strip internal event-reference IDs the model sometimes echoes into prose
 * (e.g. `Event references: ["6a2f3133fdc9c682c7879e5d", ...]`). These are
 * MongoDB ObjectIds meant only for the structured `eventRefs` field — never
 * shown to users.
 */
export function stripEventRefArtifacts(text: string): string {
  if (!text) return ''
  return text
    // "Event reference(s): [ ... ]" — label plus its bracketed array
    .replace(/\s*\bevent\s+references?\b\s*:?\s*\[[^\]]*\]/gi, '')
    // bare array of 24-char hex ObjectIds left anywhere in the sentence
    .replace(/\[\s*["']?[0-9a-f]{24}["']?(?:\s*,\s*["']?[0-9a-f]{24}["']?)*\s*\]/gi, '')
    // dangling "Event references:" label with no array after it
    .replace(/\s*\bevent\s+references?\b\s*:?/gi, '')
    // tidy whitespace / trailing punctuation left behind by the removals
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.;,])/g, '$1')
    .replace(/[\s.;,]+$/g, '')
    .trim()
}

/**
 * Coerce AI JSON fields to display-safe strings.
 * OpenAI occasionally returns structured objects instead of prose bullets.
 */
export function normalizeAiBullet(item: unknown): string {
  let out = ''
  if (typeof item === 'string') {
    out = item.trim()
  } else if (typeof item === 'number' || typeof item === 'boolean') {
    out = String(item)
  } else if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>
    const name = pickField(o, ['name', 'title', 'event', 'type'])
    const location = pickField(o, ['location', 'primaryLocation', 'area', 'county'])
    const time = pickField(o, ['time', 'formattedTimestamp', 'timestamp', 'date'])
    const severity = pickField(o, ['severity', 'level'])
    const description = pickField(o, ['description', 'summary', 'text', 'bullet'])

    if (description && !name && !location) {
      out = description
    } else {
      const parts = [name, location, time, severity].filter(Boolean)
      if (parts.length) out = parts.join(' — ')
    }
  }

  if (!out) {
    const fallback = String(item ?? '').trim()
    out = fallback === '[object Object]' ? '' : fallback
  }

  return stripEventRefArtifacts(out)
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
