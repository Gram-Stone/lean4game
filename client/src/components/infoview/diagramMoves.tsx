/**
 * Clicking on string diagrams.
 *
 * Asks the game's Lean code (`PMC.diagramMoves`) for both sides of the current goal as
 * string-diagram data and for every move available with the player's unlocked theorems.
 * The player selects boxes; rule cards whose footprint matches the selection light up;
 * applying one sends its `diag_rw` tactic through the typewriter, so Lean checks every move.
 */
import * as React from 'react'
import { RpcSessionAtPos } from '@leanprover/infoview-api'
import '../../css/diagram_moves.css'

export interface DNode { id: string, label: string, row: number, col: number, colOut: number,
  isAtom: boolean, nIn: number, nOut: number }
export interface DStrand { col: number, src: string, tgt: string, label: string }
export interface Diagram { nodes: DNode[], strands: DStrand[] }
export interface EqDiagrams { lhs: Diagram, rhs: Diagram }
export interface Move { tactic: string, rule: string, reverse: boolean,
  lhsFootprint: string[], rhsFootprint: string[], after: EqDiagrams | null }
export interface MovesResult { current: EqDiagrams | null, sameDiagram: boolean, moves: Move[] }

type Side = 'lhs' | 'rhs'
type Selection = { lhs: Set<string>, rhs: Set<string> }

const ROW = 70, COL = 56, PAD = 34, LEG = 14

/** Wires run straight down in their column; they shift sideways only at boxes and pass-throughs. */
function layout(d: Diagram) {
  const rows = Math.max(0, ...d.nodes.map(n => n.row))
  const cols = Math.max(1, ...d.nodes.map(n => n.col + n.nIn),
    ...d.nodes.map(n => n.colOut + n.nOut))
  const y = (row: number) => PAD + row * ROW
  const x = (col: number) => PAD + col * COL
  /** Where a box sits: centred over its input and output wires. */
  const center = (n: DNode) => {
    const ports = [...Array(n.nIn).keys()].map(i => x(n.col + i))
      .concat([...Array(n.nOut).keys()].map(k => x(n.colOut + k)))
    return ports.length ? ports.reduce((a, b) => a + b, 0) / ports.length : x(n.col)
  }
  return { x, y, center, width: PAD * 2 + (cols - 1) * COL, height: PAD * 2 + rows * ROW }
}

type Shape = { kind: 'dot' | 'cap' | 'state' | 'box', half: number, width: number }
function shapeOf(n: DNode, spread: number): Shape {
  if (n.label === 'Δ') return { kind: 'dot', half: 0, width: 12 }
  if (n.label === 'ε') return { kind: 'cap', half: 0, width: 20 }
  if (n.nIn === 0) return { kind: 'state', half: 12, width: Math.max(44, spread + 28) }
  return { kind: 'box', half: 15, width: Math.max(34, n.label.length * 9 + 16, spread + 28) }
}

function Glyph({ n, cx, y, shape }: { n: DNode, cx: number, y: number, shape: Shape }) {
  if (shape.kind === 'dot') return <circle cx={cx} cy={y} r={6} className="dm-dot" />
  if (shape.kind === 'cap') return <g className="dm-wire-stroke">
    <line x1={cx - 10} y1={y} x2={cx + 10} y2={y} /><line x1={cx - 6} y1={y + 5} x2={cx + 6} y2={y + 5} />
    <line x1={cx - 2} y1={y + 10} x2={cx + 2} y2={y + 10} /></g>
  const w = shape.width
  if (shape.kind === 'state') return <g>
    <polygon points={`${cx - w / 2},${y - 12} ${cx + w / 2},${y - 12} ${cx},${y + 12}`} className="dm-box" />
    <text x={cx} y={y - 1} className="dm-label">{n.label}</text></g>
  return <g><rect x={cx - w / 2} y={y - 15} width={w} height={30} rx={7} className="dm-box" />
    <text x={cx} y={y + 5} className="dm-label">{n.label}</text></g>
}

/** A smooth wire from (x1, y1) down to (x2, y2). */
const wire = (x1: number, y1: number, x2: number, y2: number) => {
  const m = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${m}, ${x2} ${m}, ${x2} ${y2}`
}

/** One side of the goal as a clickable string diagram. */
function DiagramView({ d, side, selected, hinted, onToggle, interactive }: {
  d: Diagram, side: Side, selected: Set<string>, hinted: Set<string>,
  onToggle: (side: Side, id: string) => void, interactive: boolean }) {
  const { x, y, center, width, height } = layout(d)
  const byId = new Map(d.nodes.map(n => [n.id, n]))
  const atoms = d.nodes.filter(n => n.isAtom)
  const firstRow = Math.min(...d.nodes.map(n => n.row)), lastRow = Math.max(...d.nodes.map(n => n.row))
  const spread = (n: DNode) => Math.max(n.nIn, n.nOut, 1) * COL - COL
  const paths: string[] = []
  // Wires between rows: straight down their column.
  // Mathlib numbers a wire as (its source's first output column) + (its index in the whole row),
  // so the wire's own column is that number minus the source's first output column.
  for (const s of d.strands) {
    const a = byId.get(s.src), b = byId.get(s.tgt)
    if (!a || !b) continue
    const c = x(s.col - a.colOut)
    paths.push(`M ${c} ${y(a.row) + LEG} L ${c} ${y(b.row) - LEG}`)
  }
  for (const n of d.nodes) {
    const cy = y(n.row)
    if (!n.isAtom) {
      // A pass-through: the wire may shift to a new column here.
      const top = n.row === firstRow ? cy : cy - LEG, bottom = n.row === lastRow ? cy : cy + LEG
      paths.push(wire(x(n.col), top, x(n.colOut), bottom))
      continue
    }
    const cx = center(n), sh = shapeOf(n, spread(n))
    for (let i = 0; i < n.nIn; i++) {
      const px = x(n.col + i)
      paths.push(sh.kind === 'box' || sh.kind === 'state'
        ? `M ${px} ${cy - LEG} L ${px} ${cy - sh.half}` : wire(px, cy - LEG, cx, cy - sh.half))
    }
    for (let k = 0; k < n.nOut; k++) {
      const px = x(n.colOut + k)
      paths.push(sh.kind === 'box' || sh.kind === 'state'
        ? `M ${px} ${cy + sh.half} L ${px} ${cy + LEG}` : wire(cx, cy + sh.half, px, cy + LEG))
    }
  }
  const hit = (n: DNode) => { const w = shapeOf(n, spread(n)).width + 20; return { x: center(n) - w / 2, w } }
  return <svg viewBox={`0 0 ${Math.max(width, 140)} ${height}`} className="dm-svg"
      role="group" aria-label={side === 'lhs' ? 'Left side' : 'Right side'}>
    {atoms.map(n => {
      const cls = selected.has(n.id) ? 'dm-halo selected' : hinted.has(n.id) ? 'dm-halo hinted' : null
      const h = hit(n)
      return cls && <rect key={`h-${n.id}`} x={h.x} y={y(n.row) - 22} width={h.w} height={44} rx={10} className={cls} />
    })}
    {paths.map((dd, i) => <path key={i} d={dd} className="dm-wire" />)}
    {atoms.map(n => <Glyph key={n.id} n={n} cx={center(n)} y={y(n.row)} shape={shapeOf(n, spread(n))} />)}
    {d.nodes.filter(n => !n.isAtom && (n.row === firstRow || n.row === lastRow)).map(n =>
      <text key={`b-${n.id}`} x={x(n.row === firstRow ? n.col : n.colOut)}
        y={n.row === firstRow ? y(n.row) - 8 : y(n.row) + 18} className="dm-boundary">{n.label}</text>)}
    {interactive && atoms.map(n => {
      const on = selected.has(n.id), h = hit(n)
      return <rect key={`t-${n.id}`} x={h.x} y={y(n.row) - 22} width={h.w} height={44} rx={10}
        className="dm-hit" tabIndex={0} role="button" aria-pressed={on} aria-label={`${n.label} box`}
        onClick={() => onToggle(side, n.id)}
        onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onToggle(side, n.id) } }} />
    })}
  </svg>
}

const sameSet = (a: Set<string>, b: string[]) => a.size === b.length && b.every(x => a.has(x))

/** The clickable diagram panel for the current goal. */
export function DiagramMoves({ rpcSess, goal, rules, ruleNames, onMove, disabled }: {
  rpcSess: RpcSessionAtPos, goal: any, rules: string[], ruleNames: Map<string, string>,
  onMove: (tactic: string) => void, disabled: boolean }) {
  const [result, setResult] = React.useState<MovesResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [sel, setSel] = React.useState<Selection>({ lhs: new Set(), rhs: new Set() })
  const [hint, setHint] = React.useState<Move | null>(null)
  const rulesKey = rules.join(',')

  React.useEffect(() => {
    let cancelled = false
    setResult(null); setError(null); setSel({ lhs: new Set(), rhs: new Set() }); setHint(null)
    rpcSess.call('PMC.diagramMoves', { goal, rules })
      .then((r: any) => { if (!cancelled) setResult(r as MovesResult) })
      .catch((e: any) => { if (!cancelled) setError(String(e?.message ?? e)) })
    return () => { cancelled = true }
  }, [rpcSess, goal, rulesKey])

  if (error) return <div className="dm-panel dm-note">Couldn't draw this goal: {error}</div>
  if (!result) return <div className="dm-panel dm-note">Drawing the goal…</div>
  if (!result.current) return null

  const toggle = (side: Side, id: string) => {
    if (disabled) return
    setHint(null)
    setSel(s => { const next = new Set(s[side]); next.has(id) ? next.delete(id) : next.add(id); return { ...s, [side]: next } })
  }
  const fits = (m: Move) => sameSet(sel.lhs, m.lhsFootprint) && sameSet(sel.rhs, m.rhsFootprint)
  const anySelected = sel.lhs.size + sel.rhs.size > 0
  const name = (m: Move) => ruleNames.get(m.rule) ?? m.rule.split('.').pop()
  const hinted = (side: Side) => new Set(hint ? (side === 'lhs' ? hint.lhsFootprint : hint.rhsFootprint) : [])
  const fitting = result.moves.filter(fits)

  return <div className="dm-panel">
    <div className="dm-equation">
      <figure className="dm-side">
        <figcaption>Left side</figcaption>
        <DiagramView d={result.current.lhs} side="lhs" selected={sel.lhs} hinted={hinted('lhs')}
          onToggle={toggle} interactive={!disabled} />
      </figure>
      <div className="dm-eq" aria-hidden="true">=</div>
      <figure className="dm-side">
        <figcaption>Right side</figcaption>
        <DiagramView d={result.current.rhs} side="rhs" selected={sel.rhs} hinted={hinted('rhs')}
          onToggle={toggle} interactive={!disabled} />
      </figure>
    </div>
    <p className="dm-status" aria-live="polite">
      {result.sameDiagram ? 'Both sides are already the same diagram.'
        : !anySelected ? 'Click boxes to select them, then apply a rule that fits.'
        : fitting.length ? `${name(fitting[0])} fits this selection.`
        : 'No rule fits this selection. Try adding or removing a box.'}
    </p>
    <div className="dm-cards">
      {result.sameDiagram &&
        <button className="dm-card fits" disabled={disabled} onClick={() => onMove('same_diagram')}>
          <strong>Same picture</strong><span>Finish: the two sides only differ in bookkeeping.</span>
        </button>}
      {result.moves.map(m => {
        const ok = fits(m)
        return <div key={m.tactic} className={`dm-card${ok ? ' fits' : ''}`}
            onMouseEnter={() => setHint(m)} onMouseLeave={() => setHint(null)}>
          <div className="dm-card-top">
            <strong>{name(m)}{m.reverse ? ' (backwards)' : ''}</strong>
            <span className="dm-chip">{ok ? 'Fits' : anySelected ? "Doesn't fit" : 'Hover to see where'}</span>
          </div>
          {m.after === null && <span className="dm-sub">Finishes the level.</span>}
          <button disabled={disabled || !ok} onClick={() => onMove(m.tactic)}>Apply {name(m)}</button>
        </div>
      })}
      {!result.sameDiagram && result.moves.length === 0 &&
        <p className="dm-note">None of your rules apply to this goal. Try typing a move instead.</p>}
    </div>
  </div>
}
