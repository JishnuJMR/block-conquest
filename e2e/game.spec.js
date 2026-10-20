import { test, expect } from '@playwright/test';
import { Contract, ContractFactory, JsonRpcProvider } from 'ethers';
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
    const control = { account, chain, connected: false, rejectNext: false, holdNext: false, release: null, revokeUnsupported: false, revokeCount: 0 };
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
        if (method === 'wallet_revokePermissions') {
          control.revokeCount++;
          if (control.revokeUnsupported) throw Object.assign(new Error('Unsupported method'), { code: 4200 });
          control.connected = false; emit('accountsChanged', []); return null;
        }
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
  await expect(page.locator('#tile-cooldown')).toHaveText('Ready in 3 blocks');
  await expect(page.locator('#tile-decay')).toHaveText('Minimum power reached');
  await mine(3);
  await expect(page.locator('#reinforce')).toBeEnabled();
  await page.locator('#reinforce').click();
  await expect(page.locator('#tx-title')).toHaveText('Reinforcement confirmed.');
  await expect(cell(page, 0)).toHaveAttribute('aria-label', /power 2/);
  await expect(page.locator('#tile-decay')).toHaveText('Next power loss in 10 blocks');
  await mine(9);
  await expect(page.locator('#tile-decay')).toHaveText('Next power loss in 1 block');
  await mine(1);
  await expect(cell(page, 0)).toHaveAttribute('aria-label', /power 1/);
  await expect(page.locator('#tile-decay')).toHaveText('Minimum power reached');
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
  await expect(page.locator('#preview-source')).toHaveText('3');
  await expect(page.locator('#preview-defender')).toHaveText('1');
  await expect(page.locator('#preview-remaining')).toHaveText('2');
  await expect(page.locator('#preview-result')).toHaveText('B1 becomes yours with 1 power.');
  await expect(page.locator('.preview-note')).toContainText('when your transaction is included');
  await page.locator('#capture').click();
  await expect(page.locator('#tx-title')).toHaveText('Attack confirmed.');
  await expect(cell(page, 1)).toHaveClass(/just-captured/);
  await expect(cell(page, 1)).toHaveCSS('animation-name', 'capture-pulse');
  await expect(page.locator('#my-score')).toHaveText('2');
  await expect(cell(page, 1)).toHaveAttribute('aria-label', /your tile, power 1/);
  await expect(cell(page, 0)).toHaveAttribute('aria-label', /power 2/);
  await expect(page.locator('#leaderboard li')).toHaveCount(2);
  expect((await game.getTile(1, 0)).owner).toBe(await alice.getAddress());
  await expect(cell(page, 1)).not.toHaveClass(/just-captured/);
});

test('instructions persist and ownership labels survive reloads and account changes', async ({ page }) => {
  await (await game.claim(0, 0)).wait();
  await (await game.connect(bob).claim(1, 0)).wait();
  await openBoard(page); await connect(page);
  await expect(page.locator('#conquest-guide')).toBeVisible();
  await page.locator('#dismiss-guide').click();
  await expect(page.locator('#conquest-guide')).toBeHidden();
  await expect(page.locator('#show-guide')).toBeFocused();
  const pattern = await cell(page, 0).getAttribute('data-pattern');
  const marker = await cell(page, 0).locator('.owner-marker').textContent();
  const other = await cell(page, 1).locator('.owner-marker').textContent();
  expect(marker).not.toBe(other);
  await expect(page.locator('#leaderboard')).toContainText(marker);
  await expect(page.locator('.territory-share').first()).toHaveText('1.6% of board');
  await page.reload(); await connect(page);
  await expect(page.locator('#conquest-guide')).toBeHidden();
  await expect(cell(page, 0).locator('.owner-marker')).toHaveText(marker);
  await page.evaluate(account => window.__wallet.changeAccount(account), await bob.getAddress());
  await expect(cell(page, 1)).toHaveAttribute('aria-label', /your tile/);
  await expect(cell(page, 0).locator('.owner-marker')).toHaveText(/^P\d+$/);
  await expect(cell(page, 1).locator('.owner-marker')).toHaveText('You');
  await expect(cell(page, 0)).toHaveAttribute('data-pattern', pattern);
  await page.locator('#show-guide').click();
  await expect(page.locator('#conquest-guide')).toBeVisible();
});

test('attack preview expires when new-block decay makes the selected target too strong', async ({ page }) => {
  await (await game.claim(0, 0)).wait(); await reinforce(0, 0);
  await (await game.connect(bob).claim(1, 0)).wait();
  await openBoard(page); await connect(page);
  await cell(page, 0).click(); await page.locator('#attack').click(); await cell(page, 1).click();
  await expect(page.locator('#attack-preview')).toBeVisible();
  await mine(10);
  await expect(page.locator('#attack-preview')).toBeHidden();
  await expect(page.locator('#capture')).toBeDisabled();
  await expect(page.locator('#selection-title')).toHaveText('Choose an enemy.');
});

test('confirmed captures respect reduced motion and retain confirmation feedback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await (await game.claim(0, 0)).wait(); await reinforce(0, 0);
  await (await game.connect(bob).claim(1, 0)).wait();
  await openBoard(page); await connect(page);
  await cell(page, 0).click(); await page.locator('#attack').click(); await cell(page, 1).click();
  await page.locator('#capture').click();
  await expect(page.locator('#tx-title')).toHaveText('Attack confirmed.');
  await expect(cell(page, 1)).toHaveClass(/just-captured/);
  await expect(cell(page, 1)).toHaveCSS('animation-name', 'none');
  await expect(cell(page, 1)).toHaveAttribute('aria-label', /your tile, power 1/);
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
  const address = stdout.match(/Local Block Conquest match: (0x[0-9a-fA-F]{40})/)?.[1];
  expect(address).toBeTruthy();
  const deployed = new Contract(address, ['function decayInterval() view returns (uint256)', 'function reinforcementCooldown() view returns (uint256)', 'function maxPower() view returns (uint256)', 'function matchDuration() view returns (uint256)', 'function phase() view returns (uint8)'], provider);
  expect(await deployed.decayInterval()).toBe(10n);
  expect(await deployed.reinforcementCooldown()).toBe(3n);
  expect(await deployed.maxPower()).toBe(5n);
  expect(await deployed.matchDuration()).toBe(100n);
  expect(await deployed.phase()).toBe(0n);
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
  await page.locator('#dismiss-guide').click();
  await page.locator('#attack').click(); await cell(page, 28).click();
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/local-board-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/screenshots/local-board-mobile.png', fullPage: true });
  await expect(page.locator('#capture')).toBeEnabled();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('.occupied').evaluateAll(tiles => tiles.every(tile => {
    const bounds = tile.getBoundingClientRect();
    return [...tile.children].every(child => {
      const rect = child.getBoundingClientRect();
      return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
    });
  }))).toBe(true);
  expect(pageErrors).toEqual([]);
});

test('disconnect revokes wallet access, unloads the board and allows explicit reconnection', async ({ page }) => {
  await (await game.claim(0, 0)).wait();
  await openBoard(page); await connect(page); await cell(page, 0).click();
  await page.locator('#disconnect').click();
  await expect(page.locator('#tx-title')).toHaveText('Wallet disconnected.');
  await expect(page.locator('#grid')).toHaveAttribute('data-ready', 'false');
  await expect(page.locator('#board-unloaded')).toBeVisible();
  await expect(page.locator('#connect')).toBeEnabled();
  expect(await page.evaluate(() => window.__wallet.revokeCount)).toBe(1);
  expect(await page.evaluate(() => window.__wallet.connected)).toBe(false);
  await page.evaluate(account => window.__wallet.changeAccount(account), await bob.getAddress());
  await expect(page.locator('#grid')).toHaveAttribute('data-ready', 'false');
  await page.reload();
  await expect(page.locator('#grid')).toHaveAttribute('data-ready', 'false');
  await connect(page);
  await expect(page.locator('#my-score')).toHaveText('1');
});

test('unsupported permission revocation disconnects locally and explains the manual step', async ({ page }) => {
  await openBoard(page); await connect(page);
  await page.evaluate(() => { window.__wallet.revokeUnsupported = true; });
  await page.locator('#disconnect').click();
  await expect(page.locator('#tx-title')).toHaveText('Disconnected from this app.');
  await expect(page.locator('#tx-detail')).toContainText('Dapp connections');
  await expect(page.locator('#grid')).toHaveAttribute('data-ready', 'false');
  await page.evaluate(() => window.__wallet.changeChain('0x7a69'));
  await expect(page.locator('#connect')).toHaveText('Connect wallet ↗');
  await connect(page);
});

test('disconnect during wallet confirmation prevents a stale UI result', async ({ page }) => {
  await openBoard(page); await connect(page); await cell(page, 0).click();
  await page.evaluate(() => { window.__wallet.holdNext = true; });
  await page.locator('#claim').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__wallet.release))).toBe(true);
  await page.locator('#disconnect').click();
  await expect(page.locator('#tx-detail')).toContainText('may still confirm');
  await page.evaluate(() => window.__wallet.release());
  await expect.poll(async () => (await game.getTile(0, 0)).owner).toBe(await alice.getAddress());
  await expect(page.locator('#grid')).toHaveAttribute('data-ready', 'false');
  await expect(page.locator('#tx-title')).toHaveText('Wallet disconnected.');
});

test('keyboard attack selection and Escape work, and custom configuration drives instructions', async ({ page }) => {
  game = await new ContractFactory(artifact.abi, artifact.bytecode, alice).deploy(20, 4, 7);
  await game.waitForDeployment();
  await (await game.claim(0, 0)).wait(); await mine(4); await (await game.reinforce(0, 0)).wait();
  await (await game.connect(bob).claim(1, 0)).wait();
  await openBoard(page); await connect(page);
  await expect(page.locator('#guide-build')).toContainText('up to 7');
  await expect(page.locator('#guide-build')).toContainText('4 blocks');
  await expect(page.locator('#rule-decay')).toContainText('every 20 blocks');
  await cell(page, 0).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#selection-coordinate')).toHaveText('A1');
  await page.keyboard.press('Tab'); // Disabled reinforce is skipped; next action is attack.
  await expect(page.locator('#attack')).toBeFocused();
  await page.keyboard.press('Enter');
  // Attack entry returns focus to its source for arrow-key target selection.
  await expect(cell(page, 0)).toBeFocused();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await expect(page.locator('#attack-preview')).toBeVisible();
  await expect(page.locator('#attack-line')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#attack-preview')).toBeHidden();
  await expect(cell(page, 0)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#selection-coordinate')).toHaveText('—');
  await page.locator('#settings summary').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#settings')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings')).not.toHaveAttribute('open');
  await expect(page.locator('#settings summary')).toBeFocused();
});

test('a three-tile board remains legible and its primary action is reachable at 360×640', async ({ page }) => {
  await (await game.claim(7, 0)).wait();
  await (await game.claim(6, 0)).wait();
  await (await game.connect(bob).claim(6, 1)).wait();
  await openBoard(page); await connect(page); await cell(page, 7).click();
  await page.screenshot({ path: 'docs/screenshots/atlas-sparse-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await cell(page, 0).click();
  const button = await page.locator('#claim').boundingBox();
  expect(button.y).toBeGreaterThanOrEqual(0);
  expect(button.y + button.height).toBeLessThanOrEqual(640);
  await expect(page.locator('#dock-context')).toContainText('A1');
  await page.screenshot({ path: 'docs/screenshots/atlas-sparse-mobile.png', fullPage: true });
  await page.screenshot({ path: 'docs/screenshots/atlas-mobile-viewport.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#claim').click();
  await expect(page.locator('#tx-title')).toHaveText('Claim confirmed.');
  await expect(page.locator('#dock-feedback')).toHaveText('Claim confirmed.');
});

test('six factions have distinct greyscale patterns and retain readable labels', async ({ page }) => {
  for (let i = 0; i < 6; i++) {
    const signer = await provider.getSigner(i), x = 1 + (i % 3) * 2, y = 1 + Math.floor(i / 3) * 3;
    await (await game.connect(signer).claim(x, y)).wait();
    await (await game.connect(signer).claim(x, y + 1)).wait();
  }
  await openBoard(page); await connect(page);
  await expect(page.locator('#leaderboard li')).toHaveCount(6);
  const patterns = await page.locator('.occupied').evaluateAll(tiles => new Set(tiles.map(tile => getComputedStyle(tile).backgroundImage)).size);
  expect(patterns).toBe(6);
  await page.addStyleTag({ content: 'html { filter: grayscale(1); }' });
  await page.screenshot({ path: 'docs/screenshots/atlas-six-factions-greyscale.png', fullPage: true });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.screenshot({ path: 'docs/screenshots/atlas-six-factions-mobile-greyscale.png', fullPage: true });
  expect(await page.locator('.occupied').evaluateAll(tiles => tiles.every(tile => {
    const rect = tile.getBoundingClientRect();
    return [...tile.children].every(child => { const childRect = child.getBoundingClientRect(); return childRect.top >= rect.top && childRect.bottom <= rect.bottom; });
  }))).toBe(true);
});
