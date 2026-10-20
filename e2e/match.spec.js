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
  await expect(page.locator('#match-detail')).toContainText('You are watching');
  await expect(page.locator('#join-match')).toBeHidden();
  await cell(page, 1).click();
  await expect(page.locator('#selection-title')).toHaveText('Spectator view.');
  await expect(page.locator('#claim')).toBeHidden();
  await expire();
  await expect(page.locator('#match-title')).toHaveText('Match drawn.');
  await page.locator('#finalize-match').click();
  await expect(page.locator('#tx-title')).toHaveText('Result confirmed.');
  await expect(page.locator('#match-detail')).toContainText('Final result recorded');
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
  await expect(page.locator('#match-title')).toHaveText('You win.');
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
  await page.locator('#join-match').click();
  await expect(page.locator('#match-title')).toHaveText('Waiting for player two.');
});

test('a held claim that lands after the deadline fails without changing scores', async ({ page }) => {
  await start(); await open(page);
  await cell(page, 1).click();
  await page.evaluate(() => { window.__matchWallet.hold = true; });
  await page.locator('#claim').click();
  await expect.poll(() => page.evaluate(() => typeof window.__matchWallet.release)).toBe('function');
  await expire();
  await page.evaluate(() => window.__matchWallet.release());
  await expect(page.locator('#tx-title')).toHaveText('Move not completed.');
  await expect(page.locator('#match-title')).toHaveText('Match drawn.');
  expect(await game.scoreOf(await alice.getAddress())).toBe(1n);
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
  await expect(page.locator('#claim')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expire();
  await page.locator('#finalize-match').scrollIntoViewIfNeeded();
  await expect(page.locator('#finalize-match')).toBeInViewport();
  await page.locator('#finalize-match').click();
  await expect(page.locator('#match-detail')).toContainText('Final result recorded');
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
