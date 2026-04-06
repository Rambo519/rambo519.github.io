/** Star rating → number of balls in the hat */
export const STAR_TO_BALLS = {
  6: 11,
  5: 10,
  4: 9,
  3: 8,
  2: 7,
  1: 6,
}

export function ballsForStars(stars) {
  return STAR_TO_BALLS[stars] ?? 0
}

export function totalPool(bets) {
  return bets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
}

/** Full pool used for payouts = carryover from prior races + this race’s bets */
export function totalPayoutPool(carryover, bets) {
  const c = Math.max(0, Number(carryover) || 0)
  return c + totalPool(bets)
}

export function poolOnHorse(bets, horseId) {
  return bets
    .filter((b) => b.horseId === horseId)
    .reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
}

/** Payout per $1 bet = totalPool / amount on that horse */
export function payoutPerDollar(total, amountOnHorse) {
  if (amountOnHorse <= 0) return null
  return total / amountOnHorse
}

/** Projected odds = payout per $1 − 1 */
export function projectedOdds(payoutPer1) {
  if (payoutPer1 == null) return null
  return payoutPer1 - 1
}

/** Winner payout for one bet */
export function payoutForBet(betAmount, totalPoolAmount, amountOnWinner) {
  if (amountOnWinner <= 0) return null
  return betAmount * (totalPoolAmount / amountOnWinner)
}

/** Cash paid: whole dollars only, always rounded down (never up). */
export function payoutCashFloor(exactDollars) {
  return Math.floor(Number(exactDollars) + 1e-9)
}

/**
 * Sum of (exact payout − floor to $) for each winning ticket, in dollars.
 * Used as carryover after cash payout mode settles.
 */
export function totalCashRounddownLeftover(
  bets,
  winnerHorseId,
  totalPoolAmount,
  amountOnWinner,
) {
  if (amountOnWinner <= 0) return 0
  let leftoverCents = 0
  for (const b of bets) {
    if (b.horseId !== winnerHorseId) continue
    const exact = payoutForBet(b.amount, totalPoolAmount, amountOnWinner)
    if (exact == null) continue
    const exactCents = Math.round(exact * 100)
    const cashCents = payoutCashFloor(exact) * 100
    leftoverCents += exactCents - cashCents
  }
  return leftoverCents / 100
}

export function boardRows(horses, bets, carryover = 0) {
  const payoutPool = totalPayoutPool(carryover, bets)
  return horses.map((h) => {
    const onHorse = poolOnHorse(bets, h.id)
    const per1 = payoutPerDollar(payoutPool, onHorse)
    return {
      horse: h,
      amountOnHorse: onHorse,
      payoutPerDollar: per1,
      odds: projectedOdds(per1),
    }
  })
}
