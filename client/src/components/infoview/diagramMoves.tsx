/**
 * Clicking on string diagrams.
 *
 * Asks the game's Lean code (`PMC.diagramMoves`) for both sides of the current goal as
 * string-diagram data and for every move available with the player's unlocked theorems.
 * The player selects boxes; rule cards whose footprint matches the selection light up;
 * applying one sends its `diag_rw` tactic through the typewriter, so Lean checks every move.
 */
import * as React from 'react'
import { createPortal } from 'react-dom'
import { useAtom } from 'jotai'
import { gameIdAtom } from '../../store/location-atoms'
import { hintOpenAtom } from '../puzzle'
import { Markdown } from '../markdown'
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

/**
 * Lay the diagram out top to bottom. Each row takes the positions of the wires coming into it;
 * a box sits under its inputs, its outputs fan out beneath it, and neighbouring wires are pushed
 * apart only where they would collide. So wires drop straight down unless a box makes them move.
 */
function layout(d: Diagram) {
  const rowNums = [...new Set(d.nodes.map(n => n.row))].sort((a, b) => a - b)
  const rowIndex = new Map(rowNums.map((r, i) => [r, i]))
  const y = (row: number) => PAD + (rowIndex.get(row) ?? 0) * ROW
  const ins = new Map<string, number[]>(), outs = new Map<string, number[]>(), ctr = new Map<string, number>()
  const segs: { x: number, y1: number, y2: number }[] = []
  let above: number[] = []
  rowNums.forEach((r, ri) => {
    const row = d.nodes.filter(n => n.row === r).sort((a, b) => a.col - b.col || a.colOut - b.colOut)
    const nIn = row.reduce((s, n) => s + n.nIn, 0)
    const xin = above.length === nIn ? above : [...Array(nIn).keys()].map(i => PAD + i * COL)
    const below: number[] = []
    let last = -Infinity
    for (const n of row) {
      const myIn = xin.slice(n.col, n.col + n.nIn)
      let c = myIn.length ? myIn.reduce((a, b) => a + b, 0) / myIn.length
        : last > -Infinity ? last + COL : (xin[n.col] ?? PAD + COL) - COL
      const want = [...Array(n.nOut).keys()].map(k => c + (k - (n.nOut - 1) / 2) * COL)
      const got = want.map(w => { const v = Math.max(w, (below.length ? below[below.length - 1] : -Infinity) + COL); below.push(v); return v })
      if (!myIn.length && got.length) c = got.reduce((a, b) => a + b, 0) / got.length
      ins.set(n.id, myIn); outs.set(n.id, got); ctr.set(n.id, c)
      last = Math.max(c, ...got)
    }
    if (ri + 1 < rowNums.length)
      for (const xv of below) segs.push({ x: xv, y1: y(r) + LEG, y2: y(rowNums[ri + 1]) - LEG })
    above = below
  })
  // Shift everything so the leftmost thing sits at the margin.
  const all = [...ctr.values(), ...[...ins.values()].flat(), ...[...outs.values()].flat()]
  const lo = all.length ? Math.min(...all) : PAD, hi = all.length ? Math.max(...all) : PAD
  const dx = PAD + 10 - lo
  const sh = (v: number) => v + dx
  return {
    y, segs: segs.map(sg => ({ ...sg, x: sh(sg.x) })),
    center: (n: DNode) => sh(ctr.get(n.id) ?? 0),
    inX: (n: DNode) => (ins.get(n.id) ?? []).map(sh),
    outX: (n: DNode) => (outs.get(n.id) ?? []).map(sh),
    width: hi - lo + 2 * (PAD + 10), height: PAD * 2 + Math.max(0, rowNums.length - 1) * ROW,
  }
}

type Shape = { kind: 'dot' | 'cap' | 'state' | 'box' | 'braid', half: number, width: number }
function shapeOf(n: DNode, spread: number): Shape {
  if (n.label === 'Δ') return { kind: 'dot', half: 0, width: 12 }
  if (n.label === 'ε') return { kind: 'cap', half: 0, width: 20 }
  if (/^\(β_ .*\)\.(hom|inv)$/.test(n.label) && n.nIn === 2 && n.nOut === 2)
    return { kind: 'braid', half: 0, width: COL }
  if (n.nIn === 0) return { kind: 'state', half: 12, width: Math.max(44, spread + 28) }
  return { kind: 'box', half: 15, width: Math.max(34, n.label.length * 9 + 16, spread + 28) }
}

function Glyph({ n, cx, y, shape }: { n: DNode, cx: number, y: number, shape: Shape }) {
  if (shape.kind === 'braid') return null
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
export function DiagramView({ d, side, selected, hinted, onToggle, interactive, scale = 1, className = '' }: {
  d: Diagram, side: Side, selected: Set<string>, hinted: Set<string>,
  onToggle: (side: Side, id: string) => void, interactive: boolean, scale?: number, className?: string }) {
  const { y, segs, center, inX, outX, width, height } = layout(d)
  const atoms = d.nodes.filter(n => n.isAtom)
  const firstRow = Math.min(...d.nodes.map(n => n.row)), lastRow = Math.max(...d.nodes.map(n => n.row))
  const spread = (n: DNode) => Math.max(n.nIn, n.nOut, 1) * COL - COL
  const paths: string[] = segs.map(sg => `M ${sg.x} ${sg.y1} L ${sg.x} ${sg.y2}`)
  const crossings: [string, string][] = []
  for (const n of d.nodes) {
    const cy = y(n.row), xi = inX(n), xo = outX(n)
    if (!n.isAtom) {
      // A pass-through: the wire may shift sideways here.
      const top = n.row === firstRow ? cy : cy - LEG, bottom = n.row === lastRow ? cy : cy + LEG
      if (xi.length && xo.length) paths.push(wire(xi[0], top, xo[0], bottom))
      continue
    }
    const cx = center(n), sh = shapeOf(n, spread(n))
    if (sh.kind === 'braid' && xi.length === 2 && xo.length === 2) {
      // A crossing: one strand passes under the other (the gap is drawn in the sheet colour).
      const under = wire(xi[0], cy - LEG, xo[1], cy + LEG), over = wire(xi[1], cy - LEG, xo[0], cy + LEG)
      const isInv = n.label.endsWith('.inv')
      crossings.push(isInv ? [over, under] : [under, over])
      continue
    }
    // Where the legs meet the glyph: spread across a box, or all at the centre of a dot or cap.
    const port = (i: number, k: number) => sh.kind === 'box' || sh.kind === 'state'
      ? cx + (i - (k - 1) / 2) * COL : cx
    xi.forEach((px, i) => paths.push(wire(px, cy - LEG, port(i, xi.length), cy - sh.half)))
    xo.forEach((px, k) => paths.push(wire(port(k, xo.length), cy + sh.half, px, cy + LEG)))
  }
  const hit = (n: DNode) => { const w = shapeOf(n, spread(n)).width + 20; return { x: center(n) - w / 2, w } }
  const vw = Math.max(width, scale < 1 ? 60 : 140)
  return <svg viewBox={`0 0 ${vw} ${height}`} width={vw * scale} height={height * scale}
      className={`dm-svg ${className}`}
      role="group" aria-label={side === 'lhs' ? 'Left side' : 'Right side'}>
    {atoms.map(n => {
      const cls = selected.has(n.id) ? 'dm-halo selected' : hinted.has(n.id) ? 'dm-halo hinted' : null
      const h = hit(n)
      return cls && <rect key={`h-${n.id}`} x={h.x} y={y(n.row) - 22} width={h.w} height={44} rx={10} className={cls} />
    })}
    {paths.map((dd, i) => <path key={i} d={dd} className="dm-wire" />)}
    {crossings.map(([u, o], i) => <g key={`x-${i}`}><path d={u} className="dm-wire" />
      <path d={o} className="dm-wire-gap" /><path d={o} className="dm-wire" /></g>)}
    {atoms.map(n => <Glyph key={n.id} n={n} cx={center(n)} y={y(n.row)} shape={shapeOf(n, spread(n))} />)}
    {d.nodes.filter(n => !n.isAtom && (n.row === firstRow || n.row === lastRow)).map(n =>
      <text key={`b-${n.id}`} x={(n.row === firstRow ? inX(n) : outX(n))[0] ?? center(n)}
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
export interface RuleDiagram { name: string, diagrams: EqDiagrams | null, structural?: boolean }

/** Rule pictures and doc texts are the same for every goal; fetch each once per page. */
const ruleDiagramCache = new Map<string, EqDiagrams | null>()
/** Rules whose two sides are the same picture (bookkeeping like `assoc`): no card for them. */
const structuralRules = new Set<string>()
const ruleDocCache = new Map<string, string>()

const empty = new Set<string>()

/** A rule's own before-and-after picture, small. */
function MiniRule({ d }: { d: EqDiagrams }) {
  const view = (x: Diagram, side: Side) => x.nodes.length
    ? <DiagramView d={x} side={side} selected={empty} hinted={empty} onToggle={() => {}}
        interactive={false} scale={0.5} className="dm-mini-svg" />
    : <span className="dm-mini-nothing">nothing</span>
  return <div className="dm-mini" aria-hidden="true">
    {view(d.lhs, 'lhs')}<span className="dm-mini-eq">=</span>{view(d.rhs, 'rhs')}
  </div>
}

/** First paragraph of a theorem's doc, without its "Lean name: ..." line. */
function useRuleDocs(gameId: string | undefined, rules: string[]) {
  const [, bump] = React.useState(0)
  React.useEffect(() => {
    if (!gameId) return
    let cancelled = false
    for (const r of rules) {
      if (ruleDocCache.has(r)) continue
      ruleDocCache.set(r, '')
      fetch(`${window.location.origin}/data/${gameId}/doc__Theorem__${r}.json`)
        .then(res => res.json())
        .then((doc: any) => {
          const text = String(doc?.content ?? '').split(/\n\s*\n/)[0]
            .replace(/\s*Lean name:[\s\S]*$/, '').trim()
          ruleDocCache.set(r, text)
          if (!cancelled) bump(n => n + 1)
        }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [gameId, rules.join(',')])
  return (r: string) => ruleDocCache.get(r) ?? ''
}

/**
 * The goal as two clickable diagrams, and (in the rules column) a card per rule.
 * With `readOnly`, only the pictures are shown: the level is played by typing.
 */
export function DiagramMoves({ rpcSess, goal, rules, ruleNames, onMove, disabled, readOnly = false,
    onReset, moveCount = 0 }: {
  rpcSess: RpcSessionAtPos, goal: any, rules: string[], ruleNames: Map<string, string>,
  onMove: (tactic: string) => void, disabled: boolean, readOnly?: boolean,
  onReset?: () => void, moveCount?: number }) {
  const [result, setResult] = React.useState<MovesResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [sel, setSel] = React.useState<Selection>({ lhs: new Set(), rhs: new Set() })
  const [hint, setHint] = React.useState<Move | null>(null)
  const [, setHintOpen] = useAtom(hintOpenAtom)
  const [gameId] = useAtom(gameIdAtom)
  const [, bump] = React.useState(0)
  const rulesKey = rules.join(',')
  const docOf = useRuleDocs(gameId, readOnly ? [] : rules)

  // The infoview often reloads the same goal; keep the player's selection unless the picture changed.
  const shown = React.useRef<string>('')
  React.useEffect(() => {
    let cancelled = false
    setError(null)
    rpcSess.call('PMC.diagramMoves', { goal, rules: readOnly ? [] : rules })
      .then((r: any) => {
        if (cancelled) return
        const key = JSON.stringify((r as MovesResult).current)
        if (key !== shown.current) { setSel({ lhs: new Set(), rhs: new Set() }); setHint(null) }
        shown.current = key
        setResult(r as MovesResult)
      })
      .catch((e: any) => { if (!cancelled) setError(String(e?.message ?? e)) })
    return () => { cancelled = true }
  }, [rpcSess, goal, rulesKey, readOnly])

  // The rule cards' own pictures.
  React.useEffect(() => {
    if (readOnly) return
    const missing = rules.filter(r => !ruleDiagramCache.has(r))
    if (!missing.length) return
    let cancelled = false
    rpcSess.call('PMC.ruleDiagrams', { goal, rules: missing })
      .then((rs: any) => {
        for (const r of (rs as RuleDiagram[])) {
          ruleDiagramCache.set(r.name, r.diagrams)
          if (r.structural || !r.diagrams) structuralRules.add(r.name)
        }
        if (!cancelled) bump(n => n + 1)
      }).catch(() => {})
    return () => { cancelled = true }
  }, [rpcSess, goal, rulesKey, readOnly])

  // The rules column exists once the level page has rendered.
  const [slot, setSlot] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => { setSlot(document.getElementById('pmc-rules-slot')) })

  if (error) return <div className="dm-panel dm-note">Couldn't draw this goal: {error}</div>
  if (!result) return <div className="dm-panel dm-note">Drawing the goal…</div>
  if (!result.current) return null

  const interactive = !disabled && !readOnly
  const toggle = (side: Side, id: string) => {
    if (!interactive) return
    setHint(null)
    setSel(s => { const next = new Set(s[side]); next.has(id) ? next.delete(id) : next.add(id); return { ...s, [side]: next } })
  }
  const fits = (m: Move) => sameSet(sel.lhs, m.lhsFootprint) && sameSet(sel.rhs, m.rhsFootprint)
  const anySelected = sel.lhs.size + sel.rhs.size > 0
  const name = (rule: string) => ruleNames.get(rule) ?? (rule.includes('.') ? rule.split('.').pop()! : `Your hypothesis ${rule}`)
  const hinted = (side: Side) => new Set(hint ? (side === 'lhs' ? hint.lhsFootprint : hint.rhsFootprint) : [])
  const fitting = result.moves.filter(fits)

  // One card per rule: every unlocked rule, then any hypotheses Lean offered.
  // Bookkeeping rules never change the picture, so they get no card. Rules that apply here come first.
  const offered = new Set(result.moves.map(m => m.rule))
  const cardRules = [...rules.filter(r => !structuralRules.has(r) || offered.has(r)),
                     ...[...offered].filter(r => !rules.includes(r))]
    .sort((a, b) => Number(offered.has(b)) - Number(offered.has(a)))
  const cards = <div className="dm-cards">
    {cardRules.map(rule => {
      const moves = result.moves.filter(m => m.rule === rule)
      const ok = moves.filter(fits)
      const state = ok.length ? 'fits' : moves.length ? 'live' : 'idle'
      const pic = ruleDiagramCache.get(rule)
      const doc = docOf(rule)
      return <div key={rule} className={`dm-card ${state}`}
          onMouseEnter={() => moves[0] && setHint(moves[0])} onMouseLeave={() => setHint(null)}>
        <div className="dm-card-top">
          <strong>{name(rule)}</strong>
          <span className="dm-chip">{state === 'fits' ? 'Fits'
            : state === 'idle' ? 'Not here' : anySelected ? "Doesn't fit" : 'Select pieces'}</span>
        </div>
        {pic && <MiniRule d={pic} />}
        {doc && <div className="dm-doc"><Markdown>{doc}</Markdown></div>}
        {moves.some(m => m.after === null) && <span className="dm-sub">Finishes the level.</span>}
        {moves.length > 0 && <div className="dm-actions">
          {(ok.length ? ok : moves.slice(0, 1)).map(m =>
            <button key={m.tactic} disabled={disabled || !fits(m)} onClick={() => onMove(m.tactic)}>
              Apply{m.reverse ? ' backwards' : ''}</button>)}
        </div>}
      </div>
    })}
    {result.moves.length === 0 && !result.sameDiagram &&
      <p className="dm-note">None of your rules apply to this goal yet.</p>}
  </div>

  return <div className={`dm-panel${readOnly ? ' read-only' : ''}`}>
    <div className="dm-equation">
      <figure className="dm-side">
        <figcaption><span>Left side</span>{!readOnly && <span className="dm-cap-state">
          {sel.lhs.size ? `${sel.lhs.size} selected` : 'Nothing selected'}</span>}</figcaption>
        <DiagramView d={result.current.lhs} side="lhs" selected={sel.lhs} hinted={hinted('lhs')}
          onToggle={toggle} interactive={interactive} />
      </figure>
      <div className="dm-eq" aria-hidden="true">=</div>
      <figure className="dm-side">
        <figcaption><span>Right side</span>{!readOnly && <span className="dm-cap-state">
          {sel.rhs.size ? `${sel.rhs.size} selected` : ''}</span>}</figcaption>
        <DiagramView d={result.current.rhs} side="rhs" selected={sel.rhs} hinted={hinted('rhs')}
          onToggle={toggle} interactive={interactive} />
      </figure>
    </div>
    <div className="dm-statusrow">
      <p className="dm-status" aria-live="polite">
        {result.sameDiagram ? (readOnly ? 'Both sides are the same picture; now show Lean why.' : 'Both sides are the same picture.')
          : readOnly ? ''
          : !anySelected ? 'Select pieces of a diagram to begin.'
          : fitting.length ? `${name(fitting[0].rule)} fits this selection.`
          : 'No rule fits this selection. Try adding or removing a box.'}
      </p>
      <div className="dm-tools">
        {!readOnly && <span className="dm-count">Moves {moveCount}</span>}
        <button className="dm-tool" onClick={() => setHintOpen(o => !o)}>Hint</button>
        {onReset && moveCount > 0 && <button className="dm-tool" onClick={onReset}>Start over</button>}
      </div>
    </div>
    {result.sameDiagram && !readOnly &&
      <button className="dm-same" disabled={disabled} onClick={() => onMove('same_diagram')}>
        <strong>Same picture</strong><span>Finish: the two sides only differ in bookkeeping.</span>
      </button>}
    {!readOnly && (slot ? createPortal(cards, slot) : cards)}
  </div>
}
