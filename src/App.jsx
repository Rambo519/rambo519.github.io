import { useEffect, useMemo, useReducer, useState } from 'react'
import {
  ballsForStars,
  boardRows,
  payoutCashFloor,
  payoutForBet,
  poolOnHorse,
  totalCashRounddownLeftover,
  totalPool,
  totalPayoutPool,
} from './pariMutuel.js'
import { NotesRulesContent } from './notesRulesContent.jsx'
import { SAMPLE_HORSES, generateSampleBets } from './sampleData.js'
import { clearSavedState, loadSavedState, saveState } from './storage.js'
import './App.css'

const PHASES = ['setup', 'betting', 'locked', 'results']

const LOCK_BETTING_SOUND_SRC = '/sounds/63753__rdb__atpost.mp3'

function playLockBettingSound() {
  try {
    const audio = new Audio(LOCK_BETTING_SOUND_SRC)
    void audio.play().catch(() => {})
  } catch {
    /* no-op */
  }
}

function defaultHorses() {
  const starsByLane = [6, 5, 4, 3, 2, 1]
  const names = [
    'Thunder Muffin',
    'Pasture Princess',
    'Dapple Ganger',
    'Mane Event',
    'Hay Girl Hay',
    'Furlong Shot',
  ]
  return starsByLane.map((stars, i) => ({
    id: `h${i + 1}`,
    lane: i + 1,
    name: names[i],
    stars,
    balls: ballsForStars(stars),
  }))
}

function validLoadedState(data) {
  if (!data || typeof data !== 'object') return false
  if (!PHASES.includes(data.phase)) return false
  if (!Array.isArray(data.horses) || data.horses.length !== 6) return false
  if (!Array.isArray(data.bets)) return false
  if (data.phase === 'results' && !data.winnerId) return false
  if (
    data.phase === 'results' &&
    (!data.settlementSnapshot || typeof data.settlementSnapshot !== 'object')
  ) {
    return false
  }
  const starSet = new Set(data.horses.map((h) => h.stars))
  if (starSet.size !== 6) return false
  for (let s = 1; s <= 6; s++) if (!starSet.has(s)) return false
  return true
}

const initialState = {
  phase: 'setup',
  horses: defaultHorses(),
  bets: [],
  winnerId: null,
  carryoverPool: 0,
  settlementSnapshot: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'HYDRATE':
      return validLoadedState(action.payload)
        ? {
            phase: action.payload.phase,
            horses: action.payload.horses,
            bets: action.payload.bets,
            winnerId: action.payload.winnerId ?? null,
            carryoverPool: Math.max(
              0,
              Number(action.payload.carryoverPool) || 0,
            ),
            settlementSnapshot: action.payload.settlementSnapshot ?? null,
          }
        : state

    case 'SET_NAME': {
      const { horseId, name } = action
      return {
        ...state,
        horses: state.horses.map((h) =>
          h.id === horseId ? { ...h, name } : h,
        ),
      }
    }

    case 'SET_STAR': {
      const { horseId, stars } = action
      const idx = state.horses.findIndex((h) => h.id === horseId)
      if (idx < 0) return state
      const otherIdx = state.horses.findIndex(
        (h, i) => i !== idx && h.stars === stars,
      )
      const horses = state.horses.map((h) => ({ ...h }))
      const oldStars = horses[idx].stars
      horses[idx] = {
        ...horses[idx],
        stars,
        balls: ballsForStars(stars),
      }
      if (otherIdx >= 0) {
        horses[otherIdx] = {
          ...horses[otherIdx],
          stars: oldStars,
          balls: ballsForStars(oldStars),
        }
      }
      return { ...state, horses }
    }

    case 'START_BETTING':
      return { ...state, phase: 'betting' }

    case 'ADD_BET': {
      if (state.phase !== 'betting') return state
      const { bettorName, horseId, amount } = action
      const a = Math.max(0, Number(amount) || 0)
      if (a <= 0 || !String(bettorName).trim()) return state
      const id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `b-${Date.now()}-${Math.random()}`
      return {
        ...state,
        bets: [
          ...state.bets,
          {
            id,
            bettorName: String(bettorName).trim(),
            horseId,
            amount: a,
          },
        ],
      }
    }

    case 'REMOVE_BET': {
      if (state.phase !== 'betting') return state
      return {
        ...state,
        bets: state.bets.filter((b) => b.id !== action.betId),
      }
    }

    case 'LOCK':
      if (state.phase !== 'betting') return state
      return { ...state, phase: 'locked', winnerId: null }

    case 'UNLOCK':
      if (state.phase !== 'locked') return state
      return { ...state, phase: 'betting', winnerId: null }

    case 'SET_WINNER':
      if (state.phase !== 'locked') return state
      return { ...state, winnerId: action.horseId }

    case 'TO_RESULTS': {
      if (state.phase !== 'locked' || !state.winnerId) return state
      const racePool = totalPool(state.bets)
      const carryoverBefore = state.carryoverPool
      const fullPool = totalPayoutPool(carryoverBefore, state.bets)
      const onWinner = poolOnHorse(state.bets, state.winnerId)
      const hadWinningBets = onWinner > 0
      let nextCarryover
      let cashLeftoverToCarryover = 0
      if (hadWinningBets) {
        cashLeftoverToCarryover = totalCashRounddownLeftover(
          state.bets,
          state.winnerId,
          fullPool,
          onWinner,
        )
        nextCarryover = cashLeftoverToCarryover
      } else {
        nextCarryover = carryoverBefore + racePool
      }
      const settlementSnapshot = {
        racePool,
        carryoverBefore,
        totalPayoutPool: fullPool,
        hadWinningBets,
        amountOnWinner: onWinner,
        carryoverAfter: nextCarryover,
        cashLeftoverToCarryover,
      }
      return {
        ...state,
        phase: 'results',
        carryoverPool: nextCarryover,
        settlementSnapshot,
      }
    }

    case 'RESET_RACE':
      return { ...initialState }

    case 'NEXT_RACE':
      return {
        ...state,
        phase: 'setup',
        horses: defaultHorses(),
        bets: [],
        winnerId: null,
        settlementSnapshot: null,
      }

    case 'LOAD_SAMPLE': {
      const horses = SAMPLE_HORSES.map((h) => ({ ...h }))
      const bets = generateSampleBets(
        horses.map((h) => h.id),
        12,
      )
      return {
        phase: 'betting',
        horses,
        bets,
        winnerId: null,
        carryoverPool: 0,
        settlementSnapshot: null,
      }
    }

    default:
      return state
  }
}

function fmtMoney(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return `$${Number(n).toFixed(2)}`
}

function PoolTotals({ carryoverPool, bets }) {
  const racePool = totalPool(bets)
  const full = totalPayoutPool(carryoverPool, bets)
  return (
    <div className="pool-totals">
      <div className="pool-totals-row">
        <span>Current race bets</span>
        <strong>{fmtMoney(racePool)}</strong>
      </div>
      <div className="pool-totals-row">
        <span>Carryover (prior races)</span>
        <strong>{fmtMoney(carryoverPool)}</strong>
      </div>
      <div className="pool-totals-row pool-totals-total">
        <span>Total payout pool</span>
        <strong>{fmtMoney(full)}</strong>
      </div>
    </div>
  )
}

function PayoutBoard({
  horses,
  bets,
  carryoverPool = 0,
  title = 'Projected payout board',
}) {
  const payoutPool = totalPayoutPool(carryoverPool, bets)
  const rows = useMemo(
    () => boardRows(horses, bets, carryoverPool),
    [horses, bets, carryoverPool],
  )

  return (
    <section className="card board">
      <h2>{title}</h2>
      <p className="muted">
        Pari-mutuel: payout per $1 = total payout pool ÷ amount on horse.
        Total payout pool includes carryover.
      </p>
      <PoolTotals carryoverPool={carryoverPool} bets={bets} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Lane</th>
              <th>Horse</th>
              <th>★</th>
              <th>On horse</th>
              <th>Payout / $1</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.horse.id}>
                <td>{r.horse.lane}</td>
                <td className="horse-name">{r.horse.name}</td>
                <td>{r.horse.stars}★</td>
                <td>{fmtMoney(r.amountOnHorse)}</td>
                <td>
                  {payoutPool <= 0
                    ? '—'
                    : r.payoutPerDollar != null
                      ? fmtMoney(r.payoutPerDollar)
                      : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ResetConfirmModal({ open, onCancel, onConfirm }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="modal-backdrop modal-backdrop-confirm"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="modal-panel modal-panel-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-confirm-title"
        aria-describedby="reset-confirm-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="reset-confirm-title">Reset everything?</h2>
        </div>
        <div className="modal-body">
          <p id="reset-confirm-desc">
            This clears all bets, horse setup, carryover, and saved data. You
            cannot undo this.
          </p>
          <p className="muted reset-confirm-hint">
            After payouts, use &quot;New race&quot; if you only want the next
            race and to keep carryover rules intact.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button type="button" className="btn danger" onClick={onConfirm}>
              Yes, reset
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NotesRulesModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notes-rules-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="notes-rules-title">Rules And Notes</h2>
          <button
            type="button"
            className="btn small secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="modal-body">
          <NotesRulesContent />
        </div>
      </div>
    </div>
  )
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [notesRulesOpen, setNotesRulesOpen] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)

  useEffect(() => {
    const saved = loadSavedState()
    if (saved) dispatch({ type: 'HYDRATE', payload: saved })
  }, [])

  useEffect(() => {
    saveState({
      phase: state.phase,
      horses: state.horses,
      bets: state.bets,
      winnerId: state.winnerId,
      carryoverPool: state.carryoverPool,
      settlementSnapshot: state.settlementSnapshot,
    })
  }, [
    state.phase,
    state.horses,
    state.bets,
    state.winnerId,
    state.carryoverPool,
    state.settlementSnapshot,
  ])

  const winnerHorse = state.horses.find((h) => h.id === state.winnerId)

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <img
            className="header-logo"
            src="/images/Backyard-Downs-LOGO.png"
            alt="Backyard Downs"
          />
        </div>
        <div className="header-actions" role="group" aria-label="Header actions">
          <button
            type="button"
            className="btn secondary header-toolbar-btn"
            onClick={() => setNotesRulesOpen(true)}
          >
            Rules And Notes
          </button>
          <button
            type="button"
            className="btn secondary header-toolbar-btn"
            onClick={() => dispatch({ type: 'LOAD_SAMPLE' })}
          >
            Load Sample Data
          </button>
          <button
            type="button"
            className="btn danger header-toolbar-btn"
            onClick={() => setResetConfirmOpen(true)}
          >
            Reset Race
          </button>
        </div>
      </header>

      <NotesRulesModal
        open={notesRulesOpen}
        onClose={() => setNotesRulesOpen(false)}
      />

      <ResetConfirmModal
        open={resetConfirmOpen}
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={() => {
          clearSavedState()
          dispatch({ type: 'RESET_RACE' })
          setResetConfirmOpen(false)
        }}
      />

      {state.phase === 'setup' && (
        <SetupScreen
          horses={state.horses}
          carryoverPool={state.carryoverPool}
          bets={state.bets}
          dispatch={dispatch}
        />
      )}

      {state.phase === 'betting' && (
        <>
          <SetupSummary horses={state.horses} />
          <BettingScreen
            horses={state.horses}
            bets={state.bets}
            carryoverPool={state.carryoverPool}
            dispatch={dispatch}
          />
          <PayoutBoard
            horses={state.horses}
            bets={state.bets}
            carryoverPool={state.carryoverPool}
          />
        </>
      )}

      {state.phase === 'locked' && (
        <>
          <SetupSummary horses={state.horses} />
          <LockedBettingPanel
            horses={state.horses}
            bets={state.bets}
            dispatch={dispatch}
          />
          <PayoutBoard
            horses={state.horses}
            bets={state.bets}
            carryoverPool={state.carryoverPool}
            title="Payout board (locked)"
          />
          <WinnerPick
            horses={state.horses}
            winnerId={state.winnerId}
            dispatch={dispatch}
          />
        </>
      )}

      {state.phase === 'results' && winnerHorse && state.settlementSnapshot && (
        <ResultsScreen
          horses={state.horses}
          bets={state.bets}
          winnerId={state.winnerId}
          settlementSnapshot={state.settlementSnapshot}
          dispatch={dispatch}
        />
      )}
    </div>
  )
}

function SetupScreen({ horses, carryoverPool, bets, dispatch }) {
  return (
    <section className="card">
      <h2>Race setup</h2>
      {(carryoverPool > 0 || totalPool(bets) > 0) && (
        <PoolTotals carryoverPool={carryoverPool} bets={bets} />
      )}
      <p className="muted">
        Six lanes. Each horse has a unique star rating (6 down to 1). Ball
        counts follow your table automatically.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Lane</th>
              <th>Name</th>
              <th>Stars</th>
              <th>Balls</th>
            </tr>
          </thead>
          <tbody>
            {horses.map((h) => (
              <tr key={h.id}>
                <td>{h.lane}</td>
                <td>
                  <input
                    className="input"
                    value={h.name}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_NAME',
                        horseId: h.id,
                        name: e.target.value,
                      })
                    }
                    aria-label={`Name lane ${h.lane}`}
                  />
                </td>
                <td>
                  <select
                    className="select"
                    value={h.stars}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_STAR',
                        horseId: h.id,
                        stars: Number(e.target.value),
                      })
                    }
                    aria-label={`Stars lane ${h.lane}`}
                  >
                    {[6, 5, 4, 3, 2, 1].map((s) => (
                      <option key={s} value={s}>
                        {s}★
                      </option>
                    ))}
                  </select>
                </td>
                <td>{h.balls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn success"
        onClick={() => dispatch({ type: 'START_BETTING' })}
      >
        Start betting
      </button>
    </section>
  )
}

function SetupSummary({ horses }) {
  return (
    <section className="card compact">
      <h2>Entries</h2>
      <ul className="entry-list">
        {horses.map((h) => (
          <li key={h.id}>
            <span className="lane entry-emph">{h.lane}</span>
            <span className="horse-name">{h.name}</span>
            <span className="entry-stars entry-emph">{h.stars}★</span>
            <span className="muted">· {h.balls} balls</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function BetsTicketList({ horses, bets, dispatch, readOnly }) {
  if (bets.length === 0) {
    return <p className="muted">No bets yet.</p>
  }
  return (
    <ul className="bet-list">
      {bets.map((b) => {
        const horse = horses.find((h) => h.id === b.horseId)
        return (
          <li key={b.id} className="bet-row">
            <span>
              <strong>{b.bettorName}</strong> · {fmtMoney(b.amount)} on{' '}
              <em>{horse?.name ?? '?'}</em> (lane {horse?.lane})
            </span>
            {!readOnly && (
              <button
                type="button"
                className="btn small danger ghost"
                onClick={() => dispatch({ type: 'REMOVE_BET', betId: b.id })}
              >
                Remove
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function LockedBettingPanel({ horses, bets, dispatch }) {
  const [showBets, setShowBets] = useState(false)

  return (
    <section className="card locked-panel">
      <h2 className="locked-panel-title">Betting is locked</h2>
      <p className="muted">
        Unlock to add, remove, or change bets. View bets to show the ticket list
        without unlocking.
      </p>
      <div className="locked-actions">
        <button
          type="button"
          className="btn success"
          onClick={() => dispatch({ type: 'UNLOCK' })}
        >
          Unlock betting
        </button>
        <button
          type="button"
          className="btn view-bets"
          onClick={() => setShowBets((v) => !v)}
        >
          {showBets ? 'Hide bets' : 'View bets'}
        </button>
      </div>
      {showBets && (
        <div className="locked-bets-view">
          <h3 className="h3">Tickets</h3>
          <BetsTicketList horses={horses} bets={bets} readOnly />
        </div>
      )}
    </section>
  )
}

function BettingScreen({ horses, bets, carryoverPool, dispatch }) {
  return (
    <section className="card">
      <h2>Betting</h2>
      <PoolTotals carryoverPool={carryoverPool} bets={bets} />
      <BetForm horses={horses} dispatch={dispatch} />
      <h3 className="h3">Tickets</h3>
      <BetsTicketList horses={horses} bets={bets} dispatch={dispatch} readOnly={false} />
      <button
        type="button"
        className="btn danger"
        onClick={() => {
          playLockBettingSound()
          dispatch({ type: 'LOCK' })
        }}
      >
        Lock betting
      </button>
    </section>
  )
}

function BetForm({ horses, dispatch }) {
  function onSubmit(e) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const bettorName = fd.get('bettorName')
    const horseId = fd.get('horseId')
    const amount = fd.get('amount')
    dispatch({ type: 'ADD_BET', bettorName, horseId, amount })
    e.currentTarget.reset()
  }

  return (
    <form className="bet-form" onSubmit={onSubmit}>
      <label className="label">
        Bettor
        <input className="input" name="bettorName" required placeholder="Name" />
      </label>
      <label className="label">
        Horse
        <select className="select" name="horseId" required defaultValue={horses[0]?.id}>
          {horses.map((h) => (
            <option key={h.id} value={h.id}>
              Lane {h.lane} — {h.name} ({h.stars}★)
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Amount ($)
        <input
          className="input"
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          required
          placeholder="0.00"
        />
      </label>
      <button type="submit" className="btn secondary">
        Add bet
      </button>
    </form>
  )
}

function WinnerPick({ horses, winnerId, dispatch }) {
  return (
    <section className="card">
      <h2>Winner</h2>
      <p className="muted">Who won the race?</p>
      <div className="winner-row">
        <select
          className="select wide"
          value={winnerId ?? ''}
          onChange={(e) =>
            dispatch({ type: 'SET_WINNER', horseId: e.target.value })
          }
          aria-label="Winning horse"
        >
          <option value="">Select horse…</option>
          {horses.map((h) => (
            <option key={h.id} value={h.id}>
              Lane {h.lane} — {h.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn primary"
          disabled={!winnerId}
          onClick={() => dispatch({ type: 'TO_RESULTS' })}
        >
          Show payouts
        </button>
      </div>
    </section>
  )
}

function ResultsScreen({
  horses,
  bets,
  winnerId,
  settlementSnapshot: s,
  dispatch,
}) {
  const winner = horses.find((h) => h.id === winnerId)
  const mult =
    s.amountOnWinner > 0 ? s.totalPayoutPool / s.amountOnWinner : null
  const showCashCols = s.hadWinningBets

  return (
    <section className="card results">
      <h2>Payout results</h2>
      <div className="pool-totals pool-totals-results">
        <div className="pool-totals-row">
          <span>Current race bets</span>
          <strong>{fmtMoney(s.racePool)}</strong>
        </div>
        <div className="pool-totals-row">
          <span>Carryover before this race</span>
          <strong>{fmtMoney(s.carryoverBefore)}</strong>
        </div>
        <div className="pool-totals-row pool-totals-total">
          <span>Total payout pool (used for math)</span>
          <strong>{fmtMoney(s.totalPayoutPool)}</strong>
        </div>
      </div>
      <p className="winner-banner">
        Winner: <strong>{winner?.name}</strong> (lane {winner?.lane}, {winner?.stars}
        ★)
      </p>
      {s.hadWinningBets ? (
        <>
          <p className="muted">
            {fmtMoney(s.amountOnWinner)} on winner · payout multiplier{' '}
            {mult != null ? mult.toFixed(4) : '—'} × each winning ticket (exact
            pari-mutuel math).
          </p>
          <p className="cash-mode-summary">
            <strong>Cash payouts:</strong> winning tickets are paid in whole
            dollars only (rounded <strong>down</strong> — no coins). Leftover from
            rounding:{' '}
            <strong>{fmtMoney(s.cashLeftoverToCarryover ?? 0)}</strong> → added
            to <strong>carryover</strong> for the next race.
          </p>
        </>
      ) : (
        <p className="carryover-highlight">
          No bets on the winner —{' '}
          {s.racePool > 0 ? (
            <>
              this race’s bets ({fmtMoney(s.racePool)}) are added to carryover.
            </>
          ) : (
            <>no money was bet this race; carryover is unchanged.</>
          )}{' '}
          <strong>New carryover: {fmtMoney(s.carryoverAfter)}</strong> (saved for
          the next race).
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Bettor</th>
              <th>Horse</th>
              <th>Amount</th>
              <th>Result</th>
              {showCashCols ? (
                <>
                  <th>Exact payout</th>
                  <th className="col-cash-payout">Cash payout</th>
                </>
              ) : (
                <th>Payout</th>
              )}
            </tr>
          </thead>
          <tbody>
            {bets.map((b) => {
              const horse = horses.find((h) => h.id === b.horseId)
              const won = b.horseId === winnerId
              const pay =
                won && s.amountOnWinner > 0
                  ? payoutForBet(
                      b.amount,
                      s.totalPayoutPool,
                      s.amountOnWinner,
                    )
                  : 0
              const cash =
                won && pay > 0 ? payoutCashFloor(pay) : null
              return (
                <tr key={b.id} className={won ? 'row-win' : ''}>
                  <td>{b.bettorName}</td>
                  <td>
                    {horse?.name} (L{horse?.lane})
                  </td>
                  <td>{fmtMoney(b.amount)}</td>
                  <td>{won ? 'Win' : 'Loss'}</td>
                  {showCashCols ? (
                    <>
                      <td>{won ? fmtMoney(pay) : '—'}</td>
                      <td className="col-cash-payout">
                        {won ? `${fmtMoney(cash)} (floor)` : '—'}
                      </td>
                    </>
                  ) : (
                    <td>{won ? fmtMoney(pay) : '—'}</td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn primary"
        onClick={() => dispatch({ type: 'NEXT_RACE' })}
      >
        New race
      </button>
    </section>
  )
}

export default App
