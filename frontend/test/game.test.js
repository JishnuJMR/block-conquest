import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Interface, ZeroAddress } from 'ethers';
import { ABI, LEGACY_ADDRESS, adjacent, canAttack, cooldownRemaining, leaderboard, validateAddress, friendlyError, ownerHue } from '../src/game.js';

const alice = '0x1111111111111111111111111111111111111111';
const bob = '0x2222222222222222222222222222222222222222';
const tile = (owner, power = 1n) => ({ owner, power, lastUpdateBlock: 100n });
test('leaderboard counts current owners, ignores empties, and sorts ties consistently', () => {
  assert.deepEqual(leaderboard([tile(bob), tile(alice), tile(ZeroAddress), tile(bob)]), [{ owner: bob, score: 2 }, { owner: alice, score: 1 }]);
  assert.deepEqual(leaderboard([tile(bob), tile(alice)]).map(row => row.owner), [alice, bob]);
});
test('attack eligibility rejects wrapping, diagonals, friendly, empty, equal and weaker targets', () => {
  const board = Array.from({ length: 64 }, () => tile(ZeroAddress, 0n));
  board[7] = tile(alice, 3n); board[6] = tile(bob, 2n); board[8] = tile(bob, 1n); board[15] = tile(alice, 1n);
  assert.equal(adjacent(7, 8), false); assert.equal(adjacent(0, 9), false);
  assert.equal(canAttack(board, 7, 6, alice), true);
  for (const target of [8, 15, 0]) assert.equal(canAttack(board, 7, target, alice), false);
  board[6].power = 3n; assert.equal(canAttack(board, 7, 6, alice), false);
  board[6].power = 4n; assert.equal(canAttack(board, 7, 6, alice), false);
  assert.equal(canAttack(board, 7, 6, bob), false);
});
test('cooldown counts down to zero without negative numbers', () => {
  assert.equal(cooldownRemaining(tile(alice), 100n, 3n), 3n);
  assert.equal(cooldownRemaining(tile(alice), 102n, 3n), 1n);
  assert.equal(cooldownRemaining(tile(alice), 103n, 3n), 0n);
  assert.equal(cooldownRemaining(tile(alice), 1000n, 3n), 0n);
});
test('configuration rejects malformed/zero addresses and the historical Sepolia board', () => {
  assert.throws(() => validateAddress('bad', 11155111));
  assert.throws(() => validateAddress(ZeroAddress, 31337));
  assert.throws(() => validateAddress(LEGACY_ADDRESS, 11155111), /throwaway/);
  assert.equal(validateAddress(alice, 11155111), alice);
});
test('wallet and contract errors have actionable messages', () => {
  assert.match(friendlyError({ code: 'ACTION_REJECTED' }), /rejected/);
  assert.match(friendlyError({ code: 'INSUFFICIENT_FUNDS' }), /test ETH/);
  const iface = new Interface(ABI);
  assert.match(friendlyError({ data: iface.encodeErrorResult('ReinforcementCooldownActive') }), /cooling down/);
  assert.match(friendlyError({ info: { error: { data: { data: iface.encodeErrorResult('InsufficientPower') } } } }), /greater effective power/);
  assert.match(friendlyError({ code: -32002 }), /already open/);
});
test('owner colours are stable across address casing', () => {
  assert.equal(ownerHue('0xAbCd'), ownerHue('0xabcd'));
});
