import { test, expect } from '@playwright/test';
import { ContractFactory, JsonRpcProvider } from 'ethers';
import { readFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const artifact = JSON.parse(await readFile(new URL('../artifacts/contracts/BlockConquest.sol/BlockConquest.json', import.meta.url), 'utf8'));
let provider, game, alice, bob, carol, pageErrors;

test.beforeAll(() => { provider = new JsonRpcProvider('http://127.0.0.1:8545'); });
test.afterAll(() => provider.destroy());
test.beforeEach(async ({ page }) => {
  pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
  // Fresh contract per test; Hardhat 3 does not expose hardhat_reset.
  await provider.send('evm_setAutomine', [true]);
  [alice, bob, carol] = await Promise.all([0, 1, 2].map(i => provider.getSigner(i)));
  game = await new ContractFactory(artifact.abi, artifact.bytecode, alice).deploy(10, 3, 5);
  await game.waitForDeployment();
});
test.afterEach(() => expect(pageErrors).toEqual([]));

async function openBoard(page, { chain = '0x7a69', wallet = true } = {}) {
  const account = await alice.getAddress();
  const address = await game.getAddress();
  // Test-only EIP-1193 adapter forwards requests to the real local node's
  // unlocked test accounts. No private keys or test hooks enter the frontend.
  await page.exposeFunction('localWalletRpc', async (method, params) => {
    const response = await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || [] }) });
    return response.json();
  });
  await page.addInitScript(({ account, address, chain, wallet }) => {
    localStorage.setItem('block-conquest:board', JSON.stringify({ chain: 31337, address }));
    if (!wallet) return;
    const listeners = new Map();
    const control = { account, chain, connected: false, rejectNext: false, holdNext: false, release: null };
    const emit = (name, value) => (listeners.get(name) || []).forEach(fn => fn(value));
    window.__wallet = control;
    control.changeAccount = value => { control.account = value; control.connected = Boolean(value); emit('accountsChanged', value ? [value] : []); };
    control.changeChain = value => { control.chain = value; emit('chainChanged', value); };
    window.ethereum = {
      isMetaMask: true,
      on(name, fn) { listeners.set(name, [...(listeners.get(name) || []), fn]); },
      removeListener(name, fn) { listeners.set(name, (listeners.get(name) || []).filter(f => f !== fn)); },
      async request({ method, params }) {
        if (method === 'eth_chainId') return control.chain;
        if (method === 'eth_accounts') return control.connected ? [control.account] : [];
        if (method === 'eth_requestAccounts') { control.connected = true; return [control.account]; }
        if (method === 'wallet_switchEthereumChain') { control.changeChain(params[0].chainId); return null; }
        if (method === 'eth_sendTransaction') {
          if (control.rejectNext) { control.rejectNext = false; throw Object.assign(new Error('User rejected request'), { code: 4001 }); }
          if (control.holdNext) { control.holdNext = false; await new Promise(resolve => { control.release = resolve; }); }
        }
        const result = await window.localWalletRpc(method, params);
        if (result.error) throw result.error;
        return result.result;
      },
    };
  }, { account, address, chain, wallet });
  await page.goto('/');
  await expect(page.locator('.tile')).toHaveCount(64);
}

async function connect(page) {
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.locator('#grid')).toHaveAttribute('data-ready', 'true');
}
const cell = (page, index) => page.locator(`.tile[data-index="${index}"]`);
async function mine(blocks) { await provider.send('hardhat_mine', [`0x${blocks.toString(16)}`]); }
async function reinforce(x, y, signer = alice) { await mine(2); await (await game.connect(signer).reinforce(x, y, { gasLimit: 200_000 })).wait(); }

test('connect, claim, wait for cooldown, reinforce, and show decay on new blocks', async ({ page }) => {
  await openBoard(page); await connect(page);
  await expect(page.locator('#my-score')).toHaveText('0');
  await cell(page, 0).click(); await page.locator('#claim').click();
  await expect(page.locator('#tx-title')).toHaveText('Claim confirmed.');
  await expect(page.locator('#my-score')).toHaveText('1');
  await expect(page.locator('#leaderboard')).toContainText('1 tile');
  await expect(page.locator('#reinforce')).toBeDisabled();
  await mine(3);
  await expect(page.locator('#reinforce')).toBeEnabled();
  await page.locator('#reinforce').click();
  await expect(page.locator('#tx-title')).toHaveText('Reinforcement confirmed.');
  await expect(cell(page, 0)).toHaveAttribute('aria-label', /power 2/);
  await mine(10);
  await expect(cell(page, 0)).toHaveAttribute('aria-label', /power 1/);
  await expect(page.locator('#my-score')).toHaveText('1');
});

test('attack uses selected source and adjacent target, updates board and leaderboard', async ({ page }) => {
  await (await game.claim(0, 0)).wait();
  await reinforce(0, 0); await reinforce(0, 0);
  await (await game.connect(bob).claim(1, 0)).wait();
  await (await game.connect(bob).claim(1, 1)).wait();
  await openBoard(page); await connect(page);
  await cell(page, 0).click(); await page.locator('#attack').click();
  await cell(page, 9).click();
  await expect(page.locator('#tx-detail')).toContainText('orthogonally adjacent');
  await expect(page.locator('#capture')).toBeDisabled();
  await cell(page, 1).click();
  await expect(page.locator('#capture')).toBeEnabled();
  await page.locator('#capture').click();
  await expect(page.locator('#tx-title')).toHaveText('Attack confirmed.');
  await expect(page.locator('#my-score')).toHaveText('2');
  await expect(cell(page, 1)).toHaveAttribute('aria-label', /your tile, power 1/);
  await expect(cell(page, 0)).toHaveAttribute('aria-label', /power 2/);
  await expect(page.locator('#leaderboard li')).toHaveCount(2);
  expect((await game.getTile(1, 0)).owner).toBe(await alice.getAddress());
});

test('rejecting a wallet request restores controls and leaves the tile empty', async ({ page }) => {
  await openBoard(page); await connect(page);
  await cell(page, 0).click();
  await page.evaluate(() => { window.__wallet.rejectNext = true; });
  await page.locator('#claim').click();
  await expect(page.locator('#tx-detail')).toContainText('rejected the wallet request');
  await expect(page.locator('#claim')).toBeEnabled();
  await expect(page.locator('#my-score')).toHaveText('0');
});

test('wallet confirmation and pending states lock actions until the receipt', async ({ page }) => {
  await openBoard(page); await connect(page); await cell(page, 0).click();
  await page.evaluate(() => { window.__wallet.holdNext = true; });
  await page.locator('#claim').click();
  await expect(page.locator('#tx-title')).toHaveText('Confirm in MetaMask.');
  await expect(page.locator('#claim')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => Boolean(window.__wallet.release))).toBe(true);
  await provider.send('evm_setAutomine', [false]);
  try {
    await page.evaluate(() => window.__wallet.release());
    await expect(page.locator('#tx-title')).toHaveText('Transaction pending.');
    await expect(page.locator('#claim')).toBeDisabled();
    await mine(1);
    await expect(page.locator('#tx-title')).toHaveText('Claim confirmed.');
  } finally { await provider.send('evm_setAutomine', [true]); }
});

test('account and network changes clear selection and gate actions', async ({ page }) => {
  await (await game.claim(0, 0)).wait();
  await openBoard(page); await connect(page); await cell(page, 0).click();
  await page.evaluate(account => window.__wallet.changeAccount(account), await bob.getAddress());
  await expect(page.locator('#my-score')).toHaveText('0');
  await expect(page.locator('#selection-title')).toHaveText('Pick your territory.');
  await cell(page, 0).click(); await expect(page.locator('#selection-title')).toHaveText('Enemy territory.');
  await page.evaluate(() => window.__wallet.changeChain('0x1'));
  await expect(page.locator('#network-notice')).toBeVisible();
  await expect(cell(page, 0)).toBeDisabled();
  await page.locator('#switch-network').click();
  await expect(page.locator('#grid')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#network-notice')).toBeHidden();
  await page.evaluate(() => window.__wallet.changeAccount(null));
  await expect(page.locator('#connect')).toHaveText('Connect wallet ↗');
  await expect(cell(page, 0)).toBeDisabled();
});

test('missing wallet and invalid/legacy board settings show clear errors', async ({ page }) => {
  await openBoard(page, { wallet: false });
  await page.locator('#connect').click();
  await expect(page.locator('#tx-detail')).toContainText('Install or unlock MetaMask');
  await page.locator('#open-settings').click();
  await page.locator('#address').fill('invalid'); await page.getByRole('button', { name: 'Load board' }).click();
  await expect(page.locator('#settings-error')).toContainText('valid, non-zero');
  await page.locator('#chain').selectOption('11155111');
  await page.locator('#address').fill('0x5A6dB2fA7424F519a10805c48EF33F4eA141A9c9');
  await page.getByRole('button', { name: 'Load board' }).click();
  await expect(page.locator('#settings-error')).toContainText('throwaway');
});

test('network mismatch on connection can be corrected before playing', async ({ page }) => {
  await openBoard(page, { chain: '0x1' });
  await page.locator('#connect').click();
  await expect(page.locator('#network-notice')).toBeVisible();
  await expect(cell(page, 0)).toBeDisabled();
  await page.locator('#switch-network').click();
  await expect(page.locator('#grid')).toHaveAttribute('data-ready', 'true');
});

test('an attack that becomes invalid during wallet confirmation shows the contract error', async ({ page }) => {
  await (await game.claim(0, 0)).wait(); await reinforce(0, 0);
  await (await game.connect(bob).claim(1, 0)).wait();
  await openBoard(page); await connect(page);
  await cell(page, 0).click(); await page.locator('#attack').click(); await cell(page, 1).click();
  await page.evaluate(() => { window.__wallet.holdNext = true; });
  await page.locator('#capture').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__wallet.release))).toBe(true);
  await mine(10);
  await page.evaluate(() => window.__wallet.release());
  await expect(page.locator('#tx-detail')).toContainText('strictly greater effective power');
  await expect(page.locator('#tx-title')).toHaveText('Move not completed.');
  expect((await game.getTile(1, 0)).owner).toBe(await bob.getAddress());
});

test('an address without deployed code is blocked', async ({ page }) => {
  await openBoard(page); await connect(page);
  await page.locator('summary').click();
  await page.locator('#address').fill(await bob.getAddress());
  await page.getByRole('button', { name: 'Load board' }).click();
  await expect(page.locator('#tx-detail')).toContainText('No contract exists');
  await expect(cell(page, 0)).toBeDisabled();
});

test('the documented local deployment command deploys the current contract', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ['scripts/local-deploy.mjs']);
  const address = stdout.match(/Local Block Conquest: (0x[0-9a-fA-F]{40})/)?.[1];
  expect(address).toBeTruthy();
  const deployed = game.attach(address);
  expect(await deployed.decayInterval()).toBe(10n);
  expect(await deployed.reinforcementCooldown()).toBe(3n);
  expect(await deployed.maxPower()).toBe(5n);
});

test('changing account during wallet confirmation does not show a stale success', async ({ page }) => {
  await openBoard(page); await connect(page); await cell(page, 0).click();
  await page.evaluate(() => { window.__wallet.holdNext = true; });
  await page.locator('#claim').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__wallet.release))).toBe(true);
  await page.evaluate(account => window.__wallet.changeAccount(account), await bob.getAddress());
  await expect(page.locator('#grid')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#tx-title')).toHaveText('Wallet or board changed.');
  await page.evaluate(() => window.__wallet.release());
  await expect.poll(async () => (await game.getTile(0, 0)).owner).toBe(await alice.getAddress());
  await expect(page.locator('#my-score')).toHaveText('0');
  await expect(page.locator('#tx-title')).toHaveText('Wallet or board changed.');
});

test('live board screenshots, keyboard navigation, and mobile layout', async ({ page }) => {
  for (const [signer, coordinates] of [
    [alice, [[1, 2], [2, 2], [1, 3], [2, 3], [3, 3], [2, 4]]],
    [bob, [[4, 2], [5, 2], [4, 3], [5, 3], [5, 4]]],
    [carol, [[3, 5], [4, 5], [3, 6], [4, 6]]],
  ]) for (const [x, y] of coordinates) await (await game.connect(signer).claim(x, y)).wait();
  await reinforce(3, 3); await reinforce(3, 3); await reinforce(3, 3);
  await reinforce(4, 3, bob);
  await openBoard(page); await connect(page);
  await cell(page, 27).focus(); await page.keyboard.press('ArrowRight'); await expect(cell(page, 28)).toBeFocused();
  await cell(page, 27).click();
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/local-board-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/local-board-mobile.png', fullPage: true });
  await expect(page.locator('#attack')).toBeEnabled();
  expect(pageErrors).toEqual([]);
});
