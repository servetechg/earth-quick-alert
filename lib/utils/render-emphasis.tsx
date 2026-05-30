import { Fragment, type ReactNode } from 'react'
import { normalizeAiBullet } from '@/lib/utils/normalize-ai-text'

/** Render `**bold**` markdown markers as <strong> in React. */
export function renderEmphasis(text: unknown): ReactNode {
  const plain = normalizeAiBullet(text)
  if (!plain) return null

  const boldRe = /\*\*([^*]+?)\*\*/g
  const nodes: ReactNode[] = []
  let last = 0
  let i = 0
  let m: RegExpExecArray | null

  while ((m = boldRe.exec(plain)) !== null) {
    if (m.index > last) {
      nodes.push(<span key={i++}>{plain.slice(last, m.index).replace(/\*/g, '')}</span>)
    }
    nodes.push(
      <strong key={i++} className="font-bold text-[#232a43]">
        {m[1]}
      </strong>,
    )
    last = m.index + m[0].length
  }

  if (last < plain.length) {
    nodes.push(<span key={i++}>{plain.slice(last).replace(/\*/g, '')}</span>)
  }

  return nodes.length <= 1 ? (nodes[0] ?? plain) : <Fragment>{nodes}</Fragment>
}
