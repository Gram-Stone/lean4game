/**
 * The puzzle layout of a level: a goal sheet (title, story, big diagrams, hint, the proof log)
 * and a column of the player's rules. It reuses lean4game's proof machinery; only the
 * arrangement is new.
 */
import * as React from 'react'
import { atom, useAtom } from 'jotai'
import { useTranslation } from 'react-i18next'
import { Markdown } from './markdown'
import { useGameTranslation } from '../utils/translation'
import { levelInfoAtom, gameInfoAtom } from '../store/query-atoms'
import { inventoryAtom } from '../store/inventory-atoms'
import { gameIdAtom, levelIdAtom, worldIdAtom } from '../store/location-atoms'
import { proofAtom } from '../store/editor-atoms'
import { worldProgressAtom } from '../store/progress-atoms'
import { GameHint } from './infoview/rpc_api'

/** The rules the player can apply by clicking in this level, or `null` if clicking isn't unlocked. */
export function useClickRules(): { rules: string[], names: Map<string, string> } | null {
  const [{ data: levelInfo }] = useAtom(levelInfoAtom)
  const [inventory] = useAtom(inventoryAtom)
  return React.useMemo(() => {
    const unlocked = (t: any) => t && !t.disabled && (!t.locked || (inventory ?? []).includes(t.name))
    const diagRw = (levelInfo as any)?.tactics?.find((t: any) => t.name === 'diag_rw')
    if (!unlocked(diagRw)) return null
    const lemmas = ((levelInfo as any)?.lemmas ?? []).filter(unlocked)
    return { rules: lemmas.map((t: any) => t.name),
             names: new Map<string, string>(lemmas.map((t: any) => [t.name, t.displayName])) }
  }, [levelInfo, inventory])
}

/** Whether the hint box is open. Shared by the Hint button and the box itself. */
export const hintOpenAtom = atom(false)

/** The top of the sheet: the level's title and story. */
export function PuzzleHeading({ clickable }: { clickable: boolean }) {
  const { t: gT } = useGameTranslation()
  const [{ data: levelInfo }] = useAtom(levelInfoAtom)
  const [proof] = useAtom(proofAtom)
  const title = gT((levelInfo as any)?.title ?? '')
  const intro = gT((levelInfo as any)?.introduction ?? '')
  return <header className="pz-heading">
    <p className="pz-kicker">Goal</p>
    {title && <h1 className="pz-title">{title}</h1>}
    {intro.trim() && <div className="pz-story"><Markdown>{intro}</Markdown></div>}
    {!proof?.completed && <p className="pz-instruction">
      {clickable
        ? 'Click boxes in the pictures to select them, then apply a rule that fits.'
        : 'Type a Lean move in the box below; the pictures update as you go.'}
    </p>}
  </header>
}

/** Hints for the current step, shown when the player asks for one. */
export function HintBox() {
  const { t: gT } = useGameTranslation()
  const [open, setOpen] = useAtom(hintOpenAtom)
  const [proof] = useAtom(proofAtom)
  const steps = proof?.steps ?? []
  const last = steps.length ? steps[steps.length - 1] : undefined
  const hints: GameHint[] = (last?.goals?.[0] as any)?.hints ?? []
  const text = (h: GameHint) => h.rawText
    ? gT(h.rawText).replaceAll(/«\{(.*?)\}»/g, (_, v) => (h.varNames.find(x => x[0] == v))?.[1] ?? '')
    : gT(h.text)
  React.useEffect(() => { setOpen(false) }, [steps.length])
  if (!open || proof?.completed) return null
  return <div className="pz-hint" role="note">
    <div className="pz-hint-top"><strong>Hint</strong>
      <button className="pz-link" onClick={() => setOpen(false)}>Close</button></div>
    {hints.length
      ? hints.map((h, i) => <Markdown key={i}>{text(h)}</Markdown>)
      : <p>No hint for this step. Try hovering a rule card to see where it would apply.</p>}
  </div>
}

/** Shown when the level is done: the conclusion and the way on. */
export function LevelComplete() {
  const { t } = useTranslation()
  const { t: gT } = useGameTranslation()
  const [proof] = useAtom(proofAtom)
  const [{ data: levelInfo }] = useAtom(levelInfoAtom)
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)
  const [gameId, navigateToGame] = useAtom(gameIdAtom)
  const [worldId] = useAtom(worldIdAtom)
  const [levelId, navigateToLevel] = useAtom(levelIdAtom)
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => { if (proof?.completed) ref.current?.focus() }, [!!proof?.completed])
  if (!proof?.completed) return null
  const size = worldId ? gameInfo?.worldSize?.[worldId] ?? 0 : 0
  const lastLevel = levelId !== undefined && levelId >= size
  const conclusion = gT((levelInfo as any)?.conclusion ?? '')
  return <section className="pz-done" aria-live="polite">
    <p className="pz-kicker">Level complete</p>
    {conclusion.trim() && <Markdown>{conclusion}</Markdown>}
    {lastLevel
      ? <button ref={ref} className="pz-primary" onClick={() => { if (gameId) navigateToGame(gameId) }}>
          Back to the map</button>
      : <button ref={ref} className="pz-primary" onClick={() => { if (levelId !== undefined) navigateToLevel(levelId + 1) }}>
          {t('Next')} level →</button>}
  </section>
}

/** The right-hand column. Rule cards are drawn into `#pmc-rules-slot` by the diagram panel. */
export function RulesAside() {
  return <aside className="pz-rules" aria-label="Your rules">
    <h2 className="pz-rules-title">Your rules</h2>
    <p className="pz-rules-sub">Axioms and theorems you have collected. A card lights up when it fits your selection.</p>
    <div id="pmc-rules-slot" />
  </aside>
}

/** "World · Level n of m" and one dot per level: done, current, still to come. */
export function LevelProgress() {
  const { t: gT } = useGameTranslation()
  const [{ data: gameInfo }] = useAtom(gameInfoAtom)
  const [worldId] = useAtom(worldIdAtom)
  const [levelId] = useAtom(levelIdAtom)
  const [worldProgress] = useAtom(worldProgressAtom)
  if (!worldId) return null
  const size = gameInfo?.worldSize?.[worldId] ?? 0
  const worldTitle = gT(gameInfo?.worlds?.nodes[worldId]?.title ?? worldId)
  const done = (n: number) => !!(worldProgress as any)?.[n]?.completed
  return <div className="pz-progress">
    <span>{worldTitle}{levelId ? ` · Level ${levelId} of ${size}` : ' · Introduction'}</span>
    <span className="pz-dots" aria-hidden="true">
      {Array.from({ length: size }, (_, i) => i + 1).map(n =>
        <i key={n} className={n === levelId ? 'now' : done(n) ? 'done' : ''} />)}
    </span>
  </div>
}
