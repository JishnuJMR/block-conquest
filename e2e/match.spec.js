import { test, expect } from '@playwright/test';
import { ContractFactory, JsonRpcProvider } from 'ethers';
import { readFile, mkdir } from 'node:fs/promises';

const artifact = JSON.parse(await readFile(new URL('../artifacts/contracts/BlockConquestMatch.sol/BlockConquestMatch.json', import.meta.url), 'utf8'));
let provider, game, alice, bob, spectator, errors;
test.beforeAll(() => { provider = new JsonRpcProvider('http://127.0.0.1:8545'); });
test.afterAll(() => provider.destroy());
test.beforeEach(async ({ page }) => {
  errors = []; page.on('pageerror', error => errors.push(error.message));
  await provider.send('evm_setAutomine', [true]);
  [alice, bob, spectator] = await Promise.all([0, 1, 2].map(i => provider.getSigner(i)));
  game = await new ContractFactory(artifact.abi, artifact.bytecode, alice).deploy(10, 3, 5, 100);
  await game.waitForDeployment();
});
test.afterEach(() => expect(errors).toEqual([]));
async function mine(n) { await provider.send('hardhat_mine', [`0x${BigInt(n).toString(16)}`]); }
async function expire() {
  const current = BigInt(await provider.send('eth_blockNumber', []));
  await mine(await game.endBlock() - current);
}
async function start() { await (await game.join()).wait(); await (await game.connect(bob).join()).wait(); }
const cell = (page, i) => page.locator(`.tile[data-index="${i}"]`);
async function open(page, signer = alice) {
  await page.exposeFunction('matchRpc', async (method, params) => {
    const response = await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || [] }) });
    return response.json();
  });
  await page.addInitScript(({ address, account }) => {
    localStorage.setItem('block-conquest:board', JSON.stringify({ chain: 31337, address, mode: 'match' }));
    const listeners = new Map();
    const control = { account, connected: false, reject: false, hold: false, release: null };
    window.__matchWallet = control;
    control.change = account => { control.account = account; control.connected = true; for (const fn of listeners.get('accountsChanged') || []) fn([account]); };
    window.ethereum = {
      isMetaMask: true,
      on(name, fn) { listeners.set(name, [...(listeners.get(name) || []), fn]); },
      removeListener(name, fn) { listeners.set(name, (listeners.get(name) || []).filter(f => f !== fn)); },
      async request({ method, params }) {
        if (method === 'eth_chainId') return '0x7a69';
        if (method === 'eth_accounts') return control.connected ? [control.account] : [];
        if (method === 'eth_requestAccounts') { control.connected = true; return [control.account]; }
        if (method === 'wallet_revokePermissions') { control.connected = false; return null; }
        if (method === 'eth_sendTransaction') {
          if (control.reject) { control.reject = false; throw Object.assign(new Error('Rejected'), { code: 4001 }); }
          if (control.hold) { control.hold = false; await new Promise(resolve => { control.release = resolve; }); }
        }
        const result = await window.matchRpc(method, params);
        if (result.error) throw result.error;
        return result.result;
      },
    };
  }, { address: await game.getAddress(), account: await signer.getAddress() });
  await page.goto('/');
  await page.locator('#connect').click();
  await expect(page.locator('#grid')).toHaveAttribute('data-ready', 'true');
}

test('join two seats, start equal corners, and reconnect as a player', async ({ page }) => {
  await open(page);
  await expect(page.locator('#match-title')).toHaveText('Take the first seat.');
  await cell(page, 1).click(); await expect(page.locator('#claim')).toBeHidden();
  await page.locator('#join-match').click();
  await expect(page.locator('#tx-title')).toHaveText('Join confirmed.');
  await expect(page.locator('#match-title')).toHaveText('Waiting for player two.');
  await expect(page.locator('#join-match')).toBeHidden();
  await page.evaluate(address => window.__matchWallet.change(address), await bob.getAddress());
  await expect(page.locator('#join-match')).toHaveText('Join & start match');
  await page.locator('#join-match').click();
  await expect(page.locator('#match-title')).toHaveText('The match is on.');
  await expect(page.locator('#match-clock')).toHaveText('100 blocks left');
  await expect(cell(page, 63)).toContainText('You');
  await expect(cell(page, 0).locator('.owner-marker')).toHaveText('P1');
  await expect(page.locator('#seat-score-1')).toHaveText('1 tile');
  await expect(page.locator('#seat-score-2')).toHaveText('1 tile');
  await page.locator('#disconnect').click();
  await expect(page.locator('#match-scores')).toBeHidden();
  await page.locator('#connect').click();
  await expect(page.locator('#match-title')).toHaveText('The match is on.');
});

test('spectator can inspect but cannot join or move, then can finalize a draw', async ({ page }) => {
  await start(); await open(page, spectator);
  await expect(page.locator('#leaderboard li')).toHaveCount(2);
  await expect(page.locator('#leaderboard [data-leading="true"]')).toHaveCount(0);
  const tieOrder = [await alice.getAddress(), await bob.getAddress()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  expect(await page.locator('#leaderboard li').evaluateAll(rows => rows.map(row => row.dataset.owner))).toEqual(tieOrder);
  await expect(page.locator('#match-detail')).toContainText('You are watching');
  await expect(page.locator('#join-match')).toBeHidden();
  await cell(page, 1).click();
  await expect(page.locator('#selection-title')).toHaveText('Spectator view.');
  await expect(page.locator('#claim')).toBeHidden();
  await expire();
  await expect(page.locator('#match-title')).toHaveText('Time is up.');
  await expect(page.locator('#match-result')).toHaveAttribute('data-state', 'unrecorded');
  await expect(page.locator('#match-result')).toHaveAttribute('data-outcome', 'unresolved');
  await expect(page.locator('#standings-status')).toContainText('Result not recorded on-chain');
  await page.locator('#finalize-match').click();
  await expect(page.locator('#tx-title')).toHaveText('Result confirmed.');
  await expect(page.locator('#match-detail')).toContainText('Final result recorded');
  await expect(page.locator('#match-result')).toHaveAttribute('data-state', 'recorded');
  await expect(page.locator('#match-result')).toHaveAttribute('data-outcome', 'draw');
  await expect(page.locator('#result-title')).toHaveText('An even field.');
  await expect(page.locator('#standings-status')).toHaveText('Result recorded on-chain · Final territory counts.');
  await expect(page.locator('#selection-title')).toHaveText('Match complete.');
  await expect(page.locator('#finalize-match')).toBeHidden();
});

test('claim, reinforce, capture, countdown and final winner through the UI', async ({ page }) => {
  await start();
  await (await game.connect(bob).claim(1, 0)).wait();
  await open(page);
  await cell(page, 8).click(); await page.locator('#claim').click();
  await expect(page.locator('#tx-title')).toHaveText('Claim confirmed.');
  await mine(3);
  await cell(page, 0).click(); await expect(page.locator('#reinforce')).toBeEnabled();
  await page.locator('#reinforce').click();
  await expect(page.locator('#tx-title')).toHaveText('Reinforcement confirmed.');
  await page.locator('#attack').click(); await cell(page, 1).click();
  await expect(page.locator('#attack-preview')).toBeVisible();
  await page.locator('#capture').click();
  await expect(page.locator('#tx-title')).toHaveText('Attack confirmed.');
  await expect(page.locator('#seat-score-1')).toHaveText('3 tiles');
  await expect(page.locator('#seat-score-2')).toHaveText('1 tile');
  await expect(cell(page, 63).locator('.owner-marker')).toHaveText('P2');
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/match-active-local.png', fullPage: true });
  await expire();
  await expect(page.locator('#match-title')).toHaveText('Time is up.');
  await expect(page.locator('#match-result')).toHaveAttribute('data-outcome', 'unresolved');
  await expect(page.locator('#claim')).toBeHidden();
  await expect(page.locator('#tile-decay')).toHaveText('Frozen at deadline');
  await page.locator('#finalize-match').click();
  await expect(page.locator('#match-detail')).toContainText('Final result recorded');
  await page.screenshot({ path: 'docs/screenshots/match-result-local.png', fullPage: true });
});

test('deadline cancels an open attack preview and disables all game actions', async ({ page }) => {
  await start(); await (await game.connect(bob).claim(1, 0)).wait();
  const end = await game.endBlock(), now = BigInt(await provider.send('eth_blockNumber', []));
  await mine(end - now - 5n);
  await (await game.reinforce(0, 0)).wait();
  await open(page);
  await cell(page, 0).click(); await page.locator('#attack').click(); await cell(page, 1).click();
  await expect(page.locator('#attack-preview')).toBeVisible();
  await expire();
  await expect(page.locator('#match-clock')).toHaveText('0 blocks left');
  await expect(page.locator('#attack-preview')).toBeHidden();
  await expect(page.locator('#capture')).toBeHidden();
  await expect(page.locator('#attack-line')).toBeHidden();
});

test('rejected join keeps the seat open and retry works', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__matchWallet.reject = true; });
  await page.locator('#join-match').click();
  await expect(page.locator('#tx-detail')).toContainText('rejected');
  await expect(page.locator('#join-match')).toBeEnabled();
  await expect(page.locator('#seat-1')).toHaveText('Open seat');
  await expect(page.locator('#seat-score-1 .seat-score-value')).toHaveText('—');
  await page.locator('#join-match').click();
  await expect(page.locator('#match-title')).toHaveText('Waiting for player two.');
});


test('a held claim that lands after the deadline fails without changing scores', async ({ page }) => {
  await start(); await open(page);
  await cell(page, 1).click();
  await page.evaluate(() => { window.__matchWallet.hold = true; });
  await page.locator('#claim').click();
  await expect.poll(() => page.evaluate(() => typeof window.__matchWallet.release)).toBe('function');
  await expect(page.locator('#seat-score-1')).toHaveText('1 tile');
  await expect(page.locator('#seat-score-2')).toHaveText('1 tile');
  await expire();
  await page.evaluate(() => window.__matchWallet.release());
  await expect(page.locator('#tx-title')).toHaveText('Move not completed.');
  await expect(page.locator('#match-title')).toHaveText('Time is up.');
  await expect(page.locator('#seat-score-1')).toHaveText('1 tile');
  await expect(page.locator('#seat-score-2')).toHaveText('1 tile');
  expect(await game.scoreOf(await alice.getAddress())).toBe(1n);
});

test('faction seats distinguish an unloaded board, empty seats and a registered lobby player', async ({ page }) => {
  await open(page);
  await expect(page.locator('#leaderboard li')).toHaveCount(0);
  await expect(page.locator('#leaderboard-empty')).toHaveText('No players have registered for this match.');
  await expect(page.locator('#seat-name-1')).toHaveText('Cobalt');
  await expect(page.locator('#seat-name-2')).toHaveText('Ember');
  for (const seat of [1, 2]) {
    await expect(page.locator(`[data-player-seat="${seat}"]`)).toHaveAttribute('data-empty', 'true');
    await expect(page.locator(`#seat-${seat}`)).toHaveText('Open seat');
    await expect(page.locator(`#seat-score-${seat} .seat-score-value`)).toHaveText('—');
  }
  await page.locator('#join-match').click();
  await expect(page.locator('#match-title')).toHaveText('Waiting for player two.');
  await expect(page.locator('[data-player-seat="1"]')).toHaveAttribute('data-you', 'true');
  await expect(page.locator('#seat-1')).toHaveAttribute('title', await alice.getAddress());
  await expect(page.locator('#seat-score-1')).toHaveText('0 tiles');
  await expect(page.locator('#leaderboard li')).toHaveCount(1);
  await expect(page.locator('#leaderboard [data-faction="cobalt"] .leader-score')).toHaveText('0 tiles');
  await expect(page.locator('#leaderboard [data-leading="true"]')).toHaveCount(0);
  await expect(page.locator('#seat-2')).toHaveText('Open seat');
  await page.locator('#disconnect').click();
  await expect(page.locator('#match-scores')).toBeHidden();
  await expect(page.locator('#seat-1')).toHaveAttribute('title', '');
  await expect(page.locator('#seat-1')).toHaveText('Load a match');
  await expect(page.locator('#leaderboard li')).toHaveCount(0);
  await expect(page.locator('#standings-status')).toBeHidden();
  await page.locator('#connect').click();
  await expect(page.locator('#seat-1')).toHaveAttribute('title', await alice.getAddress());
  await expect(page.locator('#seat-2')).toHaveText('Open seat');
});

test('Cobalt and Ember stay with their registered seats across zero scores, viewers and responsive layouts', async ({ page }) => {
  await start();
  await (await game.connect(bob).claim(1, 0)).wait();
  await mine(3);
  await (await game.connect(bob).reinforce(1, 0)).wait();
  await (await game.connect(bob).attack(1, 0, 0, 0)).wait();
  await open(page);
  const crests = await page.locator('.seat-crest').evaluateAll(images => images.map(image => image.src));
  for (const viewer of [alice, bob, spectator]) {
    const account = await viewer.getAddress();
    await page.evaluate(account => window.__matchWallet.change(account), account);
    await expect(page.locator('#grid')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#seat-1')).toHaveAttribute('title', await alice.getAddress());
    await expect(page.locator('#seat-2')).toHaveAttribute('title', await bob.getAddress());
    await expect(page.locator('#seat-score-1')).toHaveText(`${await game.scoreOf(await alice.getAddress())} tiles`);
    await expect(page.locator('#seat-score-2')).toHaveText(`${await game.scoreOf(await bob.getAddress())} tiles`);
    await expect(page.locator('#seat-score-1')).toHaveText('0 tiles');
    await expect(page.locator('#seat-score-2')).toHaveText('3 tiles');
    await expect(page.locator('[data-player-seat="1"]')).toHaveAttribute('data-you', String(viewer === alice));
    await expect(page.locator('[data-player-seat="2"]')).toHaveAttribute('data-you', String(viewer === bob));
    expect(await page.locator('.seat-crest').evaluateAll(images => images.map(image => image.src))).toEqual(crests);
  }
  await expect(page.locator('#match-detail')).toContainText('You are watching');
  await expect(page.locator('#join-match')).toBeHidden();
  await expect(page.locator('#leaderboard li')).toHaveCount(2);
  await expect(page.locator('#leaderboard [data-faction="cobalt"] .leader-score')).toHaveText('0 tiles');
  await expect(page.locator('#leaderboard [data-faction="ember"] .leader-score')).toHaveText('3 tiles');
  await expect(page.locator('#leaderboard [data-leading="true"]')).toHaveAttribute('data-faction', 'ember');
  await expect(page.locator('#leaderboard [data-faction="cobalt"] .territory-share')).toContainText('0.0% of board');
  await expect(page.locator('#seat-name-1')).toHaveCSS('color', 'rgb(36, 89, 184)');
  await expect(page.locator('#seat-name-2')).toHaveCSS('color', 'rgb(185, 72, 39)');
  for (const width of [360, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.seat-card').evaluateAll(cards => cards.every(card => {
      const bounds = card.getBoundingClientRect();
      return [...card.children].every(child => {
        const rect = child.getBoundingClientRect();
        return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
      });
    }))).toBe(true);
    expect(await page.locator('.seat-crest').evaluateAll(images => images.every(image => {
      const rect = image.getBoundingClientRect();
      return image.complete && image.naturalWidth > 0 && Math.abs(rect.width / rect.height - 1) < .01;
    }))).toBe(true);
    const a = await page.locator('[data-player-seat="1"]').boundingBox();
    const clock = await page.locator('.match-timing').boundingBox();
    const b = await page.locator('[data-player-seat="2"]').boundingBox();
    expect(a.x + a.width).toBeLessThanOrEqual(clock.x);
    expect(clock.x + clock.width).toBeLessThanOrEqual(b.x);
    expect(await page.locator('#leaderboard li').evaluateAll(rows => rows.every(row => {
      const bounds = row.getBoundingClientRect();
      return [...row.children].every(child => {
        const rect = child.getBoundingClientRect();
        return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
      });
    }))).toBe(true);
    expect(await page.locator('#leaderboard .leader-owner small').evaluateAll(addresses => addresses.every(address => address.title.length === 42 && address.textContent.length < 20))).toBe(true);
  }
});

test('Standard Bearer board preserves live powers, stable buttons, targeting and confirmed ownership at six sizes', async ({ page }) => {
  await start();
  await (await game.connect(bob).claim(1, 0)).wait();
  await (await game.claim(0, 1)).wait();
  await mine(3);
  await (await game.reinforce(0, 0)).wait();
  await (await game.reinforce(0, 1)).wait();
  await mine(2);
  await (await game.reinforce(0, 0)).wait();
  await open(page);
  await page.evaluate(() => { window.__stableTiles = [...document.querySelectorAll('.tile')]; });
  await expect(cell(page, 0)).toHaveAttribute('data-faction', 'cobalt');
  await expect(cell(page, 1)).toHaveAttribute('data-faction', 'ember');
  await expect(cell(page, 0).locator('.tile-number')).toHaveText('3');
  await expect(cell(page, 8).locator('.tile-number')).toHaveText('2');
  await expect(cell(page, 1).locator('.tile-number')).toHaveText('1');
  await expect(cell(page, 0)).toHaveCSS('background-color', 'rgb(36, 89, 184)');
  await expect(cell(page, 1)).toHaveCSS('background-color', 'rgb(185, 72, 39)');
  expect(await cell(page, 0).evaluate(tile => getComputedStyle(tile).backgroundImage)).not.toBe(await cell(page, 1).evaluate(tile => getComputedStyle(tile).backgroundImage));
  for (const width of [360, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.tile')).toHaveCount(64);
    await expect(page.locator('.column-labels span')).toHaveCount(8);
    await expect(page.locator('.row-labels span')).toHaveCount(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.tile').evaluateAll(tiles => tiles.every(tile => {
      const rect = tile.getBoundingClientRect(), frame = tile.closest('.map-wrap').getBoundingClientRect();
      return rect.width >= 32 && Math.abs(rect.width - rect.height) < 1 && rect.left >= frame.left && rect.right <= frame.right && rect.bottom <= frame.bottom &&
        [...tile.children].filter(child => child.getClientRects().length).every(child => {
          const bounds = child.getBoundingClientRect();
          return bounds.left >= rect.left && bounds.right <= rect.right && bounds.top >= rect.top && bounds.bottom <= rect.bottom;
        });
    }))).toBe(true);
  }
  await cell(page, 0).focus();
  await page.keyboard.press('Enter');
  await expect(cell(page, 0)).toHaveClass(/is-selected/);
  await expect(cell(page, 0)).toHaveCSS('outline-style', 'solid');
  await expect(cell(page, 0)).toHaveCSS('outline-color', 'rgb(244, 241, 232)');
  await page.locator('#attack').click();
  await expect(cell(page, 1)).toHaveClass(/targetable/);
  await expect(cell(page, 1)).toHaveCSS('outline-style', 'dashed');
  await expect(cell(page, 63)).not.toHaveClass(/targetable/);
  await expect(cell(page, 63)).toHaveCSS('opacity', '1');
  expect(await cell(page, 63).evaluate(tile => getComputedStyle(tile, '::before').opacity)).toBe('0.28');
  await cell(page, 63).click();
  await expect(page.locator('#tx-detail')).toContainText('orthogonally adjacent');
  await expect(page.locator('#capture')).toBeDisabled();
  await cell(page, 0).focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await expect(page.locator('#attack-preview')).toBeVisible();
  await expect(page.locator('#attack-line')).toBeVisible();
  await page.evaluate(() => { window.__matchWallet.reject = true; });
  await page.locator('#capture').click();
  await expect(page.locator('#tx-detail')).toContainText('rejected');
  await expect(cell(page, 1)).toHaveAttribute('data-faction', 'ember');
  await expect(cell(page, 0).locator('.tile-number')).toHaveText('3');
  await page.evaluate(() => { window.__matchWallet.hold = true; });
  await page.locator('#capture').click();
  await expect.poll(() => page.evaluate(() => typeof window.__matchWallet.release)).toBe('function');
  await expect(cell(page, 1)).toHaveAttribute('aria-busy', 'true');
  await expect(cell(page, 1)).toHaveCSS('outline-style', 'dashed');
  await expect(cell(page, 1)).toHaveAttribute('data-faction', 'ember');
  await expect(page.locator('#seat-score-1')).toHaveText('2 tiles');
  await page.evaluate(() => window.__matchWallet.release());
  await expect(page.locator('#tx-title')).toHaveText('Attack confirmed.');
  await expect(cell(page, 1)).toHaveAttribute('data-faction', 'cobalt');
  await expect(cell(page, 0).locator('.tile-number')).toHaveText('2');
  await expect(cell(page, 1).locator('.tile-number')).toHaveText('1');
  await expect(page.locator('#seat-score-1')).toHaveText('3 tiles');
  expect(await page.evaluate(() => window.__stableTiles.every((tile, i) => tile === document.querySelectorAll('.tile')[i]))).toBe(true);
});

test('mobile lobby, active move and result are readable and reachable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page);
  await expect(page.locator('#join-match')).toBeInViewport();
  await page.screenshot({ path: 'docs/screenshots/match-lobby-mobile-local.png', fullPage: true });
  await page.locator('#join-match').click();
  await expect(page.locator('#match-title')).toHaveText('Waiting for player two.');
  await (await game.connect(bob).join()).wait();
  await expect(page.locator('#match-title')).toHaveText('The match is on.');
  await cell(page, 1).click();
  await page.locator('#claim').scrollIntoViewIfNeeded();
  await expect(page.locator('#claim')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expire();
  await page.locator('#finalize-match').scrollIntoViewIfNeeded();
  await expect(page.locator('#finalize-match')).toBeInViewport();
  await page.locator('#finalize-match').click();
  await expect(page.locator('#match-detail')).toContainText('Final result recorded');
});

test('Standard Bearer action panel keeps live availability, faction identity and touch controls at six sizes', async ({ page }) => {
  await start(); await (await game.connect(bob).claim(1, 0)).wait();
  await mine(3); await (await game.reinforce(0, 0)).wait();
  await open(page);
  for (const width of [360, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#selection-title')).toHaveText('Pick your territory.');
    await expect(page.locator('#claim')).toBeDisabled();
    await cell(page, 2).click();
    await expect(page.locator('#claim')).toBeEnabled();
    await page.locator('#claim').scrollIntoViewIfNeeded();
    await expect(page.locator('#claim')).toBeInViewport();
    if (width < 760) {
      const board = await page.locator('.map-wrap').boundingBox();
      const dock = await page.locator('#action-dock').boundingBox();
      expect(board.y + board.height).toBeLessThanOrEqual(dock.y);
      await expect(page.locator('#action-dock')).toHaveCSS('position', 'sticky');
    }
    await cell(page, 0).click();
    await expect(page.locator('#tile-owner')).toContainText('Cobalt');
    await expect(page.locator('#tile-owner')).toContainText('You');
    await expect(page.locator('#reinforce')).toBeDisabled();
    await expect(page.locator('#attack')).toBeEnabled();
    await cell(page, 63).click();
    await expect(page.locator('#tile-owner')).toContainText('Ember');
    await expect(page.locator('#reinforce')).toBeHidden();
    await expect(page.locator('#attack')).toBeHidden();
    await cell(page, 0).click(); await page.locator('#attack').click();
    await cell(page, 63).click();
    await expect(page.locator('#tx-detail')).toContainText('orthogonally adjacent');
    await expect(page.locator('#capture')).toBeDisabled();
    await cell(page, 1).click();
    await expect(page.locator('#capture')).toBeEnabled();
    await expect(page.locator('#attack-preview')).toHaveAttribute('data-source-faction', 'cobalt');
    await expect(page.locator('#attack-preview')).toHaveAttribute('data-target-faction', 'ember');
    await page.locator('#capture').scrollIntoViewIfNeeded();
    expect(await page.locator('#action-dock button').evaluateAll(buttons => buttons.filter(button => !button.hidden).every(button => button.getBoundingClientRect().height >= 44))).toBe(true);
    await expect(page.locator('#claim')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
  }
  await mine(3);
  await cell(page, 0).click();
  await expect(page.locator('#reinforce')).toBeEnabled();
  for (let power = 3; power <= 5; power++) {
    if (power > 3) await mine(3);
    await (await game.reinforce(0, 0)).wait();
  }
  await mine(3); // Existing copy prioritizes cooldown before the cap label.
  await expect(page.locator('#reinforce')).toContainText('At power cap');
  await expect(page.locator('#reinforce')).toBeDisabled();
  await page.evaluate(address => window.__matchWallet.change(address), await bob.getAddress());
  await expect(page.locator('#grid')).toHaveAttribute('data-ready', 'true');
  await cell(page, 63).click();
  await expect(page.locator('#tile-owner')).toContainText('Ember');
  await expect(page.locator('#tile-owner')).toContainText('You');
  await expect(page.locator('#attack')).toBeDisabled();
  await page.evaluate(address => window.__matchWallet.change(address), await spectator.getAddress());
  await expect(page.locator('#selection-title')).toHaveText('Watch the match.');
  await cell(page, 0).click();
  await expect(page.locator('#selection-title')).toHaveText('Spectator view.');
  await expect(page.locator('#claim')).toBeHidden();
  await expect(page.locator('#reinforce')).toBeHidden();
  await page.locator('#disconnect').click();
  await expect(page.locator('#selection-title')).toHaveText('Your map awaits.');
  await expect(page.locator('#claim')).toBeDisabled();
});

test('recording stays unresolved through wallet, receipt and snapshot delay, then shows victory, defeat and spectator results', async ({ page }) => {
  await start();
  await (await game.connect(bob).claim(1, 0)).wait();
  await mine(3); await (await game.connect(bob).reinforce(1, 0)).wait();
  await (await game.connect(bob).attack(1, 0, 0, 0)).wait();
  await open(page);
  await expect(page.locator('#match-result')).toBeHidden();
  await expire();
  await expect(page.locator('#match-result')).toHaveAttribute('data-state', 'unrecorded');
  await expect(page.locator('#match-result')).toHaveAttribute('data-outcome', 'unresolved');
  await expect(page.locator('#match-title')).toHaveText('Time is up.');
  await page.evaluate(selector => {
    const original = window.ethereum.request.bind(window.ethereum), control = window.__matchWallet;
    control.gridReleases = []; control.holdGrid = false; control.hold = true;
    control.releaseGrid = () => { control.holdGrid = false; control.gridReleases.splice(0).forEach(release => release()); };
    window.ethereum.request = async payload => {
      if (control.holdGrid && payload.method === 'eth_call' && payload.params?.[0]?.data?.startsWith(selector)) await new Promise(resolve => control.gridReleases.push(resolve));
      return original(payload);
    };
  }, game.interface.getFunction('getGrid').selector);
  await page.locator('#finalize-match').click();
  await expect.poll(() => page.evaluate(() => typeof window.__matchWallet.release)).toBe('function');
  await expect(page.locator('#match-result')).toHaveAttribute('data-state', 'recording');
  await expect(page.locator('#result-feedback')).toContainText('Confirm in MetaMask.');
  await provider.send('evm_setAutomine', [false]);
  try {
    await page.evaluate(() => window.__matchWallet.release());
    await expect(page.locator('#result-feedback')).toContainText('Transaction pending.');
    await expect(page.locator('#match-result')).toHaveAttribute('data-outcome', 'unresolved');
    await page.evaluate(() => { window.__matchWallet.holdGrid = true; });
    // Keep block production moving until the browser observes the receipt;
    // a one-block manual mine can race transaction admission/polling.
    await expect.poll(async () => {
      await mine(1);
      return page.locator('#transaction').getAttribute('class');
    }).toContain('success');
    await expect(page.locator('#match-result')).toHaveAttribute('data-state', 'refreshing');
    await expect(page.locator('#match-result')).toHaveAttribute('data-outcome', 'unresolved');
    await expect(page.locator('#result-score-label')).toHaveText('Locked territory counts');
    await page.evaluate(() => window.__matchWallet.releaseGrid());
    await expect(page.locator('#match-result')).toHaveAttribute('data-state', 'recorded');
  } finally {
    await provider.send('evm_setAutomine', [true]);
    await page.evaluate(() => window.__matchWallet.releaseGrid());
  }
  expect(await game.winner()).toBe(await bob.getAddress());
  await expect(page.locator('#match-result')).toHaveAttribute('data-outcome', 'defeat');
  await expect(page.locator('#final-score-one')).toHaveText('0');
  await expect(page.locator('#final-score-two')).toHaveText('3');
  await expect(page.locator('#finalize-match')).toBeHidden();
  for (const [viewer, kind] of [[bob, 'victory'], [alice, 'defeat'], [spectator, 'spectator']]) {
    await page.evaluate(address => window.__matchWallet.change(address), await viewer.getAddress());
    await expect(page.locator('#match-result')).toHaveAttribute('data-outcome', kind);
    await expect(page.locator('#result-title')).toHaveText('Ember holds the field.');
    await expect(page.locator('#match-result')).toHaveAttribute('data-faction', 'ember');
    for (const width of [360, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('#match-result').evaluate(section => {
        const bounds = section.getBoundingClientRect();
        return [...section.children].filter(child => child.getClientRects().length).every(child => {
          const rect = child.getBoundingClientRect(); return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
        });
      })).toBe(true);
    }
  }
  await page.locator('.result-controls a[href="#grid"]').click();
  await expect(page.locator('#grid')).toBeFocused();
  await cell(page, 0).click();
  await expect(page.locator('#selection-title')).toHaveText('Final territory.');
  await expect(page.locator('#claim')).toBeHidden();
});

test('rejected or reverted recording keeps feedback accurate and trusts another recorded draw', async ({ page }) => {
  await start(); await open(page); await expire();
  await expect(page.locator('#match-result')).toHaveAttribute('data-state', 'unrecorded');
  await page.evaluate(() => { window.__matchWallet.reject = true; });
  await page.locator('#finalize-match').click();
  await expect(page.locator('#match-result')).toHaveAttribute('data-state', 'recording-error');
  await expect(page.locator('#result-feedback')).toContainText('rejected');
  await expect(page.locator('#match-result')).toHaveAttribute('data-outcome', 'unresolved');
  await expect(page.locator('#finalize-match')).toBeEnabled();
  await page.evaluate(() => { window.__matchWallet.hold = true; });
  await page.locator('#finalize-match').click();
  await expect.poll(() => page.evaluate(() => typeof window.__matchWallet.release)).toBe('function');
  await (await game.connect(bob).finalize()).wait();
  await page.evaluate(() => window.__matchWallet.release());
  await expect(page.locator('#tx-title')).toHaveText('Move not completed.');
  await expect(page.locator('#match-result')).toHaveAttribute('data-state', 'recorded');
  await expect(page.locator('#match-result')).toHaveAttribute('data-outcome', 'draw');
  await expect(page.locator('#result-feedback')).toContainText('Move not completed.');
  await expect(page.locator('#result-feedback')).toHaveAttribute('data-kind', 'error');
});

test('a confirmed recording with unavailable snapshot shows no outcome until authoritative recovery', async ({ page }) => {
  await start(); await open(page); await expire();
  await expect(page.locator('#match-result')).toHaveAttribute('data-state', 'unrecorded');
  await page.evaluate(selector => {
    const original = window.ethereum.request.bind(window.ethereum), control = window.__matchWallet;
    control.failGrid = false;
    window.ethereum.request = async payload => {
      if (control.failGrid && payload.method === 'eth_call' && payload.params?.[0]?.data?.startsWith(selector)) throw new Error('Test result snapshot unavailable');
      const response = await original(payload);
      if (payload.method === 'eth_sendTransaction') control.failGrid = true;
      return response;
    };
  }, game.interface.getFunction('getGrid').selector);
  await page.locator('#finalize-match').click();
  await expect(page.locator('#transaction')).toHaveClass(/success/);
  await expect(page.locator('#match-result')).toHaveAttribute('data-state', 'unavailable');
  await expect(page.locator('#match-result')).toHaveAttribute('data-outcome', 'unresolved');
  await expect(page.locator('#result-scores')).toBeHidden();
  await expect(page.locator('#result-tx-link')).toBeVisible();
  await page.evaluate(() => { window.__matchWallet.failGrid = false; });
  await page.locator('#refresh').click();
  await expect(page.locator('#match-result')).toHaveAttribute('data-state', 'recorded');
  await expect(page.locator('#match-result')).toHaveAttribute('data-outcome', 'draw');
  await expect(page.locator('#result-recorded')).toHaveText('Draw recorded on-chain');
  await expect(page.locator('#final-score-one')).toHaveText('1');
  await expect(page.locator('#final-score-two')).toHaveText('1');
  for (const width of [360, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('#result-second-crest')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.result-emblem').evaluate(frame => {
      const bounds = frame.getBoundingClientRect();
      return [...frame.querySelectorAll('img')].every(image => {
        const rect = image.getBoundingClientRect(); return rect.left >= bounds.left && rect.right <= bounds.right;
      });
    })).toBe(true);
  }
  await page.locator('.result-controls a[href="#grid"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#grid')).toBeFocused();
});

test('complete Standard Bearer interface audit at six widths', async ({ page }, testInfo) => {
  await start(); await (await game.connect(bob).claim(1, 0)).wait();
  await mine(3); await (await game.reinforce(0, 0)).wait();
  await open(page);
  const baseline = process.env.PHASE8_BASELINE === '1';
  const measurements = [];
  for (const width of [360, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 800 : 1000 });
    await page.evaluate(() => document.fonts.ready);
    await page.keyboard.press('Escape');
    await cell(page, 0).click(); await page.locator('#attack').click(); await cell(page, 1).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`${baseline ? 'before' : 'after'}-${width}.png`), fullPage: true });
    const controls = await page.locator('button, a, summary, input, select').evaluateAll(elements => elements.filter(element => !element.classList.contains('tile') && element.getClientRects().length && Number(getComputedStyle(element).opacity) > 0).map(element => ({
      id: element.id || element.className, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
    })));
    const board = await page.locator('.map-wrap').boundingBox();
    measurements.push({ width, controls, boardWidth: board.width });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (!baseline) for (const control of controls) {
      expect(control.height, `${width}px ${control.id} height`).toBeGreaterThanOrEqual(44);
      expect(control.width, `${width}px ${control.id} width`).toBeGreaterThanOrEqual(44);
    }
    if (!baseline) {
      const clock = await page.locator('.match-clock-value').evaluate(element => ({ height: element.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(element).lineHeight) }));
      expect(clock.height).toBeLessThanOrEqual(clock.lineHeight + 1);
      expect(await page.locator('.tile.occupied').evaluateAll(tiles => {
        const rgb = text => text.match(/[\d.]+/g).slice(0, 3).map(Number);
        const luminance = colour => colour.reduce((sum, value, index) => {
          const channel = value / 255, linear = channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
          return sum + linear * [.2126, .7152, .0722][index];
        }, 0);
        return tiles.every(tile => {
          const style = getComputedStyle(tile), text = luminance(rgb(style.color)), background = luminance(rgb(style.backgroundColor));
          return style.opacity === '1' && (Math.max(text, background) + .05) / (Math.min(text, background) + .05) >= 4.5;
        });
      })).toBe(true);
    }
    await page.locator('#settings summary').click();
    const settings = await page.locator('#settings-form').boundingBox();
    expect(settings.x).toBeGreaterThanOrEqual(0); expect(settings.x + settings.width).toBeLessThanOrEqual(width);
    if (!baseline) {
      const close = await page.locator('#close-settings').boundingBox();
      expect(close.width).toBeGreaterThanOrEqual(44); expect(close.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#close-settings').click();
    await page.locator('#capture').scrollIntoViewIfNeeded();
    await expect(page.locator('#capture')).toBeInViewport();
    if (width < (baseline ? 760 : 900)) {
      const dock = await page.locator('#action-dock').boundingBox();
      const lastTile = await cell(page, 63).boundingBox();
      expect(lastTile.y + lastTile.height).toBeLessThanOrEqual(dock.y);
      await page.locator('#attack-preview').evaluate(element => element.scrollIntoView({ block: 'start' }));
      if (!baseline) {
        const preview = await page.locator('#attack-preview').boundingBox(), sticky = await page.locator('#action-dock').boundingBox();
        expect(preview.y).toBeGreaterThanOrEqual(sticky.y + sticky.height);
      }
    }
    await page.keyboard.press('Escape');
  }
  console.log(JSON.stringify(measurements));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await cell(page, 0).focus(); await page.keyboard.press('Enter');
  await expect(cell(page, 0)).toBeFocused();
  await expect(cell(page, 0)).toHaveCSS('outline-style', 'solid');
  await expect(cell(page, 0)).toHaveAttribute('aria-label', /A1: your tile, power 2/);
  await expect(cell(page, 0)).toHaveAttribute('aria-pressed', 'true');
  expect(await cell(page, 0).evaluate(tile => getComputedStyle(tile).animationName)).toBe('none');
});

test('choosing match mode for an old contract explains the mismatch', async ({ page }) => {
  const old = JSON.parse(await readFile(new URL('../artifacts/contracts/BlockConquest.sol/BlockConquest.json', import.meta.url), 'utf8'));
  game = await new ContractFactory(old.abi, old.bytecode, alice).deploy(10, 3, 5);
  await game.waitForDeployment();
  // open expects a loaded board, so perform setup with a caught expected timeout avoided.
  const opening = open(page);
  await expect(page.locator('#setup-message')).toContainText('not a two-player match contract');
  await page.locator('#open-settings').click();
  await page.locator('#board-mode').selectOption('open');
  await page.getByRole('button', { name: 'Load board', exact: true }).click();
  await opening;
  await expect(page.locator('#match-panel')).toBeHidden();
});
