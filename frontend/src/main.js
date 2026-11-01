import { BrowserProvider, Contract, getAddress, ZeroAddress } from 'ethers';
import { matchView, recordedOutcome } from './match.js';
import { ABI, NETWORKS, sameAddress, isEmpty, shortAddress, coordinate, adjacent, validateAddress, leaderboard, ownerIdentities, decayRemaining, cooldownRemaining, canAttack, friendlyError } from './game.js';
import './style.css';
import { MATCH_ABI } from './game.js';

const $ = id => document.getElementById(id);
const defaults = {
  mode: import.meta.env.VITE_BOARD_MODE === 'open' ? 'open' : 'match',
  chain: NETWORKS[import.meta.env.VITE_CHAIN_ID] ? Number(import.meta.env.VITE_CHAIN_ID) : 11155111,
  address: import.meta.env.VITE_CONTRACT_ADDRESS || '',
};
function savedConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('block-conquest:board'));
    if (saved && NETWORKS[saved.chain]) return { chain: Number(saved.chain), address: saved.address || '', mode: saved.mode === 'match' ? 'match' : 'open' };
  } catch { /* Storage may be blocked; configuration still works for this session. */ }
  return defaults;
}
const state = {
  ...savedConfig(), wallet: null, provider: null, contract: null, account: null, walletChain: null,
  tiles: [], block: 0n, cap: 5n, cooldown: 3n, decay: 10n, score: 0n,
  ready: false, selected: null, attackSource: null, target: null, busy: false, connecting: false,
  epoch: 0, refreshId: 0, operation: 0, readError: '', identities: new Map(), captured: null,
  pendingTiles: [], disconnecting: false, manuallyDisconnected: false, match: null,
};
try { state.manuallyDisconnected = localStorage.getItem('block-conquest:disconnected') === 'true'; } catch { /* Session-only preference. */ }
$('chain').value = String(state.chain);
$('address').value = state.address;
$('board-mode').value = state.mode;
const boardAbi = () => state.mode === 'match' ? MATCH_ABI : ABI;
const matchStatus = () => state.ready && state.match ? matchView(state.match, state.tiles, state.account, state.block) : null;
const canPlay = () => state.ready && (state.mode === 'open' || (state.match?.phase === 1n && [state.match.playerOne, state.match.playerTwo].some(owner => sameAddress(owner, state.account))));

let captureTimer;
let successSnapshot = null; // Presentation marker; never used for game decisions.
let resultAttempt = null; // Presentation feedback scoped to the existing session/operation.
const identityCache = new Map();
function updateIdentities() {
  if (state.mode === 'match' && state.match) {
    const seats = [state.match.playerOne, state.match.playerTwo].filter(owner => !sameAddress(owner, ZeroAddress));
    state.identities = ownerIdentities(state.tiles, seats);
    return;
  }
  const key = `block-conquest:owners:${state.chain}:${state.address.toLowerCase()}`;
  let known = identityCache.get(key);
  if (!known) {
    try { const saved = JSON.parse(localStorage.getItem(key)); if (Array.isArray(saved)) known = saved; } catch { /* Optional storage. */ }
  }
  state.identities = ownerIdentities(state.tiles, known || []);
  const addresses = [...state.identities.keys()];
  identityCache.set(key, addresses);
  try { localStorage.setItem(key, JSON.stringify(addresses)); } catch { /* Stable for this session even without storage. */ }
}
const identity = owner => state.identities.get(owner?.toLowerCase());
const ownerLabel = owner => sameAddress(owner, state.account) ? 'You' : identity(owner)?.label;
const boardCrests = {
  cobalt: new URL('../assets/crest-cobalt.svg', import.meta.url).href,
  ember: new URL('../assets/crest-ember.svg', import.meta.url).href,
};
// Visual factions follow registered seats; open-board identities remain unrestricted.
function boardFaction(owner) {
  if (state.mode !== 'match' || !state.match || !owner || sameAddress(owner, ZeroAddress)) return '';
  return sameAddress(owner, state.match.playerOne) ? 'cobalt' : sameAddress(owner, state.match.playerTwo) ? 'ember' : '';
}
function boardCrest(owner, faction) {
  const crest = faction ? document.createElement('img') : insignia(owner);
  if (faction) { crest.src = boardCrests[faction]; crest.alt = ''; }
  crest.classList.add('tile-crest'); crest.setAttribute('aria-hidden', 'true');
  return crest;
}
function insignia(owner) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('insignia');
  svg.style.setProperty('--owner-hue', String(identity(owner).hue));
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 2L23 21H1Z', 'M3 3H21V21H3Z', 'M12 1L23 12L12 23L1 12Z', 'M7 2H17L23 12L17 22H7L1 12Z', 'M8 1H16V8H23V16H16V23H8V16H1V8H8Z'][identity(owner).shape]);
  path.setAttribute('fill', 'currentColor'); svg.append(path); return svg;
}
function announce(text) { $('board-announcement').textContent = text; }
function showGuide(show) {
  $('conquest-guide').hidden = !show;
  $('show-guide').setAttribute('aria-expanded', String(show));
  try { localStorage.setItem('block-conquest:guide-dismissed', String(!show)); } catch { /* Optional preference. */ }
}
try { $('conquest-guide').hidden = localStorage.getItem('block-conquest:guide-dismissed') === 'true'; } catch { /* Show instructions by default. */ }
$('show-guide').setAttribute('aria-expanded', String(!$('conquest-guide').hidden));
$('show-guide').addEventListener('click', () => showGuide($('conquest-guide').hidden));
$('dismiss-guide').addEventListener('click', () => { showGuide(false); $('show-guide').focus(); });

function captureFeedback(index) {
  clearTimeout(captureTimer);
  state.captured = index;
  captureTimer = setTimeout(() => { state.captured = null; render(); }, 1600);
}

function notice(message) {
  $('setup-message').textContent = message;
  $('setup-notice').hidden = !message;
}
function transaction(title, detail, type = '', hash = null, chain = state.chain) {
  successSnapshot = type === 'success' ? state.tiles : null;
  $('transaction').className = `transaction-card ${type}`;
  $('tx-title').textContent = title;
  $('tx-detail').textContent = detail;
  $('dock-feedback').textContent = type ? title : '';
  const explorer = NETWORKS[chain]?.explorer;
  $('tx-link').hidden = !hash;
  if (hash) {
    $('tx-link').textContent = explorer ? 'View transaction ↗' : `Transaction ${shortAddress(hash)}`;
    if (explorer) $('tx-link').href = `${explorer}/tx/${hash}`;
    else $('tx-link').removeAttribute('href');
    $('tx-link').title = hash;
  }
  renderResult();
}

// Keep tile buttons stable during refreshes, so keyboard focus is preserved.
const cells = Array.from({ length: 64 }, (_, index) => {
  const button = document.createElement('button');
  button.className = 'tile';
  button.type = 'button';
  button.tabIndex = index === 0 ? 0 : -1;
  button.dataset.index = String(index);
  button.addEventListener('click', () => selectTile(index));
  button.addEventListener('keydown', event => {
    const x = index % 8, y = Math.floor(index / 8);
    const next = { ArrowLeft: x > 0 ? index - 1 : index, ArrowRight: x < 7 ? index + 1 : index,
      ArrowUp: y > 0 ? index - 8 : index, ArrowDown: y < 7 ? index + 8 : index }[event.key];
    if (next != null) { event.preventDefault(); cells.forEach((cell, i) => { cell.tabIndex = i === next ? 0 : -1; }); cells[next].focus(); }
  });
  $('grid').append(button);
  return button;
});

function render() {
  const network = NETWORKS[state.chain];
  $('network-badge').textContent = network.name;
  $('connect').textContent = state.connecting ? 'Opening wallet…' : state.account ? shortAddress(state.account) : 'Connect wallet ↗';
  $('connect').title = state.account || 'Connect MetaMask';
  $('connect').disabled = state.connecting || state.disconnecting || Boolean(state.account);
  $('disconnect').hidden = !state.account && !state.disconnecting;
  $('disconnect').disabled = state.disconnecting;
  $('disconnect').textContent = state.disconnecting ? 'Disconnecting…' : 'Disconnect';
  $('connection-state').textContent = state.account ? `Connected · ${shortAddress(state.account)}` : 'Wallet disconnected';
  const wrongNetwork = state.walletChain != null && state.walletChain !== state.chain;
  $('network-badge').textContent = wrongNetwork ? 'Wrong network' : network.name;
  $('network-badge').classList.toggle('wrong', wrongNetwork);
  $('network-notice').hidden = !wrongNetwork;
  $('network-message').textContent = `Your wallet is on chain ${state.walletChain}. Switch to ${network.name} to use this board.`;
  $('refresh').disabled = !state.contract || state.busy;
  $('grid').dataset.ready = String(state.ready);
  $('grid').dataset.attacking = String(state.attackSource != null && state.ready);
  $('board-unloaded').hidden = state.ready;
  $('board-connect').hidden = Boolean(state.account);
  $('board-connect').disabled = state.connecting || state.disconnecting;
  $('unloaded-title').textContent = state.readError ? 'The map could not load.' : wrongNetwork ? `Switch to ${network.name}.` : state.account ? 'Loading territory…' : 'Connect to reveal territory.';
  $('unloaded-detail').textContent = state.readError ? 'Check the message above, then reconnect or refresh.' : state.account && !state.address ? 'Choose a contract in Board settings.' : 'Ownership and power appear after the board loads.';
  $('grid').setAttribute('aria-busy', String(Boolean(state.contract && !state.ready && !state.readError)));
  const participants = state.ready && state.mode === 'match' && state.match ? [state.match.playerOne, state.match.playerTwo] : [];
  const leaders = leaderboard(state.ready ? state.tiles : [], participants);
  const claimed = leaders.reduce((sum, row) => sum + row.score, 0);
  $('my-score').textContent = state.ready ? String(state.score) : '—';
  $('claimed-count').replaceChildren(document.createTextNode(state.ready ? String(claimed) : '—'));
  const total = document.createElement('small'); total.textContent = ' / 64'; $('claimed-count').append(total);
  $('player-count').textContent = state.ready ? String(leaders.filter(row => row.score > 0).length) : '—';
  $('block-number').textContent = state.ready ? state.block.toLocaleString() : '—';
  $('sync-note').textContent = state.readError ? 'Refresh failed' : state.ready ? 'Refreshes with each block' : 'Waiting for a board';
  $('rule-decay').textContent = state.ready ? `Lose 1 power every ${state.decay} blocks, down to a floor of 1. Ownership stays yours.` : 'Power decays over blocks, but never below 1 on an owned tile.';
  $('cap-chip').textContent = `Cap ${state.ready ? state.cap : '—'}`;
  $('cooldown-chip').textContent = `Cooldown ${state.ready ? state.cooldown + ' blocks' : '—'}`;
  $('guide-build').textContent = state.ready ? `Add 1 effective power, up to ${state.cap}. Reinforcement is ready ${state.cooldown} blocks after a claim, reinforcement or attack.` : 'Reinforce when ready. Load the board to see its power cap and cooldown.';
  $('contract-footer').textContent = state.address ? `${network.name} · ${shortAddress(state.address)}` : 'Contract not configured';
  $('contract-footer').title = state.address;
  $('board-hint').textContent = !state.ready ? 'Connect to the configured network to load live territory.' : state.attackSource != null
    ? `Attacking from ${coordinate(state.attackSource)}. Choose a highlighted enemy, then confirm.`
    : state.score === 0n ? 'Choose your first territory: select any empty tile, then claim it.'
    : 'Select your territory to build power, or claim an empty tile to expand.';
  renderMatch();

  cells.forEach((button, index) => {
    const tile = state.ready ? state.tiles[index] : null;
    const empty = isEmpty(tile);
    const mine = sameAddress(tile?.owner, state.account);
    const eligible = canPlay() && canAttack(state.tiles, state.attackSource, index, state.account);
    button.className = `tile${empty ? ' unclaimed' : ' occupied'}${mine ? ' mine' : ''}${index === state.selected ? ' is-selected' : ''}${index === state.attackSource ? ' source' : ''}${eligible ? ' targetable' : ''}${index === state.captured ? ' just-captured' : ''}${state.pendingTiles.includes(index) ? ' move-pending' : ''}`;
    button.disabled = !state.ready || state.busy;
    button.setAttribute('aria-busy', String(state.pendingTiles.includes(index)));
    const faction = empty ? '' : boardFaction(tile.owner);
    if (faction) button.dataset.faction = faction;
    else delete button.dataset.faction;
    button.style.setProperty('--owner-hue', String(empty ? 0 : identity(tile.owner)?.hue ?? 0));
    if (empty) delete button.dataset.pattern;
    else button.dataset.pattern = String(identity(tile.owner).pattern);
    button.setAttribute('aria-pressed', String(index === state.selected));
    button.setAttribute('aria-label', `${coordinate(index)}: ${!state.ready ? 'not loaded' : empty ? 'unclaimed' : `${mine ? 'your tile' : shortAddress(tile.owner)}, power ${tile.power}, owner ${ownerLabel(tile.owner)}`}${eligible ? ', attack available' : ''}`);
    button.title = !state.ready ? 'Load a board first' : empty ? `${coordinate(index)} · Unclaimed` : `${coordinate(index)} · ${tile.owner} · Power ${tile.power}`;
    button.replaceChildren();
    const number = document.createElement('span'); number.className = empty ? 'empty-coordinate' : 'tile-number'; number.textContent = empty ? coordinate(index) : String(tile.power); button.append(number);
    if (!empty) {
      const marker = document.createElement('span'); marker.className = 'owner-marker'; marker.setAttribute('aria-hidden', 'true');
      marker.textContent = ownerLabel(tile.owner); button.append(marker);
      button.append(boardCrest(tile.owner, faction));
    }
  });
  renderSelection();
  const preview = state.ready && canAttack(state.tiles, state.attackSource, state.target, state.account);
  $('attack-line').toggleAttribute('hidden', !preview);
  if (preview) {
    const sx = state.attackSource % 8, sy = Math.floor(state.attackSource / 8);
    const tx = state.target % 8, ty = Math.floor(state.target / 8);
    const dx = tx - sx, dy = ty - sy;
    for (const [key, value] of Object.entries({ x1: sx * 100 + 50 + dx * 30, y1: sy * 100 + 50 + dy * 30, x2: tx * 100 + 50 - dx * 30, y2: ty * 100 + 50 - dy * 30 })) $('attack-path').setAttribute(key, value);
  }
  document.body.classList.toggle('has-selection', canPlay() && state.selected != null);
  $('dock-context').textContent = !state.ready || state.selected == null ? '' : state.busy ? 'Move in progress · check MetaMask' : preview ? `Estimate: ${coordinate(state.attackSource)} → ${coordinate(state.target)} · ${state.tiles[state.attackSource].power} − ${state.tiles[state.target].power} = ${state.tiles[state.attackSource].power - state.tiles[state.target].power} left · new tile 1` : `${coordinate(state.selected)} · ${isEmpty(state.tiles[state.selected]) ? 'Unclaimed · starts at power 1' : `${ownerLabel(state.tiles[state.selected].owner)} · power ${state.tiles[state.selected].power}`}`;
  $('leaderboard').replaceChildren();
  $('leaderboard-empty').hidden = leaders.length > 0;
  $('leaderboard-empty').textContent = !state.ready ? 'Load a board to see its current standings.' : state.mode === 'match' ? 'No players have registered for this match.' : 'The board is waiting for its first conqueror.';
  const standingsStatus = $('standings-status');
  standingsStatus.hidden = !state.ready;
  standingsStatus.textContent = !state.ready ? '' : state.mode === 'open' ? 'Open board · Live territory counts. No match deadline.'
    : state.match?.phase === 3n ? 'Result recorded on-chain · Final territory counts.'
    : state.match?.phase === 2n ? 'Deadline reached · Result not recorded on-chain.'
    : state.match?.phase === 0n ? 'Waiting for two registered players. Territory begins when the match starts.'
    : 'Live standings · Every owned tile adds one to the score.';
  leaders.forEach((row, i) => {
    const li = document.createElement('li');
    const faction = boardFaction(row.owner);
    const leading = i === 0 && row.score > (leaders[1]?.score ?? 0);
    li.dataset.owner = row.owner;
    li.dataset.leading = String(leading);
    if (faction) li.dataset.faction = faction;
    const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = String(i + 1).padStart(2, '0');
    li.style.setProperty('--owner-hue', String(identity(row.owner).hue));
    const swatch = document.createElement('span'); swatch.className = 'owner-swatch'; swatch.dataset.pattern = String(identity(row.owner).pattern);
    const crest = boardCrest(row.owner, faction); crest.classList.remove('tile-crest'); crest.classList.add('standing-crest'); swatch.append(crest);
    const owner = document.createElement('span'); owner.className = 'leader-owner'; owner.title = row.owner;
    const name = document.createElement('span'); name.className = 'leader-name';
    const factionName = faction === 'cobalt' ? 'Cobalt' : faction === 'ember' ? 'Ember' : '';
    name.textContent = `${factionName ? factionName + ' · ' : ''}${ownerLabel(row.owner)}`;
    if (leading) { const badge = document.createElement('span'); badge.className = 'standing-lead'; badge.textContent = 'Leading'; name.append(document.createTextNode(' '), badge); }
    const address = document.createElement('small'); address.textContent = shortAddress(row.owner); address.title = row.owner; address.setAttribute('aria-label', `Wallet ${row.owner}`); owner.append(name, address);
    const score = document.createElement('strong'); score.className = 'leader-score';
    const value = document.createElement('span'); value.className = 'leader-score-value'; value.textContent = String(row.score);
    const unit = document.createElement('span'); unit.className = 'leader-score-unit'; unit.textContent = ` ${row.score === 1 ? 'tile' : 'tiles'}`;
    score.append(value, unit);
    const share = document.createElement('div'); share.className = 'territory-share';
    const track = document.createElement('div'); track.className = 'share-track'; track.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('span'); fill.style.width = `${row.score / 64 * 100}%`; track.append(fill);
    const percentage = document.createElement('span'); percentage.textContent = `${(row.score / 64 * 100).toFixed(1)}% of board`;
    share.append(track, percentage);
    li.append(rank, swatch, owner, score, share); $('leaderboard').append(li);
  });
}

function renderMatch() {
  const mode = state.mode === 'match', view = matchStatus();
  const outcome = completionOutcome();
  $('match-panel').hidden = !mode;
  document.querySelector('.label-note').textContent = (mode ? 'Cobalt / P1 and Ember / P2 are the registered seats. ' : 'Player labels stay with their addresses in this browser. ') + 'Your faction is marked “You”. Ordered by territory count; equal counts use wallet-address order, not a winning tiebreak.';
  $('objective').textContent = mode ? 'Hold more territory when the countdown ends. Equal scores mean a draw.' : 'Hold more territory. Every owned tile adds one to your score. Open board: no match deadline.';
  $('join-match').hidden = !view?.canJoin;
  $('finalize-match').hidden = !view?.canFinalize;
  $('join-match').disabled = $('finalize-match').disabled = state.busy;
  $('match-scores').hidden = !view;
  const clockValue = document.createElement('span'); clockValue.className = 'match-clock-value';
  clockValue.textContent = !view ? '—' : view.waiting ? String(state.match.matchDuration) : view.active ? String(view.blocksLeft) : '0';
  const clockUnit = document.createElement('span'); clockUnit.className = 'match-clock-unit';
  clockUnit.textContent = !view ? '' : view.waiting ? ' blocks / match' : ' blocks left';
  $('match-clock').replaceChildren(clockValue, clockUnit);
  $('match-deadline').textContent = view && !view.waiting ? `Deadline: block ${state.match.endBlock.toLocaleString()}` : 'The second join starts the clock.';
  $('match-title').textContent = !view ? 'Two players. One winner.' : view.waiting ? view.emptySeats === 2 ? 'Take the first seat.' : 'Waiting for player two.' : view.active ? 'The match is on.' : state.match.phase === 2n ? 'Time is up.' : !outcome ? 'Confirming the recorded result.' : outcome.kind === 'draw' ? 'Match drawn.' : outcome.kind === 'victory' ? 'You win.' : `Player ${outcome.seat} wins.`;
  $('match-detail').textContent = !view ? 'Load a match contract and connect your wallet to join or watch.' : view.waiting ? view.joined ? 'Your seat is reserved. Share this contract address with your opponent.' : 'Join with a distinct wallet. Players start at A1 and H8 with 1 power each.' : view.active ? view.joined ? 'Claim, reinforce and capture. Every owned tile adds one to your score.' : 'You are watching. Only the two registered players can make moves.' : outcome ? 'Final result recorded on-chain. This match is complete.' : state.match.phase === 3n ? 'A recorded state was observed. Wait for confirmation and a current snapshot before trusting an outcome.' : 'Time is up. Scores are locked. Anyone can record the result with one transaction.';
  // Factions belong to registered seats, never to the viewer or score ranking.
  // Only the existing block-consistent snapshot supplies occupants and scores.
  [1, 2].forEach(seat => {
    const owner = view?.players[seat - 1];
    const empty = !owner || sameAddress(owner, ZeroAddress);
    const viewer = !empty && sameAddress(owner, state.account);
    const card = document.querySelector(`[data-player-seat="${seat}"]`);
    card.dataset.empty = String(empty);
    card.dataset.you = String(viewer);
    $(`seat-${seat}`).textContent = !view ? 'Load a match' : empty ? 'Open seat' : `${viewer ? 'You' : `Player ${seat}`} · ${shortAddress(owner)}`;
    $(`seat-${seat}`).title = empty ? '' : owner;
    $(`seat-${seat}`).setAttribute('aria-label', !view ? 'Player not loaded' : empty ? 'Open seat' : `${viewer ? 'Your wallet' : `Player ${seat} wallet`}: ${owner}`);
    const score = $(`seat-score-${seat}`);
    const count = empty ? null : view.scores[seat - 1];
    score.querySelector('.seat-score-value').textContent = count == null ? '—' : String(count);
    score.querySelector('.seat-score-unit').textContent = count === 1 ? ' tile' : ' tiles';
    score.setAttribute('aria-label', count == null ? 'No score: seat unoccupied or not loaded' : `${count} ${count === 1 ? 'territory' : 'territories'}`);
  });
  $('join-match').textContent = view?.emptySeats === 1 ? 'Join & start match' : 'Join match';
  $('match-panel').dataset.phase = view ? String(state.match.phase) : 'unloaded';
  if (view && !view.canPlay) $('board-hint').textContent = view.waiting ? 'Both players must join before any tiles can be claimed.' : view.ended ? outcome ? 'Match complete. Select a tile to inspect the final board.' : 'Match expired. Inspect the locked board; the result is not yet confirmed in this view.' : 'Spectator view. Select a tile to inspect it.';
  if (view?.ended) $('rule-decay').textContent = 'Ownership, scores and effective power are frozen at the deadline.';
  renderResult();
}

function completionOutcome() {
  return state.mode === 'match' && state.ready && !state.busy && (successSnapshot === null || state.tiles !== successSnapshot)
    ? recordedOutcome(state.match, state.account) : null;
}

function renderResult() {
  const view = matchStatus(), outcome = completionOutcome();
  const visible = state.mode === 'match' && (Boolean(view?.ended) || Boolean(state.readError && state.match?.phase >= 2n));
  const section = $('match-result');
  section.hidden = !visible;
  $('match-panel').dataset.resultView = String(visible);
  section.dataset.outcome = outcome?.kind ?? 'unresolved';
  section.dataset.faction = outcome?.seat === 1 ? 'cobalt' : outcome?.seat === 2 ? 'ember' : '';
  section.dataset.state = 'unrecorded';
  $('result-title').textContent = 'The field is closed.';
  $('result-kicker').textContent = 'RESULT NOT RECORDED';
  $('result-recorded').textContent = 'Scores locked · Result not recorded on-chain';
  $('result-detail').textContent = 'The deadline has passed. Ownership and power are frozen. Record the result to establish the on-chain outcome.';
  $('result-feedback').hidden = true;
  $('result-feedback').textContent = '';
  $('result-tx-link').hidden = true;
  $('result-contract').hidden = true;
  $('result-crest').src = new URL('../assets/mark.svg', import.meta.url).href;
  $('result-second-crest').hidden = true;
  $('result-scores').hidden = !view;
  $('result-score-label').textContent = outcome ? 'Final territory counts' : 'Locked territory counts';
  [1, 2].forEach(seat => {
    const owner = view?.players[seat - 1];
    $(`final-score-${seat === 1 ? 'one' : 'two'}`).textContent = view ? String(view.scores[seat - 1]) : '—';
    const player = $(`result-player-${seat === 1 ? 'one' : 'two'}`);
    player.textContent = owner ? `${sameAddress(owner, state.account) ? 'You' : `P${seat}`} · ${shortAddress(owner)}` : '';
    player.title = owner ?? '';
  });
  if (!visible) return;
  const attempted = resultAttempt?.epoch === state.epoch && resultAttempt?.operation === state.operation;
  const transaction = $('transaction');
  const failed = attempted && transaction.classList.contains('error');
  const receipt = attempted && transaction.classList.contains('success');
  $('result-feedback').dataset.kind = failed || (!view && state.readError) ? 'error' : 'pending';
  if (outcome) {
    const name = outcome.seat === 1 ? 'Cobalt' : 'Ember';
    section.dataset.state = 'recorded';
    $('result-kicker').textContent = outcome.kind === 'spectator' ? `RECORDED RESULT / PLAYER 0${outcome.seat}` : `${outcome.kind.toUpperCase()} / RECORDED RESULT`;
    $('result-title').textContent = outcome.kind === 'draw' ? 'An even field.' : `${name} holds the field.`;
    $('result-detail').textContent = outcome.kind === 'draw' ? 'The contract recorded a draw. Neither faction wins this match.' : `The contract recorded ${name} as the winner. The final board remains available to inspect.`;
    $('result-recorded').textContent = outcome.kind === 'spectator' ? `${name} win recorded on-chain` : `${outcome.kind[0].toUpperCase() + outcome.kind.slice(1)} recorded on-chain`;
    $('result-crest').src = boardCrests[outcome.kind === 'draw' || outcome.seat === 1 ? 'cobalt' : 'ember'];
    $('result-second-crest').hidden = outcome.kind !== 'draw';
  } else if (!view) {
    section.dataset.state = 'unavailable';
    $('result-title').textContent = 'Result data unavailable.';
    $('result-kicker').textContent = 'SNAPSHOT UNAVAILABLE';
    $('result-recorded').textContent = receipt ? 'Receipt confirmed · Recorded result not yet verified' : 'A current result snapshot is required';
    $('result-detail').textContent = 'The latest match data could not load. Refresh the board before trusting an outcome.';
  } else if (receipt || state.match.phase === 3n) {
    const fresh = !state.busy && (successSnapshot === null || state.tiles !== successSnapshot);
    section.dataset.state = state.match.phase === 3n && fresh ? 'unavailable' : 'refreshing';
    $('result-title').textContent = section.dataset.state === 'unavailable' ? 'Recorded result unavailable.' : 'Confirming the result.';
    $('result-kicker').textContent = 'OUTCOME NOT YET VERIFIED';
    $('result-recorded').textContent = 'Waiting for a confirmed, authoritative recorded result';
    $('result-detail').textContent = section.dataset.state === 'unavailable' ? 'The recorded winner is unavailable or invalid. No winner has been inferred from territory counts. Refresh the board.' : 'A receipt or recorded state was observed. Wait for transaction confirmation and the latest board snapshot before viewing the outcome.';
  } else if (failed) {
    section.dataset.state = 'recording-error';
    $('result-title').textContent = 'Recording needs attention.';
  } else if (attempted && state.busy) {
    section.dataset.state = 'recording';
    $('result-title').textContent = 'Recording the result.';
    $('result-kicker').textContent = 'RESULT RECORDING IN PROGRESS';
    $('result-recorded').textContent = 'Awaiting confirmation · No final outcome shown';
  }
  if (attempted && (state.busy || failed) && !receipt) {
    $('result-feedback').hidden = false;
    $('result-feedback').textContent = `${$('tx-title').textContent} ${$('tx-detail').textContent}`;
  }
  if (!view && state.readError) {
    $('result-feedback').hidden = false;
    $('result-feedback').textContent = state.readError;
  }
  const txLink = $('tx-link');
  if (attempted && !txLink.hidden) {
    $('result-tx-link').hidden = false;
    $('result-tx-link').textContent = txLink.textContent;
    if (txLink.hasAttribute('href')) $('result-tx-link').href = txLink.href;
    else $('result-tx-link').removeAttribute('href');
    $('result-tx-link').title = txLink.title;
  }
  const total = view ? view.scores[0] + view.scores[1] : null;
  $('result-territory').textContent = total == null ? 'Latest territory counts unavailable' : `${total} / 64 territories claimed · ${64 - total} unclaimed · Power frozen at deadline`;
  $('result-deadline').textContent = view ? `Deadline: block ${state.match.endBlock.toLocaleString()} · 0 blocks left` : '';
  const network = NETWORKS[state.chain];
  $('result-network').textContent = `${network.name} · ${shortAddress(state.address)}`;
  $('result-network').title = state.address;
  if (network.explorer && state.address) { $('result-contract').hidden = false; $('result-contract').href = `${network.explorer}/address/${state.address}`; }
}

function renderSelection() {
  const tile = state.ready && state.selected != null ? state.tiles[state.selected] : null;
  const panel = document.querySelector('.action-card');
  const faction = tile ? boardFaction(tile.owner) : '';
  panel.dataset.ownerFaction = faction;
  // Presentation only: reveal success after the existing receipt + refresh flow.
  panel.dataset.snapshotReady = String(state.ready && !state.busy && (successSnapshot === null || state.tiles !== successSnapshot));
  for (const id of ['claim', 'reinforce', 'attack', 'capture', 'cancel-attack']) { $(id).hidden = true; $(id).disabled = true; }
  $('tile-details').hidden = !tile;
  $('attack-preview').hidden = true;
  $('selection-coordinate').textContent = tile ? coordinate(state.selected) : '—';
  if (!tile) {
    const view = matchStatus();
    if (view && !view.canPlay) {
      $('selection-title').textContent = view.ended ? completionOutcome() ? 'Match complete.' : state.match.phase === 2n ? 'Match expired.' : 'Result pending.' : view.waiting ? 'Join the conquest.' : 'Watch the match.';
      $('selection-description').textContent = view.ended ? 'Select a tile to inspect the final board. No further moves can be made.' : view.waiting ? 'Use the match panel above to join. Both players receive a starting tile when the match begins.' : 'Select any tile to inspect its owner and power.';
      $('action-help').textContent = view.canFinalize ? 'Use Record final result above to record the on-chain outcome.' : view.waiting ? 'The second player’s join starts the countdown.' : 'Each owned tile adds one to the score.';
      return;
    }
    $('selection-title').textContent = state.ready ? 'Pick your territory.' : 'Your map awaits.';
    $('selection-description').textContent = state.ready ? 'Select any tile to see its owner, power, and available moves.' : 'Connect MetaMask on the board’s network to load live territory and make your first move.';
    $('claim').hidden = false;
    $('action-help').textContent = 'Every move is a transaction you confirm in MetaMask.';
    return;
  }
  const empty = isEmpty(tile), mine = sameAddress(tile.owner, state.account);
  const remaining = cooldownRemaining(tile, state.block, state.cooldown);
  $('tile-owner').replaceChildren();
  if (!empty) {
    const crest = boardCrest(tile.owner, faction);
    crest.classList.remove('tile-crest'); crest.classList.add('action-crest');
    $('tile-owner').append(crest);
  }
  const factionName = faction === 'cobalt' ? 'Cobalt' : faction === 'ember' ? 'Ember' : '';
  $('tile-owner').append(document.createTextNode(empty ? 'Unclaimed' : `${factionName ? factionName + ' · ' : ''}${ownerLabel(tile.owner)}`));
  $('tile-owner').title = empty ? '' : tile.owner;
  $('tile-owner').title = empty ? '' : tile.owner;
  $('tile-power').textContent = `${tile.power} / ${state.cap}`;
  $('tile-cooldown').textContent = empty ? 'Starts after claim' : remaining > 0n ? `Ready in ${remaining} ${remaining === 1n ? 'block' : 'blocks'}` : 'Ready';
  const decayLeft = decayRemaining(tile, state.block, state.decay);
  $('tile-decay').textContent = empty ? 'No power yet' : decayLeft == null ? 'Minimum power reached' : `Next power loss in ${decayLeft} ${decayLeft === 1n ? 'block' : 'blocks'}`;
  if (!canPlay()) {
    const view = matchStatus();
    $('selection-title').textContent = view?.ended ? completionOutcome() ? 'Final territory.' : 'Locked territory.' : view?.waiting ? 'Waiting for players.' : 'Spectator view.';
    $('selection-description').textContent = view?.ended ? 'The deadline has passed. Ownership and power are frozen.' : view?.waiting ? 'Join using the match panel above. Tiles unlock when the second player joins.' : 'Only the two registered players can make moves.';
    $('action-help').textContent = view?.ended ? 'Each owned tile counts toward the final score.' : 'You can inspect every tile.';
    if (view?.ended) { $('tile-cooldown').textContent = 'Match ended'; $('tile-decay').textContent = 'Frozen at deadline'; }
    return;
  }
  if (state.attackSource != null) {
    $('selection-title').textContent = state.target == null ? 'Choose an enemy.' : `${coordinate(state.attackSource)} → ${coordinate(state.target)}`;
    $('selection-description').textContent = state.target == null ? 'Highlighted tiles are adjacent enemies with less effective power.' : `Capture ${coordinate(state.target)} at power 1. Your source keeps ${state.tiles[state.attackSource].power - tile.power} power.`;
    $('capture').hidden = false;
    $('capture').disabled = state.busy || !canAttack(state.tiles, state.attackSource, state.target, state.account);
    $('cancel-attack').hidden = false; $('cancel-attack').disabled = state.busy;
    $('action-help').textContent = 'Power and ownership can change before your transaction is mined.';
    if (canAttack(state.tiles, state.attackSource, state.target, state.account)) {
      const source = state.tiles[state.attackSource];
      $('attack-preview').dataset.sourceFaction = boardFaction(source.owner);
      $('attack-preview').dataset.targetFaction = faction;
      $('attack-preview').hidden = false;
      $('preview-source').textContent = String(source.power);
      $('preview-defender').textContent = String(tile.power);
      $('preview-remaining').textContent = String(source.power - tile.power);
      $('preview-result').textContent = `${coordinate(state.target)} becomes yours with 1 power.`;
      $('selection-description').textContent = 'Capture this neighbour. Review the power cost before confirming.';
    }
    return;
  }
  $('selection-title').textContent = empty ? state.score === 0n ? 'Start with this tile.' : 'Claim this tile.' : mine ? 'Your territory.' : 'Enemy territory.';
  $('selection-description').textContent = empty ? `Claim ${coordinate(state.selected)} and start with 1 power.` : mine ? 'Build power, or use this tile to capture an adjacent enemy.' : 'Select one of your adjacent tiles, then choose an attack target.';
  $('claim').hidden = !empty; $('claim').disabled = !empty || state.busy;
  $('reinforce').hidden = !mine; $('reinforce').disabled = !mine || state.busy || remaining > 0n || tile.power >= state.cap;
  $('reinforce').firstChild.textContent = remaining > 0n ? `Wait ${remaining} ${remaining === 1n ? 'block' : 'blocks'} ` : tile.power >= state.cap ? 'At power cap ' : 'Reinforce ';
  const targets = state.tiles.some((_, index) => canAttack(state.tiles, state.selected, index, state.account));
  $('attack').hidden = !mine; $('attack').disabled = !mine || state.busy || !targets;
  $('action-help').textContent = state.busy ? 'Complete the current transaction before making another move.' : mine && !targets
    ? 'No weaker adjacent enemies are available to attack right now.' : 'Every move is a transaction you confirm in MetaMask.';
}

function selectTile(index) {
  if (!state.ready || state.busy) return;
  if (state.attackSource != null) {
    if (!canAttack(state.tiles, state.attackSource, index, state.account)) {
      const target = state.tiles[index];
      transaction('Choose another target.', isEmpty(target) || sameAddress(target.owner, state.account) ? 'Attack a tile owned by another player.' : !adjacent(state.attackSource, index) ? 'Only orthogonally adjacent enemies can be attacked.' : 'Your source must have strictly greater effective power.', 'error');
      return;
    }
    state.target = index;
  }
  cells.forEach((cell, i) => { cell.tabIndex = i === index ? 0 : -1; });
  state.selected = index; render();
  announce(`${coordinate(index)} selected. ${$('selection-description').textContent}`);
}

function resetSession() {
  clearTimeout(captureTimer); state.captured = null;
  state.epoch++; state.refreshId++; state.operation++;
  if (state.busy) transaction('Wallet or board changed.', 'An already submitted transaction may still confirm. Check its hash in MetaMask before sending another move.', 'warning');
  state.busy = false;
  if (state.provider) { state.provider.removeAllListeners(); state.provider.destroy(); }
  Object.assign(state, { provider: null, contract: null, ready: false, tiles: [], selected: null, attackSource: null, target: null, readError: '', pendingTiles: [], match: null });
  render();
}

async function syncWallet(requestAccess = false) {
  resetSession();
  if (state.manuallyDisconnected && !requestAccess) {
    state.account = null; state.walletChain = null;
    notice('Wallet disconnected. Connect MetaMask to load the live board.'); render(); return;
  }
  if (requestAccess) {
    state.manuallyDisconnected = false;
    try { localStorage.removeItem('block-conquest:disconnected'); } catch { /* Optional storage. */ }
  }
  const epoch = state.epoch;
  try {
    if (!state.wallet) throw new Error('Install or unlock MetaMask in this browser, then reload the page.');
    const accounts = await state.wallet.request({ method: requestAccess ? 'eth_requestAccounts' : 'eth_accounts' });
    const chain = Number(await state.wallet.request({ method: 'eth_chainId' }));
    if (epoch !== state.epoch) return;
    state.account = accounts[0] ? getAddress(accounts[0]) : null;
    state.walletChain = chain;
    if (!state.account) { notice('Connect MetaMask to load the live board.'); return; }
    if (chain !== state.chain) { notice('Select the board’s network in your wallet.'); return; }
    if (!state.address) { notice('Set the updated contract’s public address to load your board.'); $('settings').open = true; return; }
    state.address = validateAddress(state.address, state.chain);
    const provider = new BrowserProvider(state.wallet);
    provider.pollingInterval = 2000;
    state.provider = provider;
    state.contract = new Contract(state.address, boardAbi(), provider);
    const code = await provider.getCode(state.address);
    if (epoch !== state.epoch) return;
    if (code === '0x') throw new Error('No contract exists at this address on the selected network. Check Board settings.');
    await refreshBoard();
    if (epoch !== state.epoch) return;
    provider.on('block', () => { if (epoch === state.epoch) void refreshBoard(); });
  } catch (error) {
    if (epoch !== state.epoch) return;
    state.readError = friendlyError(error); notice(state.readError);
    transaction('Connection needs attention.', state.readError, 'error');
  } finally { if (epoch === state.epoch) render(); }
}

async function refreshBoard() {
  if (!state.contract || !state.provider) return false;
  const epoch = state.epoch, id = ++state.refreshId;
  const contract = state.contract, provider = state.provider, account = state.account;
  try {
    const block = BigInt(await provider.send('eth_blockNumber', []));
    const at = { blockTag: Number(block) };
    // All values describe one block, even if a new block arrives mid-request.
    const [grid, score, cap, cooldown, decay, size, match] = await Promise.all([
      contract.getGrid(at), contract.scoreOf(account, at), contract.maxPower(at),
      contract.reinforcementCooldown(at), contract.decayInterval(at), contract.BOARD_SIZE(at),
      state.mode === 'match' ? readMatch(contract, at) : null,
    ]);
    if (epoch !== state.epoch || id !== state.refreshId) return false;
    if (size !== 8n || grid.length !== 64 || cap < 2n || cooldown < 1n || decay < 1n) throw new Error('This address does not contain a compatible Block Conquest board.');
    const nextTiles = grid.map(tile => ({ owner: getAddress(tile.owner), power: tile.power, lastUpdateBlock: tile.lastUpdateBlock }));
    const changes = nextTiles.flatMap((tile, index) => {
      const previous = state.tiles[index];
      return previous && (!sameAddress(previous.owner, tile.owner) || previous.power !== tile.power) ? [`${coordinate(index)}: ${isEmpty(tile) ? 'unclaimed' : `${sameAddress(tile.owner, account) ? 'your tile' : shortAddress(tile.owner)}, power ${tile.power}`}`] : [];
    });
    state.tiles = nextTiles;
    const previousPhase = state.match?.phase;
    Object.assign(state, { block, score, cap, cooldown, decay, match, ready: true, readError: '' });
    updateIdentities();
    if (!canPlay()) { state.attackSource = null; state.target = null; }
    if (state.attackSource != null && !sameAddress(state.tiles[state.attackSource].owner, account)) state.attackSource = null;
    if (!canAttack(state.tiles, state.attackSource, state.target, account)) state.target = null;
    if (changes.length) announce(`Board updated. ${changes.slice(0, 4).join('; ')}${changes.length > 4 ? `; and ${changes.length - 4} more tiles changed.` : '.'}`);
    notice(''); render();
    if (match && previousPhase !== match.phase) announce(`${$('match-title').textContent} ${$('match-detail').textContent}`);
    return true;
  } catch (error) {
    if (epoch !== state.epoch || id !== state.refreshId) return false;
    state.ready = false; state.readError = friendlyError(error);
    notice(`Board refresh failed. ${state.readError}`); render(); return false;
  }
}

async function readMatch(contract, at) {
  try {
    const keys = ['MATCH_VERSION', 'playerOne', 'playerTwo', 'startBlock', 'endBlock', 'matchDuration', 'phase', 'winner'];
    const values = await Promise.all(keys.map(key => contract[key](at)));
    const result = Object.fromEntries(keys.map((key, i) => [key, values[i]]));
    if (result.MATCH_VERSION !== 1n) throw new Error('Unsupported match version.');
    return result;
  } catch (error) {
    if (error.code === 'CALL_EXCEPTION' || error.code === 'BAD_DATA') throw new Error('This address is not a two-player match contract. Select Open board for the earlier deployment, or enter a new match address.');
    throw error;
  }
}

async function submitMove(method, indices) {
  if (!state.ready || state.busy || !state.account) return;
  const view = matchStatus();
  if (method === 'join' ? !view?.canJoin : method === 'finalize' ? !view?.canFinalize : !canPlay()) return;
  const epoch = state.epoch, operation = ++state.operation;
  const { provider, wallet, account, address, chain } = state;
  const args = indices.flatMap(index => [index % 8, Math.floor(index / 8)]);
  const name = { claim: 'Claim', reinforce: 'Reinforcement', attack: 'Attack', join: 'Join', finalize: 'Result' }[method];
  let hash = null;
  const current = () => epoch === state.epoch && operation === state.operation;
  state.busy = true; state.pendingTiles = indices; render();
  transaction('Confirm in MetaMask.', `${name} ${indices.map(coordinate).join(' → ')}. Review the transaction in your wallet.`, 'pending');
  try {
    const [walletChain, accounts] = await Promise.all([wallet.request({ method: 'eth_chainId' }), wallet.request({ method: 'eth_accounts' })]);
    if (!current()) return;
    if (Number(walletChain) !== chain || !sameAddress(accounts[0], account)) throw new Error('Your wallet account or network changed. Reconnect before submitting.');
    const contract = new Contract(address, boardAbi(), await provider.getSigner(account));
    if (!current()) return;
    // Leave room for a slightly different decay/storage path in the inclusion
    // block. MetaMask still displays the fee and asks the user to confirm.
    const estimate = await contract[method].estimateGas(...args);
    if (!current()) return;
    const tx = await contract[method](...args, { gasLimit: (estimate * 120n + 99n) / 100n });
    hash = tx.hash;
    if (!current()) return;
    transaction('Transaction pending.', `${name} submitted. Waiting for block confirmation…`, 'pending', hash, chain);
    const receipt = await tx.wait(1);
    if (!current()) return;
    if (!receipt || receipt.status !== 1) throw new Error('The transaction failed on-chain. Refresh and try again.');
    state.attackSource = null; state.target = null; state.selected = indices.at(-1) ?? null;
    if (method === 'attack') captureFeedback(indices.at(-1));
    transaction(`${name} confirmed.`, `Included in block ${receipt.blockNumber}. Your move is recorded on ${NETWORKS[chain].name}.`, 'success', receipt.hash, chain);
    await refreshBoard();
  } catch (error) {
    if (!current()) return;
    if (error.code === 'TRANSACTION_REPLACED' && !error.cancelled && error.reason === 'repriced' && error.receipt?.status === 1) {
      state.attackSource = null; state.target = null;
      state.selected = indices.at(-1) ?? null;
      if (method === 'attack') captureFeedback(indices.at(-1));
      transaction(`${name} confirmed.`, 'Your speed-up transaction was confirmed.', 'success', error.receipt.hash, chain);
    } else {
      transaction(error.code === 'TRANSACTION_REPLACED' ? 'Transaction replaced.' : 'Move not completed.', error.code === 'TRANSACTION_REPLACED' ? 'The wallet cancelled or replaced this move. Check MetaMask for the final transaction.' : friendlyError(error), 'error', hash, chain);
    }
    await refreshBoard();
  } finally { if (current()) { state.busy = false; state.pendingTiles = []; render(); } }
}

async function disconnectWallet() {
  if (state.disconnecting) return;
  const wasBusy = state.busy, wallet = state.wallet;
  state.disconnecting = true; state.manuallyDisconnected = true;
  try { localStorage.setItem('block-conquest:disconnected', 'true'); } catch { /* Keep disconnected for this session. */ }
  state.account = null; state.walletChain = null; resetSession();
  notice('Wallet disconnected. Connect MetaMask to load the live board.');
  transaction('Wallet disconnected.', wasBusy ? 'A submitted move may still confirm. Check MetaMask for its result.' : 'Your territory stays on-chain. Reconnect to continue.');
  try {
    await wallet.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
  } catch {
    transaction('Disconnected from this app.', 'Wallet permission could not be removed. To remove it fully, open MetaMask → Dapp connections → this site → Disconnect.', 'warning');
    if (wasBusy) $('tx-detail').append(' A submitted move may still confirm; check MetaMask.');
  } finally { state.disconnecting = false; render(); $('connect').focus(); }
}
$('disconnect').addEventListener('click', () => void disconnectWallet());
$('board-connect').addEventListener('click', () => $('connect').click());

$('connect').addEventListener('click', async () => {
  state.connecting = true; render();
  try { await syncWallet(true); } finally { state.connecting = false; render(); }
});
$('refresh').addEventListener('click', () => void refreshBoard());
$('open-settings').addEventListener('click', () => { $('settings').open = true; $('address').focus(); });
$('close-settings').addEventListener('click', () => { $('settings').open = false; $('settings').querySelector('summary').focus(); });
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.busy) { $('settings-error').textContent = 'Finish the current transaction before changing boards.'; return; }
  try {
    const chain = Number($('chain').value), address = validateAddress($('address').value.trim(), chain);
    const mode = $('board-mode').value;
    Object.assign(state, { chain, address, mode });
    try { localStorage.setItem('block-conquest:board', JSON.stringify({ chain, address, mode })); } catch { /* Session-only config. */ }
    $('settings-error').textContent = ''; $('settings').open = false;
    await syncWallet();
  } catch (error) { $('settings-error').textContent = friendlyError(error); }
});
$('switch-network').addEventListener('click', async () => {
  if (!state.wallet) return;
  try {
    await state.wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: NETWORKS[state.chain].hex }] });
    await syncWallet();
  } catch (error) {
    if (Number(error.code) === 4902 && state.chain === 31337) {
      try {
        await state.wallet.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x7a69', chainName: 'Local Hardhat', nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['http://127.0.0.1:8545'] }] });
        await syncWallet();
      } catch (addError) { transaction('Network switch failed.', friendlyError(addError), 'error'); }
    } else transaction('Network switch failed.', friendlyError(error), 'error');
  }
});
$('claim').addEventListener('click', () => void submitMove('claim', [state.selected]));
$('join-match').addEventListener('click', () => void submitMove('join', []));
$('finalize-match').addEventListener('click', () => void submitMove('finalize', []));
$('finalize-match').addEventListener('click', () => { resultAttempt = { epoch: state.epoch, operation: state.operation + 1 }; }, { capture: true });
$('reinforce').addEventListener('click', () => void submitMove('reinforce', [state.selected]));
$('attack').addEventListener('click', () => { state.attackSource = state.selected; state.target = null; render(); cells[state.attackSource].focus(); announce('Choose an adjacent weaker enemy. Use arrow keys to move, Enter to select, Escape to cancel.'); });
$('capture').addEventListener('click', () => { if (canAttack(state.tiles, state.attackSource, state.target, state.account)) void submitMove('attack', [state.attackSource, state.target]); });
function cancelAttack() {
  if (state.busy || state.attackSource == null) return;
  state.selected = state.attackSource; state.attackSource = null; state.target = null; render();
  cells[state.selected].focus(); announce('Attack cancelled. Your source tile is selected.');
}
$('cancel-attack').addEventListener('click', cancelAttack);
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if ($('settings').open) { $('close-settings').click(); return; }
  if (state.busy) return;
  if (state.attackSource != null) { cancelAttack(); return; }
  const previous = state.selected;
  state.selected = null; render();
  if (previous != null) { cells[previous].focus(); announce('Selection cleared.'); }
});

function attachWallet(wallet) {
  if (!wallet || state.wallet === wallet || state.account) return;
  state.wallet?.removeListener?.('accountsChanged', walletChanged);
  state.wallet?.removeListener?.('chainChanged', walletChanged);
  state.wallet?.removeListener?.('disconnect', walletDisconnected);
  state.wallet = wallet;
  wallet.on?.('accountsChanged', walletChanged);
  wallet.on?.('chainChanged', walletChanged);
  wallet.on?.('disconnect', walletDisconnected);
  void syncWallet();
}
function walletChanged() { if (!state.manuallyDisconnected && !state.disconnecting) void syncWallet(); }
function walletDisconnected() {
  if (state.manuallyDisconnected) return;
  resetSession(); state.account = null; state.walletChain = null;
  notice('Wallet disconnected. Reconnect MetaMask to continue.'); render();
}
window.addEventListener('eip6963:announceProvider', event => {
  if (event.detail?.info?.rdns === 'io.metamask') attachWallet(event.detail.provider);
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
if (!state.wallet) attachWallet(window.ethereum?.providers?.find(p => p.isMetaMask) || window.ethereum);
window.addEventListener('ethereum#initialized', () => attachWallet(window.ethereum), { once: true });
window.addEventListener('beforeunload', () => state.provider?.destroy());
render();
