/**
 * Notes and house rules shown in the header modal.
 * Edit this file or ask your assistant to update the copy.
 */
export function NotesRulesContent() {
  return (
    <div className="notes-rules-content">
      <ul className="notes-rules-list">
        <li>It’s a pool betting game</li>
        <li>Everyone’s bets go into one shared pot</li>
        <li>
          It’s pari-mutuel, which means the payout is based on how much money is
          in the pot and how much was bet on the winning horse
        </li>
        <li>It is not fixed odds</li>
        <li>
          Payout per $1 = total payout pool ÷ amount bet on that horse
        </li>
        <li>Less money bet on a winning horse = bigger payout</li>
        <li>More money bet on a winning horse = smaller payout</li>
        <li>The horse’s stars/balls affect chance to win</li>
        <li>The betting pool affects payout</li>
        <li>
          If nobody bet the winning horse, the pot rolls over to the next race
        </li>
        <li>The next race’s payout pool = new bets + rollover</li>
      </ul>
    </div>
  )
}
