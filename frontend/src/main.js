import { BrowserProvider, Contract, getAddress } from 'ethers';
import { ABI, NETWORKS, sameAddress, isEmpty, shortAddress, coordinate, adjacent, validateAddress, leaderboard, ownerIdentities, decayRemaining, cooldownRemaining, canAttack, friendlyError } from './game.js';
import './style.css';

const $ = id => document.getElementById(id);
const defaults = {
  chain: NETWORKS[import.meta.env.VITE_CHAIN_ID] ? Number(import.meta.env.VITE_CHAIN_ID) : 11155111,
  address: import.meta.env.VITE_CONTRACT_ADDRESS || '',
};
function savedConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('block-conquest:board'));
    if (saved && NETWORKS[saved.chain]) return { chain: Number(saved.chain), address: saved.address || '' };
  } catch { /* Storage may be blocked; configuration still works for this session. */ }
  return defaults;
}
const state = {
  ...savedConfig(), wallet: null, provider: null, contract: null, account: null, walletChain: null,
  tiles: [], block: 0n, cap: 5n, cooldown: 3n, decay: 10n, score: 0n,
  ready: false, selected: null, attackSource: null, target: null, busy: false, connecting: false,
  epoch: 0, refreshId: 0, operation: 0, readError: '', identities: new Map(), captured: null,
};
$('chain').value = String(state.chain);
$('address').value = state.address;

let captureTimer;
const identityCache = new Map();
function updateIdentities() {
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
  $('transaction').className = `transaction-card ${type}`;
  $('tx-title').textContent = title;
  $('tx-detail').textContent = detail;
  const explorer = NETWORKS[chain]?.explorer;
  $('tx-link').hidden = !hash;
  if (hash) {
    $('tx-link').textContent = explorer ? 'View transaction ↗' : `Transaction ${shortAddress(hash)}`;
    if (explorer) $('tx-link').href = `${explorer}/tx/${hash}`;
    else $('tx-link').removeAttribute('href');
    $('tx-link').title = hash;
  }
}

// Keep tile buttons stable during refreshes, so keyboard focus is preserved.
const cells = Array.from({ length: 64 }, (_, index) => {
  const button = document.createElement('button');
  button.className = 'tile';
  button.type = 'button';
  button.dataset.index = String(index);
  button.addEventListener('click', () => selectTile(index));
  button.addEventListener('keydown', event => {
    const x = index % 8, y = Math.floor(index / 8);
    const next = { ArrowLeft: x > 0 ? index - 1 : index, ArrowRight: x < 7 ? index + 1 : index,
      ArrowUp: y > 0 ? index - 8 : index, ArrowDown: y < 7 ? index + 8 : index }[event.key];
    if (next != null) { event.preventDefault(); cells[next].focus(); }
  });
  $('grid').append(button);
  return button;
});

function render() {
  const network = NETWORKS[state.chain];
  $('network-badge').textContent = network.name;
  $('connect').textContent = state.connecting ? 'Opening wallet…' : state.account ? shortAddress(state.account) : 'Connect wallet ↗';
  $('connect').title = state.account || 'Connect MetaMask';
  $('connect').disabled = state.connecting || Boolean(state.account);
  $('connection-state').textContent = state.account ? `Connected · ${shortAddress(state.account)}` : 'Wallet disconnected';
  const wrongNetwork = state.walletChain != null && state.walletChain !== state.chain;
  $('network-notice').hidden = !wrongNetwork;
  $('network-message').textContent = `Your wallet is on chain ${state.walletChain}. Switch to ${network.name} to use this board.`;
  $('refresh').disabled = !state.contract || state.busy;
  $('grid').dataset.ready = String(state.ready);
  $('grid').setAttribute('aria-busy', String(Boolean(state.contract && !state.ready && !state.readError)));
  const leaders = leaderboard(state.tiles);
  const claimed = leaders.reduce((sum, row) => sum + row.score, 0);
  $('my-score').textContent = state.ready ? String(state.score) : '—';
  $('claimed-count').replaceChildren(document.createTextNode(state.ready ? String(claimed) : '—'));
  const total = document.createElement('small'); total.textContent = ' / 64'; $('claimed-count').append(total);
  $('player-count').textContent = state.ready ? String(leaders.length) : '—';
  $('block-number').textContent = state.ready ? state.block.toLocaleString() : '—';
  $('sync-note').textContent = state.readError ? 'Refresh failed' : state.ready ? 'Refreshes with each block' : 'Waiting for a board';
  $('rule-decay').textContent = state.ready ? `Lose 1 power every ${state.decay} blocks, down to a floor of 1. Ownership stays yours.` : 'Power decays over blocks, but never below 1 on an owned tile.';
  $('cap-chip').textContent = `Cap ${state.ready ? state.cap : '—'}`;
  $('cooldown-chip').textContent = `Cooldown ${state.ready ? state.cooldown + ' blocks' : '—'}`;
  $('contract-footer').textContent = state.address ? `${network.name} · ${shortAddress(state.address)}` : 'Contract not configured';
  $('contract-footer').title = state.address;
  $('board-hint').textContent = !state.ready ? 'Connect to the configured network to load live territory.' : state.attackSource != null
    ? `Attacking from ${coordinate(state.attackSource)}. Choose a highlighted enemy, then confirm.`
    : state.score === 0n ? 'Choose your first territory: select any empty tile, then claim it.'
    : 'Select your territory to build power, or claim an empty tile to expand.';

  cells.forEach((button, index) => {
    const tile = state.tiles[index];
    const empty = isEmpty(tile);
    const mine = sameAddress(tile?.owner, state.account);
    const eligible = canAttack(state.tiles, state.attackSource, index, state.account);
    button.className = `tile${empty ? ' unclaimed' : ' occupied'}${mine ? ' mine' : ''}${index === state.selected ? ' is-selected' : ''}${index === state.attackSource ? ' source' : ''}${eligible ? ' targetable' : ''}${index === state.captured ? ' just-captured' : ''}`;
    button.disabled = !state.ready || state.busy;
    button.style.setProperty('--owner-hue', String(empty ? 0 : identity(tile.owner)?.hue ?? 0));
    button.setAttribute('aria-pressed', String(index === state.selected));
    button.setAttribute('aria-label', `${coordinate(index)}: ${!state.ready ? 'not loaded' : empty ? 'unclaimed' : `${mine ? 'your tile' : shortAddress(tile.owner)}, power ${tile.power}, owner ${identity(tile.owner)?.label}`}${eligible ? ', attack available' : ''}`);
    button.title = !state.ready ? 'Load a board first' : empty ? `${coordinate(index)} · Unclaimed` : `${coordinate(index)} · ${tile.owner} · Power ${tile.power}`;
    button.replaceChildren();
    const number = document.createElement('span'); number.className = 'tile-number'; number.textContent = empty ? '+' : String(tile.power); button.append(number);
    if (!empty) {
      const marker = document.createElement('span'); marker.className = 'owner-marker'; marker.setAttribute('aria-hidden', 'true');
      marker.textContent = identity(tile.owner)?.label; button.append(marker);
    }
  });
  renderSelection();
  $('leaderboard').replaceChildren();
  $('leaderboard-empty').hidden = leaders.length > 0;
  $('leaderboard-empty').textContent = state.ready ? 'The board is waiting for its first conqueror.' : 'Load a board to see its current owners.';
  leaders.forEach((row, i) => {
    const li = document.createElement('li');
    const rank = document.createElement('span'); rank.className = 'rank'; rank.textContent = String(i + 1).padStart(2, '0');
    li.style.setProperty('--owner-hue', String(identity(row.owner).hue));
    const swatch = document.createElement('span'); swatch.className = 'owner-swatch'; swatch.textContent = identity(row.owner).label;
    const owner = document.createElement('span'); owner.className = 'leader-owner'; owner.textContent = `${shortAddress(row.owner)}${sameAddress(row.owner, state.account) ? ' · You' : ''}`; owner.title = row.owner;
    const score = document.createElement('strong'); score.textContent = `${row.score} ${row.score === 1 ? 'tile' : 'tiles'}`;
    const share = document.createElement('div'); share.className = 'territory-share';
    const track = document.createElement('div'); track.className = 'share-track'; track.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('span'); fill.style.width = `${row.score / 64 * 100}%`; track.append(fill);
    const percentage = document.createElement('span'); percentage.textContent = `${(row.score / 64 * 100).toFixed(1)}% of board`;
    share.append(track, percentage);
    li.append(rank, swatch, owner, score, share); $('leaderboard').append(li);
  });
}

function renderSelection() {
  const tile = state.ready && state.selected != null ? state.tiles[state.selected] : null;
  for (const id of ['claim', 'reinforce', 'attack', 'capture', 'cancel-attack']) { $(id).hidden = true; $(id).disabled = true; }
  $('tile-details').hidden = !tile;
  $('attack-preview').hidden = true;
  $('selection-coordinate').textContent = tile ? coordinate(state.selected) : '—';
  if (!tile) {
    $('selection-title').textContent = 'Pick your territory.';
    $('selection-description').textContent = 'Select any tile to see its owner, power, and available moves.';
    $('claim').hidden = false;
    $('action-help').textContent = 'Every move is a transaction you confirm in MetaMask.';
    return;
  }
  const empty = isEmpty(tile), mine = sameAddress(tile.owner, state.account);
  const remaining = cooldownRemaining(tile, state.block, state.cooldown);
  $('tile-owner').textContent = empty ? 'Unclaimed' : `${identity(tile.owner).label} · ${mine ? 'You' : shortAddress(tile.owner)}`;
  $('tile-owner').title = empty ? '' : tile.owner;
  $('tile-power').textContent = `${tile.power} / ${state.cap}`;
  $('tile-cooldown').textContent = empty ? 'Starts after claim' : remaining > 0n ? `Ready in ${remaining} ${remaining === 1n ? 'block' : 'blocks'}` : 'Ready';
  const decayLeft = decayRemaining(tile, state.block, state.decay);
  $('tile-decay').textContent = empty ? 'No power yet' : decayLeft == null ? 'Minimum power reached' : `Next power loss in ${decayLeft} ${decayLeft === 1n ? 'block' : 'blocks'}`;
  if (state.attackSource != null) {
    $('selection-title').textContent = state.target == null ? 'Choose an enemy.' : `${coordinate(state.attackSource)} → ${coordinate(state.target)}`;
    $('selection-description').textContent = state.target == null ? 'Highlighted tiles are adjacent enemies with less effective power.' : `Capture ${coordinate(state.target)} at power 1. Your source keeps ${state.tiles[state.attackSource].power - tile.power} power.`;
    $('capture').hidden = false;
    $('capture').disabled = state.busy || !canAttack(state.tiles, state.attackSource, state.target, state.account);
    $('cancel-attack').hidden = false; $('cancel-attack').disabled = state.busy;
    $('action-help').textContent = 'Power and ownership can change before your transaction is mined.';
    if (canAttack(state.tiles, state.attackSource, state.target, state.account)) {
      const source = state.tiles[state.attackSource];
      $('attack-preview').hidden = false;
      $('preview-source').textContent = String(source.power);
      $('preview-defender').textContent = String(tile.power);
      $('preview-remaining').textContent = String(source.power - tile.power);
      $('preview-result').textContent = `${coordinate(state.target)} becomes yours with 1 power.`;
      $('selection-description').textContent = 'Capture this neighbour. Review the power cost before confirming.';
    }
    return;
  }
  $('selection-title').textContent = empty ? state.score === 0n ? 'Your conquest starts here.' : 'Expand your territory.' : mine ? 'Hold your ground.' : 'Enemy territory.';
  $('selection-description').textContent = empty ? `Claim ${coordinate(state.selected)} and start with 1 power.` : mine ? 'Build power, or use this tile to capture an adjacent enemy.' : 'Select one of your adjacent tiles, then choose an attack target.';
  $('claim').hidden = !empty; $('claim').disabled = !empty || state.busy;
  $('reinforce').hidden = !mine; $('reinforce').disabled = !mine || state.busy || remaining > 0n || tile.power >= state.cap;
  $('reinforce').firstChild.textContent = remaining > 0n ? `Wait ${remaining} blocks ` : tile.power >= state.cap ? 'At power cap ' : 'Reinforce ';
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
  state.selected = index; render();
}

function resetSession() {
  clearTimeout(captureTimer); state.captured = null;
  state.epoch++; state.refreshId++; state.operation++;
  if (state.busy) transaction('Wallet or board changed.', 'An already submitted transaction may still confirm. Check its hash in MetaMask before sending another move.', 'warning');
  state.busy = false;
  if (state.provider) { state.provider.removeAllListeners(); state.provider.destroy(); }
  Object.assign(state, { provider: null, contract: null, ready: false, tiles: [], selected: null, attackSource: null, target: null, readError: '' });
  render();
}

async function syncWallet(requestAccess = false) {
  resetSession();
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
    state.contract = new Contract(state.address, ABI, provider);
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
    const [grid, score, cap, cooldown, decay, size] = await Promise.all([
      contract.getGrid(at), contract.scoreOf(account, at), contract.maxPower(at),
      contract.reinforcementCooldown(at), contract.decayInterval(at), contract.BOARD_SIZE(at),
    ]);
    if (epoch !== state.epoch || id !== state.refreshId) return false;
    if (size !== 8n || grid.length !== 64 || cap < 2n || cooldown < 1n || decay < 1n) throw new Error('This address does not contain a compatible Block Conquest board.');
    state.tiles = grid.map(tile => ({ owner: getAddress(tile.owner), power: tile.power, lastUpdateBlock: tile.lastUpdateBlock }));
    updateIdentities();
    Object.assign(state, { block, score, cap, cooldown, decay, ready: true, readError: '' });
    if (state.attackSource != null && !sameAddress(state.tiles[state.attackSource].owner, account)) state.attackSource = null;
    if (!canAttack(state.tiles, state.attackSource, state.target, account)) state.target = null;
    notice(''); render(); return true;
  } catch (error) {
    if (epoch !== state.epoch || id !== state.refreshId) return false;
    state.ready = false; state.readError = friendlyError(error);
    notice(`Board refresh failed. ${state.readError}`); render(); return false;
  }
}

async function submitMove(method, indices) {
  if (!state.ready || state.busy || !state.account) return;
  const epoch = state.epoch, operation = ++state.operation;
  const { provider, wallet, account, address, chain } = state;
  const args = indices.flatMap(index => [index % 8, Math.floor(index / 8)]);
  const name = { claim: 'Claim', reinforce: 'Reinforcement', attack: 'Attack' }[method];
  let hash = null;
  const current = () => epoch === state.epoch && operation === state.operation;
  state.busy = true; render();
  transaction('Confirm in MetaMask.', `${name} ${indices.map(coordinate).join(' → ')}. Review the transaction in your wallet.`, 'pending');
  try {
    const [walletChain, accounts] = await Promise.all([wallet.request({ method: 'eth_chainId' }), wallet.request({ method: 'eth_accounts' })]);
    if (!current()) return;
    if (Number(walletChain) !== chain || !sameAddress(accounts[0], account)) throw new Error('Your wallet account or network changed. Reconnect before submitting.');
    const contract = new Contract(address, ABI, await provider.getSigner(account));
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
    state.attackSource = null; state.target = null; state.selected = indices.at(-1);
    if (method === 'attack') captureFeedback(indices.at(-1));
    transaction(`${name} confirmed.`, `Included in block ${receipt.blockNumber}. Your move is recorded on ${NETWORKS[chain].name}.`, 'success', receipt.hash, chain);
    await refreshBoard();
  } catch (error) {
    if (!current()) return;
    if (error.code === 'TRANSACTION_REPLACED' && !error.cancelled && error.reason === 'repriced' && error.receipt?.status === 1) {
      state.attackSource = null; state.target = null;
      state.selected = indices.at(-1);
      if (method === 'attack') captureFeedback(indices.at(-1));
      transaction(`${name} confirmed.`, 'Your speed-up transaction was confirmed.', 'success', error.receipt.hash, chain);
    } else {
      transaction(error.code === 'TRANSACTION_REPLACED' ? 'Transaction replaced.' : 'Move not completed.', error.code === 'TRANSACTION_REPLACED' ? 'The wallet cancelled or replaced this move. Check MetaMask for the final transaction.' : friendlyError(error), 'error', hash, chain);
    }
    await refreshBoard();
  } finally { if (current()) { state.busy = false; render(); } }
}

$('connect').addEventListener('click', async () => {
  state.connecting = true; render();
  try { await syncWallet(true); } finally { state.connecting = false; render(); }
});
$('refresh').addEventListener('click', () => void refreshBoard());
$('open-settings').addEventListener('click', () => { $('settings').open = true; $('address').focus(); });
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.busy) { $('settings-error').textContent = 'Finish the current transaction before changing boards.'; return; }
  try {
    const chain = Number($('chain').value), address = validateAddress($('address').value.trim(), chain);
    Object.assign(state, { chain, address });
    try { localStorage.setItem('block-conquest:board', JSON.stringify({ chain, address })); } catch { /* Session-only config. */ }
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
$('reinforce').addEventListener('click', () => void submitMove('reinforce', [state.selected]));
$('attack').addEventListener('click', () => { state.attackSource = state.selected; state.target = null; render(); });
$('capture').addEventListener('click', () => { if (canAttack(state.tiles, state.attackSource, state.target, state.account)) void submitMove('attack', [state.attackSource, state.target]); });
$('cancel-attack').addEventListener('click', () => { state.selected = state.attackSource; state.attackSource = null; state.target = null; render(); });

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
function walletChanged() { void syncWallet(); }
function walletDisconnected() {
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
