import { ballsForStars } from './pariMutuel.js'

export const SAMPLE_HORSES = [
  { id: 'h1', lane: 1, name: 'Sir Neighs-a-Lot', stars: 6, balls: ballsForStars(6) },
  { id: 'h2', lane: 2, name: 'Usain Colt', stars: 5, balls: ballsForStars(5) },
  { id: 'h3', lane: 3, name: 'Mayo Neighs', stars: 4, balls: ballsForStars(4) },
  { id: 'h4', lane: 4, name: 'Hoof Hearted', stars: 3, balls: ballsForStars(3) },
  { id: 'h5', lane: 5, name: 'Barnacle Bill', stars: 2, balls: ballsForStars(2) },
  { id: 'h6', lane: 6, name: 'Glueten Free', stars: 1, balls: ballsForStars(1) },
]

const BETTOR_NAMES = [
  'Alice',
  'Bob',
  'Carlos',
  'Dana',
  'Eddie',
  'Fatima',
  'Gus',
  'Hannah',
  'Ivan',
  'Jules',
  'Kira',
  'Luis',
  'Mara',
  'Nina',
  'Omar',
  'Priya',
  'Quinn',
  'Rosa',
]

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function newBetId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Random whole-dollar amount from $2 to $10 inclusive */
function randomAmount() {
  return 2 + Math.floor(Math.random() * 9)
}

/**
 * Twice the original 6 sample bets, random horses and amounts each time.
 * Bettor names are chosen at random from a larger pool.
 */
export function generateSampleBets(horseIds, betCount = 12) {
  const ids = horseIds.length ? horseIds : SAMPLE_HORSES.map((h) => h.id)
  const bets = []
  for (let i = 0; i < betCount; i++) {
    bets.push({
      id: newBetId(),
      bettorName: pick(BETTOR_NAMES),
      horseId: pick(ids),
      amount: randomAmount(),
    })
  }
  return bets
}
