import { ZeroAddress, isAddress } from 'ethers';
import { sameAddress, leaderboard } from './game.js';

// Scores come from current grid owners, including a zero for a registered
// player who lost every tile. No event history or separate player list needed.
export function matchView(match, tiles, account, block) {
  const players = [match.playerOne, match.playerTwo];
  const counts = leaderboard(tiles);
  const scores = players.map(owner => counts.find(row => sameAddress(row.owner, owner))?.score ?? 0);
  const joined = players.some(owner => sameAddress(owner, account));
  const waiting = match.phase === 0n;
  const active = match.phase === 1n;
  const ended = match.phase >= 2n;
  const emptySeats = players.filter(owner => sameAddress(owner, ZeroAddress)).length;
  const blocksLeft = active && match.endBlock > block ? match.endBlock - block : 0n;
  const result = scores[0] === scores[1] ? ZeroAddress : players[scores[0] > scores[1] ? 0 : 1];
  return { players, scores, joined, waiting, active, ended, emptySeats, blocksLeft,
    canJoin: waiting && !joined && Boolean(account), canPlay: active && joined,
    canFinalize: match.phase === 2n && Boolean(account), result };
}

// Presentation only: expiry and projected scores cannot establish an outcome.
// phase() and winner are already read in the production block-consistent snapshot.
export function recordedOutcome(match, account) {
  if (match?.phase !== 3n || ![match.playerOne, match.playerTwo, match.winner].every(value => typeof value === 'string' && isAddress(value))) return null;
  const players = [match.playerOne, match.playerTwo];
  if (players.some(owner => sameAddress(owner, ZeroAddress)) || sameAddress(...players)) return null;
  if (sameAddress(match.winner, ZeroAddress)) return { kind: 'draw', winner: ZeroAddress, seat: null };
  const index = players.findIndex(owner => sameAddress(owner, match.winner));
  if (index < 0) return null;
  const kind = sameAddress(account, match.winner) ? 'victory' : players.some(owner => sameAddress(owner, account)) ? 'defeat' : 'spectator';
  return { kind, winner: match.winner, seat: index + 1 };
}
