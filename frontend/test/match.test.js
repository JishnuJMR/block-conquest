import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZeroAddress, Interface } from 'ethers';
import { matchView } from '../src/match.js';
import { MATCH_ABI, friendlyError } from '../src/game.js';

const a = '0x1111111111111111111111111111111111111111';
const b = '0x2222222222222222222222222222222222222222';
const c = '0x3333333333333333333333333333333333333333';
const match = { playerOne: a, playerTwo: b, phase: 1n, endBlock: 200n };
test('lobby allows a distinct account to join and never permits moves', () => {
  const lobby = { ...match, phase: 0n, playerTwo: ZeroAddress };
  assert.equal(matchView(lobby, [], a, 100n).canJoin, false);
  assert.equal(matchView(lobby, [], b, 100n).canJoin, true);
  assert.equal(matchView(lobby, [], null, 100n).canJoin, false);
  assert.equal(matchView(lobby, [], a, 100n).canPlay, false);
});
test('match counts grid owners including a player with zero tiles and restricts spectators', () => {
  const tiles = [{ owner: b }, { owner: b }, { owner: ZeroAddress }];
  const view = matchView(match, tiles, a, 199n);
  assert.deepEqual(view.scores, [0, 2]);
  assert.equal(view.result, b);
  assert.equal(view.canPlay, true);
  assert.equal(view.blocksLeft, 1n);
  assert.equal(matchView(match, tiles, c, 199n).canPlay, false);
});
test('deadline disables moves and permits anyone connected to finalize; finalized draw is stable', () => {
  const tiles = [{ owner: a }, { owner: b }];
  const ended = matchView({ ...match, phase: 2n }, tiles, c, 200n);
  assert.equal(ended.canPlay, false);
  assert.equal(ended.canFinalize, true);
  assert.equal(ended.blocksLeft, 0n);
  assert.equal(ended.result, ZeroAddress);
  const final = matchView({ ...match, phase: 3n }, tiles, c, 1000n);
  assert.equal(final.canFinalize, false);
  assert.equal(final.canJoin, false);
});
test('match errors explain a changed seat or deadline', () => {
  const iface = new Interface(MATCH_ABI);
  for (const [name, phrase] of [['MatchEnded', /deadline/], ['AlreadyJoined', /already has a seat/], ['MatchFull', /seats/], ['NotPlayer', /registered/], ['AlreadyFinalized', /already been recorded/]]) {
    assert.match(friendlyError({ data: iface.encodeErrorResult(name) }), phrase);
  }
});
