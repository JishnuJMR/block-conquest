// Standalone visual study. No imports from the application, no provider,
// wallet access, network calls, storage or on-chain interaction.
import { MOCK_RULES, SCENES, names, indexOf, mockScene } from './mock-data.js';
const $ = id => document.getElementById(id);
const coord = index => `${'ABCDEFGH'[index % 8]}${Math.floor(index / 8) + 1}`;
const adjacent = (a, b) => Math.abs(a % 8 - b % 8) + Math.abs(Math.floor(a / 8) - Math.floor(b / 8)) === 1;
const state = { tiles: [], mode: 'match', rules: MOCK_RULES, selected: null, source: null, target: null, blocks: 67, preset: 'midgame', timer: null, confirmed: null, confirmedAction: '', captured: null, captureCut: 'inset(0 0 0 100%)', pending: null, recorded: false };
let confirmationTimer, pendingTimer;
const matchEnded = () => state.mode === 'match' && state.blocks === 0;
const validTarget = index => state.source != null && state.tiles[index]?.owner === 2 && adjacent(state.source, index) && state.tiles[state.source].power > state.tiles[index].power;

function status(message, type = '', action = '') {
  $('move-status').textContent = message;
  $('move-status').className = `move-status ${type}`;
  $('feedback').className = `feedback ${type}`;
  $('feedback').dataset.action = action;
  const titles = { claim: 'Ground secured.', reinforce: 'Power reinforced.', capture: 'Territory captured.', record: 'Result recorded.', failure: 'Action not confirmed.' };
  $('feedback-title').textContent = type === 'pending' ? 'Awaiting mock confirmation.' : type === 'error' ? action === 'failure' ? titles.failure : 'Check this action.' : titles[action] || (/selected/i.test(message) ? 'Territory selected.' : 'The field is open.');
  $('feedback-icon').setAttribute('href', `#${type === 'pending' ? 'pending-icon' : type === 'error' ? 'cross' : action === 'reinforce' ? 'reinforce-icon' : action === 'claim' ? 'claim-icon' : type === 'success' ? 'success-icon' : 'claim-icon'}`);
  $('result-feedback').hidden = !matchEnded() || type !== 'error';
  $('result-feedback').textContent = matchEnded() && type === 'error' ? message : '';
}

const cells = Array.from({ length: 64 }, (_, index) => {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.dataset.index = String(index);
  cell.tabIndex = index === indexOf('E4') ? 0 : -1;
  cell.addEventListener('click', () => select(index));
  cell.addEventListener('keydown', event => {
    const x = index % 8, y = Math.floor(index / 8);
    const next = { ArrowLeft: x ? index - 1 : index, ArrowRight: x < 7 ? index + 1 : index, ArrowUp: y ? index - 8 : index, ArrowDown: y < 7 ? index + 8 : index }[event.key];
    if (next != null) { event.preventDefault(); setTabStop(next); cells[next].focus(); }
  });
  $('board').append(cell);
  return cell;
});
function setTabStop(index) { cells.forEach((cell, i) => { cell.tabIndex = i === index ? 0 : -1; }); }

function reset(preset = state.preset) {
  clearInterval(state.timer); clearTimeout(confirmationTimer); clearTimeout(pendingTimer);
  Object.assign(state, mockScene(preset), { timer: null, confirmed: null, confirmedAction: '', captured: null, pending: null, preset });
  $('fail-next').checked = false;
  if (preset === 'failure') status('Mock transaction failed. Territory, power and scores are unchanged. You can retry. No transaction sent.', 'error', 'failure');
  else status(matchEnded() ? 'Mock result recorded. The final board remains available to inspect.' : state.mode === 'open' ? 'Mock open board · Any wallet may participate; no deadline.' : 'Mock board · Both players may act; no turn order.');
  setTabStop(state.selected ?? 0);
  render();
}

function select(index) {
  if (state.pending) return;
  if (state.source != null && state.tiles[index].owner === 2) {
    if (!validTarget(index)) {
      status(!adjacent(state.source, index) ? 'Choose an enemy directly above, below, left or right of your source.' : 'Your source needs more power than that enemy. Equal power cannot capture.', 'error');
      return;
    }
    state.target = index; state.selected = index;
  } else {
    state.source = null; state.target = null; state.selected = index;
  }
  setTabStop(index);
  status(`${coord(index)} selected. ${state.tiles[index].owner ? `${names[state.tiles[index].owner]} territory, power ${state.tiles[index].power}.` : 'Unclaimed territory.'}`);
  render();
}

function emblem(owner, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('crest');
  if (className) svg.classList.add(className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', `#crest-${owner === 1 ? 'one' : 'two'}`); svg.append(use);
  return svg;
}

function render() {
  const scores = [0, 0, 0];
  for (const tile of state.tiles) if (tile.owner) scores[tile.owner]++;
  $('score-one').textContent = scores[1]; $('score-two').textContent = scores[2];
  $('claimed-count').textContent = scores[1] + scores[2];
  $('unclaimed-count').textContent = 64 - scores[1] - scores[2];
  $('blocks-left').textContent = state.mode === 'open' ? '—' : state.blocks;
  $('clock-label').textContent = state.mode === 'open' ? 'OPEN BOARD' : 'MOCK / 001';
  $('clock-unit').innerHTML = state.mode === 'open' ? 'NO<br>DEADLINE' : 'BLOCKS<br>LEFT';
  $('clock-track').hidden = state.mode === 'open';
  $('player-label-one').textContent = state.mode === 'open' ? 'OWNER 01' : 'PLAYER 01';
  $('player-label-two').textContent = state.mode === 'open' ? 'OWNER 02' : 'PLAYER 02';
  $('scoreboard').setAttribute('aria-label', state.mode === 'open' ? 'Mock current territory owners' : 'Mock two-player match scoreboard');
  $('clock-fill').style.width = `${state.blocks / state.rules.duration * 100}%`;
  $('clock-toggle').textContent = state.timer ? 'Pause mock clock' : state.mode === 'open' ? 'Run mock blocks' : 'Run mock clock';
  $('clock-toggle').disabled = matchEnded();
  $('board-phase').textContent = state.mode === 'open' ? 'OPEN FIELD / NO DEADLINE' : matchEnded() ? 'MOCK MATCH COMPLETE' : 'CONTEST IN PROGRESS';
  $('scene').value = state.preset;
  $('board-title').textContent = matchEnded() ? 'The final field.' : 'Make your ground.';
  $('rules-summary').textContent = `Cap ${state.rules.cap} · Cooldown ${state.rules.cooldown} blocks`;
  $('rules-description').textContent = `Any empty territory can be claimed. Reinforcement adds 1 power, up to ${state.rules.cap}. A tile waits ${state.rules.cooldown} blocks after a claim, reinforcement or attack before reinforcement. Attack a directly adjacent enemy with strictly less effective power. Lose 1 power every ${state.rules.decay} blocks, down to 1; ownership stays. ${state.mode === 'open' ? 'Open board: no seats or deadline.' : `Both registered players may act. Match duration is ${state.rules.duration} blocks from the second join.`}`;
  $('guide-objective').textContent = state.mode === 'open' ? 'Hold more territory. Every owned tile adds one point. This earlier open-board mode has no seats, match deadline or recorded winner.' : 'Hold more territory when the block countdown ends. Equal scores mean a draw. Both registered players may act during the match; there is no turn order.';
  $('board').setAttribute('aria-busy', String(Boolean(state.pending)));
  $('action-dock').dataset.pending = String(Boolean(state.pending));
  document.body.classList.toggle('has-selection', state.selected != null);
  document.body.classList.toggle('match-ended', matchEnded());
  document.body.classList.toggle('mode-open', state.mode === 'open');
  cells.forEach((cell, index) => {
    const tile = state.tiles[index];
    const target = validTarget(index) && !matchEnded();
    const pending = state.pending?.indices.includes(index);
    cell.className = `tile ${tile.owner ? `owned p${tile.owner}` : 'empty'}${state.selected === index ? ' selected' : ''}${state.source === index ? ' source' : ''}${target ? ' attackable' : ''}${state.target === index ? ' target' : ''}${state.confirmed === index ? ` confirmed confirmed-${state.confirmedAction}` : ''}${state.captured === index ? ' captured' : ''}${pending ? ' pending' : ''}`;
    cell.style.setProperty('--capture-cut', state.captureCut);
    cell.disabled = Boolean(state.pending);
    cell.setAttribute('aria-pressed', String(state.selected === index));
    cell.setAttribute('aria-label', `${coord(index)}: ${tile.owner ? `${names[tile.owner]}${tile.owner === 1 ? ', your territory' : ', enemy territory'}, power ${tile.power}` : 'unclaimed'}${target ? ', attackable' : ''}${state.source === index ? ', attack source' : ''}${pending ? ', mock confirmation pending' : ''}`);
    cell.title = `${coord(index)} · ${tile.owner ? `${names[tile.owner]} · Power ${tile.power}` : 'Unclaimed'}`;
    cell.replaceChildren();
    const power = document.createElement('span'); power.className = tile.owner ? 'power' : 'empty-coordinate';
    power.textContent = tile.owner ? tile.power : coord(index); cell.append(power);
    if (tile.owner) { const owner = document.createElement('span'); owner.className = 'owner'; owner.textContent = tile.owner === 1 ? 'You' : 'P2'; owner.setAttribute('aria-hidden', 'true'); cell.append(owner); }
    if (tile.owner) cell.append(emblem(tile.owner, 'tile-crest'));
    if (state.confirmed === index && state.confirmedAction === 'reinforce') { const delta = document.createElement('span'); delta.className = 'power-delta'; delta.textContent = '+1'; delta.setAttribute('aria-hidden', 'true'); cell.append(delta); }
    if (pending) { const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.classList.add('pending-mark'); icon.setAttribute('aria-hidden', 'true'); const use = document.createElementNS(icon.namespaceURI, 'use'); use.setAttribute('href', '#pending-icon'); icon.append(use); cell.append(icon); }
    if (state.captured === index) { const flash = document.createElement('span'); flash.className = 'capture-flash'; flash.setAttribute('aria-hidden', 'true'); cell.append(flash); }
  });
  renderResult(scores);
  renderInspector();
  $('leaderboard').replaceChildren();
  [1, 2].sort((a, b) => scores[b] - scores[a] || a - b).forEach((owner, rank) => {
    const item = document.createElement('li'); item.className = owner === 1 ? 'cobalt' : 'ember';
    const number = document.createElement('span'); number.className = 'rank'; number.textContent = `0${rank + 1}`;
    const name = document.createElement('span'); name.className = 'leader-name'; name.textContent = names[owner];
    const label = document.createElement('small'); label.textContent = owner === 1 ? 'You · P1' : 'P2'; name.append(label);
    const score = document.createElement('span'); score.className = 'leader-score'; score.textContent = scores[owner];
    const unit = document.createElement('small'); unit.textContent = scores[owner] === 1 ? 'tile' : 'tiles'; score.append(unit);
    item.append(number, emblem(owner), name, score); $('leaderboard').append(item);
  });
  document.querySelector('.cobalt-share').style.width = `${scores[1] / 64 * 100}%`;
  document.querySelector('.ember-share').style.width = `${scores[2] / 64 * 100}%`;
}

function renderResult(scores) {
  const ended = matchEnded();
  $('scoreboard').hidden = ended;
  $('match-result').hidden = !ended;
  if (!ended) return;
  const winner = scores[1] === scores[2] ? 0 : scores[1] > scores[2] ? 1 : 2;
  $('match-result').dataset.outcome = winner ? String(winner) : 'draw';
  $('result-crest').querySelector('use').setAttribute('href', `#crest-${winner === 2 ? 'two' : 'one'}`);
  $('draw-crest').toggleAttribute('hidden', winner !== 0);
  $('result-kicker').textContent = winner ? `VICTORY / PLAYER 0${winner}${winner === 1 ? ' · YOU' : ''}` : 'DRAW / EQUAL TERRITORY';
  $('result-title').textContent = winner ? `${names[winner]} holds the field.` : 'An even field.';
  $('result-detail').textContent = winner ? 'More territory at the deadline. The final board is yours to inspect.' : 'The same ground held. Neither faction takes the match.';
  $('result-recorded').textContent = state.pending?.kind === 'record' ? 'MOCK RESULT PENDING · NO TRANSACTION' : state.recorded ? 'MOCK RESULT RECORDED' : 'SCORES LOCKED · RESULT NOT RECORDED';
  $('result-recorded').dataset.recorded = String(state.recorded);
  $('record-result').hidden = state.recorded;
  $('record-result').disabled = Boolean(state.pending);
  $('final-score-one').textContent = scores[1]; $('final-score-two').textContent = scores[2];
  $('result-territory').textContent = `${scores[1] + scores[2]} / 64 territories claimed · ${64 - scores[1] - scores[2]} unclaimed · Power frozen at deadline`;
}

function renderInspector() {
  const preview = state.source != null && state.target != null && validTarget(state.target) && !matchEnded();
  const index = state.source ?? state.selected;
  const tile = index != null ? state.tiles[index] : null;
  const attacking = state.source != null;
  $('attack-preview').hidden = !preview;
  $('attack-arrow').toggleAttribute('hidden', !preview);
  $('tile-information').hidden = !tile;
  $('secondary-action').hidden = true;
  $('primary-action').disabled = !tile || matchEnded();
  $('action-dock').hidden = matchEnded();
  $('selected-coordinate').textContent = preview ? `${coord(state.source)} → ${coord(state.target)}` : tile ? coord(index) : '—';
  const primary = $('primary-action');
  function button(label, icon = 'arrow') { primary.replaceChildren(document.createTextNode(label)); const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('aria-hidden', 'true'); const use = document.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', `#${icon}`); svg.append(use); primary.append(svg); }
  if (tile) {
    $('tile-owner').textContent = tile.owner ? `${names[tile.owner]}${tile.owner === 1 ? ' · You' : ' · Player 2'}` : 'Unclaimed territory';
    $('tile-crest').toggleAttribute('hidden', !tile.owner);
    $('tile-crest').querySelector('use').setAttribute('href', `#crest-${tile.owner === 1 ? 'one' : 'two'}`);
    $('tile-crest').style.color = tile.owner === 1 ? 'var(--cobalt)' : 'var(--terracotta)';
    $('tile-power').replaceChildren(document.createTextNode(tile.power + ' ')); const unit = document.createElement('span'); unit.textContent = `/ ${state.rules.cap} POWER`; $('tile-power').append(unit);
    $('tile-cooldown').textContent = matchEnded() ? 'Match ended' : tile.owner ? tile.cooldown ? `${tile.cooldown} mock blocks` : 'Ready' : 'Starts after claim';
    $('tile-decay').textContent = matchEnded() ? 'Frozen at deadline' : !tile.owner ? 'No power yet' : tile.power === 1 ? 'At minimum power' : `${tile.decay} mock blocks`;
  }
  if (matchEnded()) {
    $('inspector-title').textContent = 'Final territory.';
    $('inspector-description').textContent = 'Scores, ownership and power are frozen. Select a territory to inspect the final field.';
    button('Mock match complete');
  } else if (attacking) {
    $('inspector-title').textContent = preview ? 'Take their ground.' : 'Choose your target.';
    $('inspector-description').textContent = preview ? 'A stronger territory can capture its neighbour. Review the power cost before capturing.' : 'Select a brass-marked enemy directly beside your source. Your power must be greater.';
    button(preview ? `Preview capture ${coord(state.target)}` : 'Select a marked enemy');
    primary.disabled = !preview;
    $('secondary-action').hidden = false; $('secondary-action').textContent = 'Cancel attack';
  } else if (!tile) {
    $('inspector-title').textContent = 'Explore the field.';
    $('inspector-description').textContent = 'Select a territory to inspect its owner, power and available moves.';
    button('Select a territory');
  } else if (!tile.owner) {
    $('inspector-title').textContent = 'A place to begin.';
    $('inspector-description').textContent = `Claim ${coord(index)} with 1 power. Any empty territory can become yours; it does not need to touch your other tiles.`;
    button(`Preview claim ${coord(index)}`, 'plus');
  } else if (tile.owner === 1) {
    $('inspector-title').textContent = 'Hold your ground.';
    $('inspector-description').textContent = 'Build this territory’s power, or use it to capture a weaker neighbour.';
    button(tile.cooldown ? `Ready in ${tile.cooldown} mock blocks` : tile.power >= state.rules.cap ? 'At power cap' : 'Preview reinforcement', 'reinforce-icon');
    primary.disabled = tile.cooldown > 0 || tile.power >= state.rules.cap;
    $('secondary-action').hidden = false;
    const targets = state.tiles.some((target, i) => target.owner === 2 && adjacent(index, i) && tile.power > target.power);
    $('secondary-action').textContent = targets ? 'Choose attack target' : 'No weaker adjacent enemies';
    $('secondary-action').disabled = !targets;
    if (!targets) {
      $('secondary-action').hidden = true;
      $('inspector-description').textContent = 'Build this territory’s power. No weaker adjacent enemy can be captured right now.';
    }
  } else {
    $('inspector-title').textContent = 'Their territory. For now.';
    $('inspector-description').textContent = 'Choose one of your neighbouring territories, then select an attack target. You need strictly greater power.';
    button('Select your source first'); primary.disabled = true;
  }
  if (attacking) $('secondary-action').disabled = false;
  if (preview) {
    const source = state.tiles[state.source], target = state.tiles[state.target];
    $('preview-route').textContent = `${coord(state.source)} → ${coord(state.target)}`;
    $('source-power').textContent = source.power; $('target-power').textContent = target.power; $('remaining-power').textContent = source.power - target.power;
    $('capture-result').replaceChildren(document.createTextNode(`${coord(state.target)} becomes yours with `)); const strong = document.createElement('strong'); strong.textContent = '1 power.'; $('capture-result').append(strong);
    const dx = state.target % 8 - state.source % 8, dy = Math.floor(state.target / 8) - Math.floor(state.source / 8);
    const positions = { x1: state.source % 8 * 100 + 50 + dx * 25, y1: Math.floor(state.source / 8) * 100 + 50 + dy * 25, x2: state.target % 8 * 100 + 50 - dx * 25, y2: Math.floor(state.target / 8) * 100 + 50 - dy * 25 };
    for (const [key, value] of Object.entries(positions)) for (const id of ['attack-path', 'attack-underlay']) $(id).setAttribute(key, value);
  }
  $('mobile-context').textContent = preview ? `${coord(state.source)} → ${coord(state.target)} · Estimate: ${state.tiles[state.source].power} − ${state.tiles[state.target].power} = ${state.tiles[state.source].power - state.tiles[state.target].power} left` : tile ? `${coord(index)} · ${tile.owner ? `${tile.owner === 1 ? 'You' : 'P2'} · power ${tile.power}` : 'Unclaimed · starts at power 1'}` : '';
  $('board-hint').textContent = matchEnded() ? 'Mock match complete. Select any territory to inspect it.' : attacking ? `Attacking from ${coord(state.source)}. Brass-marked enemies can be captured.` : state.mode === 'open' ? 'Open board · Claim any empty territory. No match deadline.' : 'Select a territory. Build your power. Capture a weaker neighbour.';
  if (state.pending) { button('Mock confirmation pending', 'pending-icon'); primary.disabled = true; $('secondary-action').disabled = true; }
}

function confirm(index, message, captured = false, action = 'claim') {
  clearTimeout(confirmationTimer); state.confirmed = index;
  state.confirmedAction = captured ? 'capture' : action;
  state.captured = captured ? index : null;
  status(message, 'success', state.confirmedAction); render();
  confirmationTimer = setTimeout(() => { state.confirmed = null; state.confirmedAction = ''; state.captured = null; render(); }, 900);
}
function simulatePending(kind, indices, apply) {
  if (state.pending) return;
  const pending = { kind, indices, fail: $('fail-next').checked };
  $('fail-next').checked = false;
  state.pending = pending;
  status('Ownership and power stay unchanged until confirmation. Local simulation; no transaction is sent.', 'pending', kind);
  render();
  pendingTimer = setTimeout(() => {
    if (state.pending !== pending) return;
    state.pending = null;
    if (kind !== 'record' && matchEnded()) { status('The mock deadline passed before confirmation. No territory changed.', 'error', 'failure'); render(); return; }
    if (pending.fail) { status('Mock transaction failed. Territory, power and scores are unchanged. You can retry. No transaction sent.', 'error', 'failure'); render(); return; }
    apply();
  }, 900);
}
$('primary-action').addEventListener('click', () => {
  if (matchEnded() || state.selected == null || state.pending) return;
  if (state.source != null) {
    if (!validTarget(state.target)) return;
    const from = state.source, target = state.target;
    simulatePending('capture', [from, target], () => {
      if (!validTarget(target)) { status('The mock power changed before confirmation. Choose another target.', 'error'); render(); return; }
      state.tiles[from].power -= state.tiles[target].power;
      state.captureCut = target % 8 > from % 8 ? 'inset(0 0 0 100%)' : target % 8 < from % 8 ? 'inset(0 100% 0 0)' : target > from ? 'inset(100% 0 0 0)' : 'inset(0 0 100% 0)';
      state.tiles[from].cooldown = state.rules.cooldown; state.tiles[from].decay = state.tiles[from].power > 1 ? state.rules.decay : null;
      state.tiles[target] = { owner: 1, power: 1, cooldown: state.rules.cooldown, decay: null };
      state.source = null; state.target = null; state.selected = target;
      confirm(target, `Mock capture confirmed: ${coord(from)} keeps ${state.tiles[from].power} power; ${coord(target)} is yours at power 1. No transaction sent.`, true);
    });
  } else {
    const tile = state.tiles[state.selected];
    if (!tile.owner) {
      const index = state.selected;
      simulatePending('claim', [index], () => {
        Object.assign(tile, { owner: 1, power: 1, cooldown: state.rules.cooldown, decay: null });
        confirm(index, `Mock claim confirmed: ${coord(index)} is yours with 1 power. No transaction sent.`);
      });
    } else if (tile.owner === 1 && !tile.cooldown && tile.power < state.rules.cap) {
      const index = state.selected;
      simulatePending('reinforce', [index], () => {
        tile.power++; tile.cooldown = state.rules.cooldown; tile.decay = state.rules.decay;
        confirm(index, `Mock reinforcement confirmed: ${coord(index)} now has ${tile.power} power. No transaction sent.`, false, 'reinforce');
      });
    }
  }
});
$('secondary-action').addEventListener('click', () => {
  if (matchEnded() || state.pending) return;
  if (state.source != null) {
    state.selected = state.source; state.source = null; state.target = null;
    status('Attack cancelled. Your source territory remains selected.');
  } else if (state.tiles[state.selected]?.owner === 1) {
    state.source = state.selected; state.target = null;
    status('Choose a brass-marked enemy. Arrow keys move focus; Enter selects; Escape cancels.');
  }
  render(); setTabStop(state.selected); cells[state.selected].focus({ preventScroll: true });
});
function tick() {
  if (matchEnded()) return;
  if (state.mode === 'match') state.blocks--;
  for (const tile of state.tiles) {
    if (tile.cooldown > 0) tile.cooldown--;
    if (tile.power > 1 && tile.decay != null) { tile.decay--; if (!tile.decay) { tile.power--; tile.decay = tile.power > 1 ? state.rules.decay : null; } }
  }
  if (state.target != null && !validTarget(state.target)) { state.target = null; status('The mock power changed. Review your source and choose an eligible enemy.'); }
  if (matchEnded()) { clearInterval(state.timer); state.timer = null; state.source = null; state.target = null; status('Mock deadline reached. Territory and power are frozen. The result is ready to record.'); }
  render();
}
$('clock-toggle').addEventListener('click', () => {
  if (matchEnded()) { status('Reset the study to start another mock countdown.'); return; }
  if (state.timer) { clearInterval(state.timer); state.timer = null; status('Mock clock paused.'); }
  else { state.timer = setInterval(tick, 1500); status('Mock clock running: one simulated block every 1.5 seconds.'); }
  render();
});
$('scene').addEventListener('change', () => { reset($('scene').value); window.scrollTo(0, 0); });
$('record-result').addEventListener('click', () => {
  if (!matchEnded() || state.recorded || state.pending) return;
  simulatePending('record', [], () => { state.recorded = true; status('Mock result recorded. No transaction sent.', 'success', 'record'); render(); });
});
$('reset').addEventListener('click', () => { reset(); window.scrollTo(0, 0); });
$('guide-open').addEventListener('click', () => $('field-guide').showModal());
$('guide-close').addEventListener('click', () => $('field-guide').close());
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || $('field-guide').open || state.pending) return;
  if (state.source != null) $('secondary-action').click();
  else { const previous = state.selected; state.selected = null; render(); if (previous != null) cells[previous].focus(); status('Selection cleared. Choose any territory.'); }
});
// Move the same controls; never render a second primary action on mobile.
const mobileLayout = window.matchMedia('(max-width: 760px)');
function placeDock() {
  const focusedControl = $('action-dock').contains(document.activeElement) ? document.activeElement : null;
  if (mobileLayout.matches) document.querySelector('.sidebar').before($('action-dock'));
  else $('desktop-dock-slot').append($('action-dock'));
  focusedControl?.focus({ preventScroll: true });
}
mobileLayout.addEventListener('change', placeDock);
placeDock();
window.addEventListener('beforeunload', () => { clearInterval(state.timer); clearTimeout(confirmationTimer); clearTimeout(pendingTimer); });
const initialScene = new URLSearchParams(window.location.search).get('scene');
reset(SCENES.includes(initialScene) ? initialScene : 'midgame');
