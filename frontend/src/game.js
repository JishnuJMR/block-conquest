import { Interface, getAddress, isAddress, ZeroAddress } from 'ethers';
import artifact from './generated/BlockConquest.json' with { type: 'json' };

export const ABI = artifact.abi;
const iface = new Interface(ABI);
export const LEGACY_ADDRESS = '0x5a6db2fa7424f519a10805c48ef33f4ea141a9c9';
export const NETWORKS = {
  11155111: { name: 'Sepolia', hex: '0xaa36a7', explorer: 'https://sepolia.etherscan.io' },
  31337: { name: 'Local Hardhat', hex: '0x7a69', explorer: null },
};
export const sameAddress = (a, b) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
export const isEmpty = tile => !tile || sameAddress(tile.owner, ZeroAddress);
export const shortAddress = address => address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '—';
export const coordinate = index => `${'ABCDEFGH'[index % 8]}${Math.floor(index / 8) + 1}`;
export const adjacent = (a, b) => Math.abs(a % 8 - b % 8) + Math.abs(Math.floor(a / 8) - Math.floor(b / 8)) === 1;

export function validateAddress(value, chainId) {
  if (!isAddress(value) || sameAddress(value, ZeroAddress)) throw new Error('Enter a valid, non-zero contract address.');
  if (Number(chainId) === 11155111 && value.toLowerCase() === LEGACY_ADDRESS) {
    throw new Error('This is your earlier throwaway contract. Use a new deployment with decay and cooldown, or choose Local Hardhat for testing.');
  }
  return getAddress(value);
}

export function leaderboard(tiles) {
  const counts = new Map();
  for (const tile of tiles) {
    if (isEmpty(tile)) continue;
    const owner = getAddress(tile.owner);
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return [...counts].map(([owner, score]) => ({ owner, score }))
    .sort((a, b) => b.score - a.score || a.owner.toLowerCase().localeCompare(b.owner.toLowerCase()));
}

// Labels belong to this board in this browser, not to leaderboard rank. Keep
// departed owners in the registry so a returning player retains their label.
export function ownerIdentities(tiles, known = []) {
  const addresses = [...new Set(known.filter(isAddress).map(owner => owner.toLowerCase()))];
  const newcomers = leaderboard(tiles).map(row => row.owner.toLowerCase()).sort();
  for (const owner of newcomers) if (!addresses.includes(owner)) addresses.push(owner);
  const palette = [205, 280, 35, 155, 345, 65, 235, 180, 15, 305];
  return new Map(addresses.map((owner, index) => [owner, {
    label: `P${index + 1}`, hue: palette[index % palette.length],
  }]));
}

// getGrid already supplies effective power. Count to the next boundary from
// the stored update block; do not apply decay to that effective power again.
export function decayRemaining(tile, block, interval) {
  if (isEmpty(tile) || BigInt(tile.power) <= 1n) return null;
  const elapsed = BigInt(block) - BigInt(tile.lastUpdateBlock);
  return BigInt(interval) - (elapsed > 0n ? elapsed : 0n) % BigInt(interval);
}

export function cooldownRemaining(tile, block, cooldown) {
  const left = BigInt(tile.lastUpdateBlock) + BigInt(cooldown) - BigInt(block);
  return left > 0n ? left : 0n;
}

export function canAttack(tiles, source, target, account) {
  if (source == null || target == null || !tiles[source] || !tiles[target]) return false;
  return sameAddress(tiles[source].owner, account) && !isEmpty(tiles[target]) &&
    !sameAddress(tiles[target].owner, account) && adjacent(source, target) &&
    BigInt(tiles[source].power) > BigInt(tiles[target].power);
}

const errors = {
  InvalidCoordinates: 'That tile is outside the board.',
  TileOccupied: 'Someone already owns that tile. Refresh and choose an empty tile.',
  NotTileOwner: 'You no longer own this tile. Refresh the board.',
  PowerCapReached: 'This tile is already at the power cap.',
  ReinforcementCooldownActive: 'This tile is still cooling down. Wait for more blocks.',
  NotEnemyTile: 'Choose a tile owned by another player.',
  NotAdjacent: 'Choose a directly adjacent tile: above, below, left, or right.',
  InsufficientPower: 'Your tile needs strictly greater effective power. Power may have decayed before the transaction was mined.',
};

export function friendlyError(error) {
  const codes = [error?.code, error?.error?.code, error?.info?.error?.code];
  if (codes.includes(4001) || codes.includes('ACTION_REJECTED')) return 'You rejected the wallet request. No new move was submitted by this request.';
  if (codes.includes(-32002)) return 'A wallet request is already open. Finish it in MetaMask first.';
  if (codes.includes('INSUFFICIENT_FUNDS')) return 'Your wallet needs more test ETH to pay the transaction fee.';
  if (codes.includes(4902)) return 'Add or enable the selected network in MetaMask, then try again.';
  const data = [error?.data, error?.error?.data, error?.info?.error?.data, error?.info?.error?.data?.data];
  for (const value of data) {
    if (typeof value !== 'string' || !value.startsWith('0x')) continue;
    try { const decoded = iface.parseError(value); if (errors[decoded?.name]) return errors[decoded.name]; } catch { /* Not a contract error. */ }
  }
  if (errors[error?.revert?.name]) return errors[error.revert.name];
  if (codes.includes('CALL_EXCEPTION')) return 'The contract rejected this move. Refresh the board: ownership or effective power may have changed.';
  return error?.shortMessage || error?.message || 'The request failed. Check MetaMask and try again.';
}
