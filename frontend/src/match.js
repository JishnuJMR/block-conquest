import { ZeroAddress } from 'ethers';
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
