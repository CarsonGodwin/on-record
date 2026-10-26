import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Ranked } from '../data/stats'
import { formatDuration } from '../lib/format'
import { LAUNCH_KEY } from '../lib/keys'
import { COARSE, PHONE } from '../lib/pointer'
import { matches } from '../lib/search'
import { arrow, hover, NO_SELECTION, settle, span, stretchTo } from '../lib/selection'
import { Modal } from './Panels'
import type { Track } from './TrackMenu'

/*
 * The ⌘K launcher: one search box over the commands, the tracklist and the
 * years, with pages stacked under it: picking artists to hide, managing the
 * hidden ones, Help and About. Escape steps back up to the main list before it
 * closes. Focus stays in the box; the arrow keys move a highlight through the
 * results. In the artist lists, Shift with the arrows (or a Shift-click)
 * stretches the highlight over a run of artists, and Enter acts on them all.
 */

export type LauncherMode = 'root' | 'hide' | 'manage' | 'help' | 'about'

interface Item {
  key: string
  group: string
  label: string
  /** Shown on the right: a track number, an artist's hours */
  hint?: string
  /** A keyboard shortcut shown beside the hint */
  shortcut?: string
  /** Extra words that should find this item */
  terms?: string
  /** Artists have none: picking them goes through the selection */
  run?: () => void
  /** The "all matches" row: every artist the search finds, past the ones listed too */
  names?: string[]
}

/** Thousands of artists would make a slow list; a search narrows it anyway */
const MAX_ARTISTS = 60

/** ⌘ on Apple keyboards, Ctrl everywhere else, as LAUNCH_KEY writes it */
const MOD = LAUNCH_KEY.startsWith('⌘') ? '⌘' : 'Ctrl '

const SOURCE = 'https://github.com/CarsonGodwin/on-record'

interface Props {
  mode: LauncherMode | null
  onMode: (mode: LauncherMode | null) => void
  tracks: Track[]
  sides: Record<string, string>
  years: number[]
  year: number | null
  /** Whether podcasts and audiobooks are left out, shown beside Settings */
  musicOnly: boolean
  /** Music artists still showing, most-listened first */
  artists: Ranked[]
  /** Hidden artists, most-listened first */
  hidden: Ranked[]
  onJump: (id: string) => void
  onYear: (year: number | null) => void
  /** Returns false when hiding them would leave nothing to show */
  onHide: (artists: string[]) => boolean
  onUnhide: (artists: string[]) => void
  onSettings: () => void
  onReset: () => void
}

const TITLES: Record<LauncherMode, string> = {
  root: 'Launcher',
  hide: 'Hide artists',
  manage: 'Hidden artists',
  help: 'Help',
  about: 'About My Listening Record',
}

export function Launcher(props: Props) {
  const { mode, onMode } = props
  return (
    <Modal
      open={mode !== null}
      // Escape (and the backdrop) step back up to the main list first
      onClose={() => onMode(mode === 'root' ? null : 'root')}
      onGone={() => onMode(null)}
      label={mode ? TITLES[mode] : 'Launcher'}
      className="modal--launcher"
    >
      {/* Keyed by mode, so each opening and each switch starts a fresh search */}
      {mode === 'help' || mode === 'about' ? (
        <LauncherPage key={mode} mode={mode} onBack={() => onMode('root')} />
      ) : (
        mode && <LauncherBody key={mode} {...props} mode={mode} />
      )}
    </Modal>
  )
}

function LauncherBody({
  mode,
  onMode,
  tracks,
  sides,
  years,
  year,
  musicOnly,
  artists,
  hidden,
  onJump,
  onYear,
  onHide,
  onUnhide,
  onSettings,
  onReset,
}: Props & { mode: 'root' | 'hide' | 'manage' }) {
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(NO_SELECTION)
  // What the last hide or unhide did. It goes once you type or move on, so the selection count can show.
  const [note, setNote] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  // On a touch screen the search waits for a tap: focus in it brings the keyboard up over the list every
  // time the launcher opens. The title (only read out, never seen) takes focus instead. On the first opening
  // the dialog isn't open yet and its own focusing does this; switching pages, this effect does.
  useEffect(() => {
    if (COARSE) titleRef.current?.focus()
  }, [])
  const listing = mode !== 'root'
  const verb = mode === 'manage' ? 'unhide' : 'hide'
  const pool = mode === 'manage' ? hidden : artists

  const items = useMemo<Item[]>(() => {
    if (mode !== 'root') {
      const found = pool.filter((a) => matches(query, a.label))
      const listed: Item[] = found.slice(0, MAX_ARTISTS).map((a) => ({
        key: `artist:${a.label}`,
        group: mode === 'manage' ? 'Unhide an artist' : 'Hide an artist',
        label: a.label,
        hint: formatDuration(a.ms),
      }))
      const q = query.trim()
      if (found.length < 2 || (mode === 'hide' && q === '')) return listed
      const all: Item = {
        key: 'all',
        group: 'Every match',
        label: `${mode === 'manage' ? 'Unhide' : 'Hide'} all ${found.length}${q ? ` matching “${q}”` : ''}`,
        hint: formatDuration(found.reduce((sum, a) => sum + a.ms, 0)),
        names: found.map((a) => a.label),
      }
      return [all, ...listed]
    }
    const all: Item[] = [
      { key: 'settings', group: 'Commands', label: 'Settings', hint: musicOnly ? 'Music only' : 'Music + Podcasts and Audiobooks', run: onSettings },
      { key: 'hide', group: 'Commands', label: 'Hide Artists…', terms: 'exclude remove filter', run: () => onMode('hide') },
      ...(hidden.length > 0
        ? [
            {
              key: 'manage',
              group: 'Commands',
              label: 'Manage Hidden Artists…',
              hint: `${hidden.length} hidden`,
              terms: 'unhide show restore',
              run: () => onMode('manage'),
            },
          ]
        : []),
      { key: 'help', group: 'Commands', label: 'Help', hint: 'Getting your data, keys', run: () => onMode('help') },
      { key: 'about', group: 'Commands', label: 'About', hint: 'Source, license, credits', run: () => onMode('about') },
      { key: 'reset', group: 'Commands', label: 'Clear Data', hint: 'Back to the start', terms: 'new load reset export file zip drop open', run: onReset },
      ...tracks.map((t, i) => ({
        key: `track:${t.id}`,
        group: 'Go to…',
        label: t.title,
        hint: t.num,
        shortcut: i < 9 && !COARSE ? `${MOD}${i + 1}` : undefined,
        terms: `${t.num} side ${t.num[0]} ${sides[t.num[0]] ?? ''}`,
        run: () => onJump(t.id),
      })),
      ...[null, ...years].map((y) => ({
        key: `year:${y ?? 'all'}`,
        group: 'Years',
        label: y === null ? 'All time' : String(y),
        hint: y === year ? 'Showing' : undefined,
        terms: 'year period',
        run: () => onYear(y),
      })),
    ]
    // The hint beside a command finds it too: "music" finds Settings, "license" finds About
    return all.filter((item) => matches(query, `${item.label} ${item.hint ?? ''} ${item.terms ?? ''}`))
  }, [mode, query, pool, hidden, tracks, sides, years, year, musicOnly, onSettings, onReset, onMode, onJump, onYear])

  const firstPick = items[0]?.names ? 1 : 0
  const { current, from, to } = span(sel, items.length, firstPick)
  // A Shift selection is a run of artists; the "all matches" row isn't one of them
  const picked = listing ? items.slice(from, to + 1).filter((item) => !item.names) : []

  /** The search stays, so the next match for the same word is right there */
  function act(names: string[]) {
    const what = names.length === 1 ? names[0] : `${names.length} artists`
    // The page works its charts out again once, when the launcher closes, rather than after every pick
    if (mode === 'manage') {
      onUnhide(names)
      setNote(`Unhid ${what}. The charts update when you close this.`)
    } else setNote(onHide(names) ? `Hid ${what}. The charts update when you close this.` : `Can’t hide ${what}: at least one artist has to stay`)
    setSel(settle(sel, items.length, firstPick))
    // Not on a touch screen, where that would bring the keyboard back over the list
    if (!COARSE) inputRef.current?.focus()
  }

  /** Runs a row; in the artist lists, a row inside the selection acts on the whole selection */
  function pick(i: number) {
    const item = items[i]
    if (!item) return
    if (item.names) act(item.names)
    else if (listing) act(picked.length > 1 && i >= from && i <= to ? picked.map((p) => p.label) : [item.label])
    else item.run?.()
  }

  // Keep the highlighted row in view as the arrow keys move it
  useEffect(() => {
    listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [current, items])

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Enter and the arrows belong to the input method while it's composing (Japanese, Chinese, …)
    if (e.nativeEvent.isComposing) return
    // ⌘1–⌘9 go straight to the first nine tracks
    if (mode === 'root' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
      const track = tracks[Number(e.key) - 1]
      if (!track) return
      e.preventDefault()
      onJump(track.id)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      // With Shift (in the artist lists) the selection stretches along instead of the highlight moving
      setSel(arrow(sel, items.length, firstPick, e.key === 'ArrowDown' ? 1 : -1, e.shiftKey && listing))
      setNote(null)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(current)
    } else if (e.key === 'Backspace' && query === '' && listing) {
      e.preventDefault()
      onMode('root')
    }
  }

  return (
    <>
      {/* First in the dialog, so its opening never lands in the search on the way */}
      <h2 className="sr-only" ref={titleRef} tabIndex={-1} data-autofocus={COARSE || undefined}>
        {TITLES[mode]}
      </h2>
      <div className="launcher__search">
        {listing && (
          <button type="button" className="chip-button" onClick={() => onMode('root')}>
            ← Back
          </button>
        )}
        <input
          ref={inputRef}
          className="launcher__input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="launcher-list"
          aria-activedescendant={items[current] ? `launcher-${items[current].key}` : undefined}
          aria-label={mode === 'manage' ? 'Search hidden artists' : mode === 'hide' ? 'Search your artists' : 'Search sections, years and commands'}
          placeholder={mode === 'manage' ? 'Search hidden artists…' : mode === 'hide' ? 'Search your artists…' : PHONE ? 'Jump to…' : 'Jump to a section or year, or run a command…'}
          autoComplete="off"
          spellCheck={false}
          autoFocus={!COARSE}
          data-autofocus={!COARSE || undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSel(NO_SELECTION)
            setNote(null)
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      <ul className="launcher__list" id="launcher-list" role="listbox" aria-multiselectable={listing || undefined} ref={listRef}>
        {items.length === 0 && (
          <li className="launcher__empty">{mode === 'manage' && query === '' ? 'Nothing is hidden.' : `Nothing matches “${query}”`}</li>
        )}
        {items.map((item, i) => {
          const header = item.group !== items[i - 1]?.group ? item.group : null
          const inPick = listing && picked.length > 1 && i >= from && i <= to && !item.names
          return (
            <li key={item.key} role="presentation">
              {header && <p className="launcher__group">{header}</p>}
              <div
                id={`launcher-${item.key}`}
                role="option"
                aria-selected={i === current || inPick}
                className={i === current ? 'launcher__item is-active' : 'launcher__item'}
                // Focus (and so the arrows and Enter) stays in the search box, and a Shift-click doesn't select text
                onMouseDown={(e) => e.preventDefault()}
                onPointerMove={() => setSel((s) => hover(s, i))}
                onClick={(e) => {
                  if (!e.shiftKey || !listing || item.names) return pick(i)
                  setSel(stretchTo(sel, items.length, firstPick, i))
                  setNote(null)
                }}
              >
                <span className="launcher__label">{item.label}</span>
                {item.hint && <span className="launcher__hint">{item.hint}</span>}
                {item.shortcut && <kbd className="launcher__shortcut">{item.shortcut}</kbd>}
                {mode === 'manage' && i === current && !item.names && <span className="launcher__action">Unhide</span>}
              </div>
            </li>
          )
        })}
      </ul>

      <footer className="launcher__foot">
        {note ? (
          <span className="launcher__note" role="status">
            {note}
          </span>
        ) : picked.length > 1 ? (
          <span className="launcher__note">
            {picked.length} selected. Press Enter to {verb} them all.
          </span>
        ) : listing ? (
          <span>
            {pool.length > MAX_ARTISTS && query === '' ? `Top ${MAX_ARTISTS} of ${pool.length}. Type to find the rest. ` : ''}
            {mode === 'hide' && hidden.length > 0 ? `${hidden.length} hidden. ` : ''}
            {COARSE ? `Tap an artist to ${verb}.` : `Press Enter to ${verb}. Hold Shift + ↑ ↓ to select several.`}
          </span>
        ) : COARSE ? (
          <span>Tap a row to pick it, or tap outside to close.</span>
        ) : (
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>↵</kbd> to pick · <kbd>Esc</kbd> to close
          </span>
        )}
      </footer>
    </>
  )
}

/** Help and About: something to read, with the way back on top */
function LauncherPage({ mode, onBack }: { mode: 'help' | 'about'; onBack: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  // Reached from the main list, the dialog is already open, so its own focusing doesn't run
  useEffect(() => titleRef.current?.focus(), [])
  return (
    <>
      <div className="launcher__search">
        <button type="button" className="chip-button" onClick={onBack}>
          ← Back
        </button>
        <h2 className="launcher__title" ref={titleRef} tabIndex={-1} data-autofocus>
          {TITLES[mode]}
        </h2>
      </div>

      <div className="launcher__page">
        {mode === 'help' ? (
          <>
            <h3>Getting your data</h3>
            <ol>
              <li>
                Go to{' '}
                <a href="https://www.spotify.com/account/privacy/" target="_blank" rel="noreferrer">
                  spotify.com/account/privacy
                </a>{' '}
                and request <strong>Extended streaming history</strong>.
              </li>
              <li>Confirm the email, then wait for the download link (up to 30 days).</li>
              <li>Drop the .zip onto the record sleeve.</li>
            </ol>

            {!COARSE && (
              <>
            <h3>Keyboard</h3>
            <dl className="help__keys">
              <dt>
                <kbd>{LAUNCH_KEY}</kbd>
              </dt>
              <dd>Open or close the launcher</dd>
              <dt>
                <kbd>{MOD}1</kbd>–<kbd>{MOD}9</kbd>
              </dt>
              <dd>In the launcher, go straight to a section</dd>
              <dt>
                <kbd>↑</kbd> <kbd>↓</kbd> <kbd>↵</kbd>
              </dt>
              <dd>Move through a list and pick</dd>
              <dt>
                <kbd>Shift</kbd> + <kbd>↑</kbd> <kbd>↓</kbd>
              </dt>
              <dd>Select several artists to hide or unhide at once</dd>
              <dt>
                <kbd>Esc</kbd>
              </dt>
              <dd>Back to the main list, then close</dd>
              <dt>
                <kbd>←</kbd> <kbd>→</kbd>
              </dt>
              <dd>Step through The Long Play</dd>
            </dl>
              </>
            )}
          </>
        ) : (
          <>
            <p>
              My Listening Record was created by{' '}
              <a href="https://github.com/CarsonGodwin" target="_blank" rel="noreferrer">
                Carson Godwin
              </a>
              .
            </p>
            <h3>Source code</h3>
            <p>
              <a href={SOURCE} target="_blank" rel="noreferrer">
                github.com/CarsonGodwin/on-record
              </a>
            </p>
            <h3>License</h3>
            <p>
              <a href={`${SOURCE}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
                MIT
              </a>
              . The bundled fonts (Bricolage Grotesque, Instrument Serif, JetBrains Mono) are under the SIL Open Font License 1.1.
            </p>
          </>
        )}
      </div>

      {!COARSE && (
        <footer className="launcher__foot">
          <span>
            <kbd>Esc</kbd> to go back
          </span>
        </footer>
      )}
    </>
  )
}
