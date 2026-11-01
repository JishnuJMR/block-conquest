// Design fixtures only. These are not fetched, persisted or shared with the app.
export const MOCK_RULES = Object.freeze({ cap: 5, cooldown: 3, decay: 10, duration: 100 });
export const names = Object.freeze({ 1: 'Cobalt', 2: 'Ember' });
export const SCENES = Object.freeze(['midgame', 'opening', 'claim', 'reinforce', 'failure', 'victory', 'draw', 'open']);
export const indexOf = coordinate => 'ABCDEFGH'.indexOf(coordinate[0]) + (Number(coordinate[1]) - 1) * 8;
const midgame = {
  1: [['A1', 1], ['B1', 2], ['A2', 1], ['B2', 3], ['C2', 2], ['B3', 2], ['C3', 5], ['D3', 3], ['A4', 1], ['B4', 2], ['C4', 3], ['D4', 4], ['B5', 1], ['C5', 2]],
  2: [['F3', 1], ['G3', 2], ['E4', 2], ['F4', 4], ['G4', 3], ['D5', 1], ['E5', 3], ['F5', 2], ['E6', 1], ['F6', 2], ['H8', 1]],
};
export function mockScene(preset) {
  const tiles = Array.from({ length: 64 }, () => ({ owner: 0, power: 0, cooldown: 0, decay: null }));
  const data = preset === 'opening' ? { 1: [['A1', 1], ['B1', 2]], 2: [['H8', 1]] } : midgame;
  for (const [owner, entries] of Object.entries(data)) for (const [coordinate, power] of entries) {
    tiles[indexOf(coordinate)] = { owner: Number(owner), power, cooldown: 0, decay: power > 1 ? 7 : null };
  }
  if (preset === 'draw') for (const coordinate of ['F2', 'G2', 'H7']) {
    tiles[indexOf(coordinate)] = { owner: 2, power: 1, cooldown: 0, decay: null };
  }
  if (preset === 'reinforce') tiles[indexOf('C3')].power = 3;
  const ended = preset === 'victory' || preset === 'draw';
  const targeting = preset === 'midgame' || preset === 'failure';
  return { tiles, mode: preset === 'open' ? 'open' : 'match', rules: { ...MOCK_RULES },
    blocks: ended ? 0 : preset === 'opening' ? 94 : 67,
    selected: ended ? null : preset === 'opening' ? indexOf('B1') : preset === 'claim' ? indexOf('C6') : preset === 'reinforce' ? indexOf('C3') : preset === 'open' ? indexOf('D4') : indexOf('E4'),
    source: targeting ? indexOf('D4') : null, target: targeting ? indexOf('E4') : null,
    recorded: ended };
}
