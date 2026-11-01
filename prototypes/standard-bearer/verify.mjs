// Prototype-only browser checks. Start Vite on 5180 first. No blockchain node.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
const images = new URL('./screenshots/', import.meta.url);
const captureScreenshots = !process.argv.includes('--no-screenshots');
if (captureScreenshots) await mkdir(images, { recursive: true });
const errors = [], externalRequests = [];
const context = await browser.newContext();
// Keep dev-server file notifications from reloading a paused-clock screenshot
// session. Production modules and all prototype interactions still run normally.
await context.route('**/@vite/client', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
context.on('page', page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:5180/') && !request.url().startsWith('data:')) externalRequests.push(request.url());
  });
});
async function open(width, height, scene = 'midgame', alternateRules = false) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  if (alternateRules) {
    const fixture = await readFile(new URL('./mock-data.js', import.meta.url), 'utf8');
    await page.route('**/mock-data.js', route => route.fulfill({ contentType: 'text/javascript', body: fixture.replace('cap: 5, cooldown: 3, decay: 10, duration: 100', 'cap: 4, cooldown: 2, decay: 8, duration: 80') }));
  }
  await page.goto(`http://127.0.0.1:5180/?scene=${scene}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const tile = (page, coordinate) => page.locator(`.tile[data-index="${'ABCDEFGH'.indexOf(coordinate[0]) + (Number(coordinate[1]) - 1) * 8}"]`);
async function screenshot(page, name, fullPage = true) {
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  if (captureScreenshots) await page.screenshot({ path: fileURLToPath(new URL(name, images)), fullPage, animations: 'disabled' });
}
async function completeMockAction(page) { await page.locator('#primary-action').click(); await page.clock.runFor(1000); }
async function scene(page, value) { await page.selectOption('#scene', value); }
async function assertSafeMobileDock(page, width) {
  const geometry = await page.evaluate(() => {
    const grid = document.querySelector('.board').getBoundingClientRect();
    const dock = document.querySelector('.action-dock').getBoundingClientRect();
    const tiles = [...document.querySelectorAll('.tile')].map(el => el.getBoundingClientRect());
    return { overflow: document.documentElement.scrollWidth > innerWidth, gridBottom: grid.bottom, gridTop: grid.top,
      dockTop: dock.top, dockBottom: dock.bottom, tileSize: Math.min(...tiles.map(t => Math.min(t.width, t.height))) };
  });
  assert.equal(geometry.overflow, false, `No overflow at ${width}px`);
  assert.ok(geometry.tileSize >= 24, `Tile targets >=24px at ${width}px`);
  assert.ok(geometry.gridBottom <= 0 || geometry.dockTop >= geometry.gridBottom - 1, `Dock never covers row eight at ${width}px`);
  assert.equal(await page.locator('#primary-action').count(), 1, 'One DOM action button, moved between layouts');
  assert.equal(await page.locator('button.primary:visible').count(), 1, 'No duplicate primary actions');
  assert.equal(await page.locator('#action-dock').evaluate(el => el.parentElement.classList.contains('workspace')), true);
  return geometry;
}

try {
  const page = await open(1440, 1000);
  assert.equal(await page.locator('.tile').count(), 64);
  assert.equal(await page.locator('#score-one').textContent(), '14');
  assert.equal(await page.locator('#score-two').textContent(), '11');
  assert.equal(await page.locator('#remaining-power').textContent(), '2');
  assert.equal(await page.locator('#attack-arrow').isVisible(), true);
  assert.equal(await page.locator('#attack-underlay').getAttribute('x1'), await page.locator('#attack-path').getAttribute('x1'));
  assert.equal(await tile(page, 'D5').evaluate(el => el.classList.contains('attackable')), true);
  assert.equal(await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(el => el.id); return new Set(ids).size === ids.length;
  }), true, 'No duplicated element IDs');
  assert.doesNotMatch(await page.locator('body').innerText(), /your turn|your move|next turn|end turn/i);
  await screenshot(page, 'desktop.png');
  if (captureScreenshots) await page.locator('.brand').screenshot({ path: fileURLToPath(new URL('brand.png', images)) });

  await tile(page, 'D5').click();
  assert.equal(await page.locator('#preview-route').textContent(), 'D4 → D5');
  assert.equal(await page.locator('#remaining-power').textContent(), '3');
  await tile(page, 'F4').click();
  assert.match(await page.locator('#move-status').textContent(), /directly above/);
  await page.locator('#secondary-action').click();
  assert.equal(await page.locator('#attack-preview').isVisible(), false);
  assert.equal(await tile(page, 'D4').getAttribute('aria-pressed'), 'true');
  await screenshot(page, 'gameplay-desktop.png');
  await page.locator('#secondary-action').click(); await tile(page, 'E4').click();
  await page.locator('#primary-action').click();
  assert.equal(await page.locator('.tile.pending').count(), 2);
  assert.equal(await page.locator('#board').getAttribute('aria-busy'), 'true');
  assert.equal(await tile(page, 'E4').locator('.owner').textContent(), 'P2', 'Pending must not change ownership');
  assert.equal(await page.locator('#score-one').textContent(), '14');
  assert.equal(await page.locator('#secondary-action').isDisabled(), true);
  await screenshot(page, 'pending-desktop.png');
  await page.clock.runFor(1000);
  assert.equal(await tile(page, 'D4').locator('.power').textContent(), '2');
  assert.equal(await tile(page, 'E4').locator('.power').textContent(), '1');
  assert.equal(await tile(page, 'E4').locator('.owner').textContent(), 'You');
  assert.equal(await page.locator('#score-one').textContent(), '15');
  assert.equal(await page.locator('#score-two').textContent(), '10');
  assert.equal(await page.locator('.tile.pending').count(), 0);
  assert.match(await page.locator('#move-status').textContent(), /capture confirmed/);
  assert.match(await tile(page, 'E4').evaluate(el => getComputedStyle(el).animationName), /capture-frame/);
  await screenshot(page, 'capture-confirmed.png');
  assert.equal(await page.locator('#primary-action').isDisabled(), true);
  await page.locator('#clock-toggle').click(); await page.clock.runFor(4500); await page.locator('#clock-toggle').click();
  assert.equal(await page.locator('#blocks-left').textContent(), '64');
  assert.equal(await page.locator('#primary-action').isEnabled(), true);
  await completeMockAction(page);
  assert.equal(await tile(page, 'E4').locator('.power').textContent(), '2');
  await tile(page, 'H1').click(); await completeMockAction(page);
  assert.equal(await tile(page, 'H1').locator('.owner').textContent(), 'You');
  assert.equal(await page.locator('#score-one').textContent(), '16');
  await tile(page, 'C3').click(); assert.match(await page.locator('#primary-action').textContent(), /At power cap/);

  await tile(page, 'A1').focus(); await page.keyboard.press('ArrowLeft');
  assert.equal(await tile(page, 'A1').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  assert.equal(await tile(page, 'B1').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('has-selection')), false);
  await page.locator('#guide-open').click(); assert.equal(await page.locator('#field-guide').isVisible(), true);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#field-guide').isVisible(), false);

  await scene(page, 'opening');
  assert.equal(await page.locator('#claimed-count').textContent(), '3');
  assert.equal(await page.locator('#score-one').textContent(), '2');
  await screenshot(page, 'opening-desktop.png');
  for (const value of ['claim', 'reinforce']) {
    await scene(page, value);
    const coordinate = value === 'claim' ? 'C6' : 'C3';
    const beforeScore = await page.locator('#score-one').textContent();
    const beforePower = value === 'claim' ? '0' : await tile(page, coordinate).locator('.power').textContent();
    await screenshot(page, `${value}-ready.png`);
    await page.locator('#primary-action').click();
    assert.equal(await page.locator('#score-one').textContent(), beforeScore, 'No early score change');
    if (value === 'reinforce') assert.equal(await tile(page, coordinate).locator('.power').textContent(), beforePower, 'No early power change');
    await page.clock.runFor(1000);
    assert.equal(await tile(page, coordinate).locator('.power').textContent(), value === 'claim' ? '1' : '4');
    assert.equal(await page.locator('#feedback').getAttribute('data-action'), value);
    assert.equal(await tile(page, coordinate).evaluate((el, kind) => el.classList.contains(`confirmed-${kind}`), value), true);
    await screenshot(page, `${value}-confirmed.png`);
    if (captureScreenshots) await page.locator('.inspector').screenshot({ path: fileURLToPath(new URL(`${value}-feedback.png`, images)), animations: 'disabled' });
  }
  await scene(page, 'midgame');
  const beforeFailure = await page.locator('#board').innerText();
  await page.locator('#fail-next').check();
  await completeMockAction(page);
  assert.equal(await page.locator('#board').innerText(), beforeFailure, 'Failed capture preserves territory and power');
  assert.equal(await page.locator('#score-one').textContent(), '14');
  assert.equal(await page.locator('#score-two').textContent(), '11');
  assert.equal(await page.locator('#feedback-title').textContent(), 'Action not confirmed.');
  assert.equal(await page.locator('#primary-action').isEnabled(), true);
  await screenshot(page, 'failure-desktop.png');
  if (captureScreenshots) await page.locator('.inspector').screenshot({ path: fileURLToPath(new URL('failure-feedback.png', images)), animations: 'disabled' });
  await completeMockAction(page);
  assert.equal(await page.locator('#score-one').textContent(), '15', 'Retry succeeds after failed mock action');
  await scene(page, 'midgame');
  await page.locator('#primary-action').click(); await scene(page, 'opening'); await page.clock.runFor(2000);
  assert.equal(await page.locator('#claimed-count').textContent(), '3', 'Reset cancels an old pending callback');
  await scene(page, 'midgame');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await completeMockAction(page);
  assert.equal(await tile(page, 'E4').evaluate(el => getComputedStyle(el).animationName), 'none');
  assert.equal(await tile(page, 'E4').locator('.capture-flash').evaluate(el => getComputedStyle(el).display), 'none');
  assert.match(await page.locator('#move-status').textContent(), /confirmed/);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await scene(page, 'midgame');
  await page.locator('#clock-toggle').click(); await page.clock.runFor(40500); await page.locator('#clock-toggle').click();
  assert.equal(await page.locator('#attack-preview').isVisible(), false, 'Decay invalidates an estimate');
  await tile(page, 'E4').click(); assert.match(await page.locator('#move-status').textContent(), /Equal power/);
  await scene(page, 'midgame');
  await page.locator('#clock-toggle').click(); await page.clock.runFor(110000);
  assert.equal(await page.locator('#blocks-left').textContent(), '0');
  assert.equal(await page.locator('#match-result').isVisible(), true);
  assert.match(await page.locator('#result-recorded').textContent(), /NOT RECORDED/);
  assert.equal(await page.locator('#action-dock').isVisible(), false);
  const frozenBoard = await page.locator('#board').innerText();
  await page.clock.runFor(20000); assert.equal(await page.locator('#board').innerText(), frozenBoard);
  await page.locator('#fail-next').check();
  await page.locator('#record-result').click();
  await page.clock.runFor(1000);
  assert.equal(await page.locator('#record-result').isEnabled(), true);
  assert.equal(await page.locator('#result-feedback').isVisible(), true, 'A failed result recording remains visible outside the hidden gameplay dock');
  assert.match(await page.locator('#result-recorded').textContent(), /NOT RECORDED/);
  await page.locator('#record-result').click();
  assert.match(await page.locator('#result-recorded').textContent(), /PENDING/);
  await page.clock.runFor(1000);
  assert.equal(await page.locator('#record-result').isVisible(), false);
  assert.match(await page.locator('#result-recorded').textContent(), /MOCK RESULT RECORDED/);

  await scene(page, 'midgame');
  await page.locator('#clock-toggle').click(); await page.clock.runFor(100000);
  await tile(page, 'H1').click(); await page.locator('#primary-action').click(); await page.clock.runFor(1000);
  assert.equal(await tile(page, 'H1').locator('.empty-coordinate').textContent(), 'H1', 'Late pending claim must not change territory');
  assert.match(await page.locator('#move-status').textContent(), /deadline passed/);

  for (const value of ['victory', 'draw']) {
    await scene(page, value);
    assert.equal(await page.locator('#match-result').isVisible(), true);
    assert.equal(await page.locator('#scoreboard').isVisible(), false);
    assert.equal(await page.locator('#final-score-one').textContent(), '14');
    assert.equal(await page.locator('#final-score-two').textContent(), value === 'draw' ? '14' : '11');
    assert.equal(await page.locator('#draw-crest').isVisible(), value === 'draw');
    await tile(page, 'E4').click(); assert.equal(await page.locator('#tile-decay').textContent(), 'Frozen at deadline');
    await screenshot(page, `${value}-desktop.png`);
  }

  await scene(page, 'open');
  assert.equal(await page.locator('#blocks-left').textContent(), '—');
  assert.equal(await page.locator('#clock-track').isVisible(), false);
  assert.equal(await page.locator('#player-label-one').textContent(), 'OWNER 01');
  await page.locator('#clock-toggle').click(); await page.clock.runFor(110000); await page.locator('#clock-toggle').click();
  assert.equal(await page.locator('#match-result').isVisible(), false, 'Open board does not expire');
  await tile(page, 'H1').click(); await completeMockAction(page);
  assert.equal(await tile(page, 'H1').locator('.owner').textContent(), 'You');
  await screenshot(page, 'open-board.png');

  const custom = await open(1440, 1000, 'reinforce', true);
  assert.match(await custom.locator('#tile-power').textContent(), /4 POWER/);
  assert.equal(await custom.locator('#rules-summary').textContent(), 'Cap 4 · Cooldown 2 blocks');
  assert.match(await custom.locator('#rules-description').textContent(), /every 8 blocks/);
  assert.match(await custom.locator('#rules-description').textContent(), /80 blocks/);
  await completeMockAction(custom);
  assert.match(await custom.locator('#tile-cooldown').textContent(), /2 mock blocks/);
  await custom.locator('#clock-toggle').click(); await custom.clock.runFor(3000); await custom.locator('#clock-toggle').click();
  assert.match(await custom.locator('#primary-action').textContent(), /At power cap/);
  await custom.close();

  for (const [width, height] of [[360,640], [390,844], [430,932], [390,640], [430,640], [320,640], [768,1024], [1024,768]]) {
    const mobile = await open(width, height);
    if (width <= 760) {
      const first = await assertSafeMobileDock(mobile, width);
      for (const scroll of [first.gridTop, first.gridBottom - 100, first.gridBottom + 100, 1000]) {
        await mobile.evaluate(y => window.scrollTo(0, y), scroll); await assertSafeMobileDock(mobile, width);
      }
      if ([360,390,430].includes(width) && (height === 640 && width === 360 || height > 640)) {
        await screenshot(mobile, `mobile-${width}.png`);
        await screenshot(mobile, `mobile-${width}-viewport.png`, false);
        if (width === 360) {
          await screenshot(mobile, 'mobile.png'); await screenshot(mobile, 'mobile-viewport.png', false);
          await mobile.locator('#primary-action').click();
          assert.equal(await mobile.locator('.tile.pending').count(), 2);
          await assertSafeMobileDock(mobile, width);
          await mobile.clock.runFor(1000);
          assert.equal(await tile(mobile, 'E4').locator('.owner').textContent(), 'You');
          await scene(mobile, 'opening'); await screenshot(mobile, 'opening-mobile.png');
        }
        if (width === 390) {
          for (const value of ['victory','draw','claim','reinforce','failure','open']) {
            await scene(mobile, value); await screenshot(mobile, `${value}-mobile.png`);
            assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          }
        }
      }
    } else {
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await mobile.close();
  }
  await scene(page, 'midgame'); await page.locator('#primary-action').focus();
  await page.setViewportSize({ width:390, height:844 });
  await page.waitForFunction(() => document.getElementById('action-dock').parentElement.classList.contains('workspace'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'primary-action');
  await page.setViewportSize({ width:1440, height:1000 });
  await page.waitForFunction(() => document.getElementById('action-dock').parentElement.id === 'desktop-dock-slot');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'primary-action');
  for (const path of ['identity.html','review.html']) {
    const study = await context.newPage();
    await study.goto(`http://127.0.0.1:5180/${path}`, { waitUntil: 'networkidle' });
    await study.evaluate(() => document.fonts.ready);
    await study.locator('img').evaluateAll(images => Promise.all(images.map(img => { img.loading = 'eager'; return img.decode(); })));
    for (const width of [1440,360,390,430]) {
      await study.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      assert.equal(await study.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${path} fits ${width}px`);
      assert.equal(await study.locator('img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)), true, `${path} images resolve`);
      if (path === 'identity.html' && width === 1440) await screenshot(study, 'identity.png');
      if (path === 'identity.html' && width === 390) await screenshot(study, 'identity-mobile.png');
    }
    await study.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  console.log('Hybrid prototype checks passed: targeting, claim/reinforce/capture feedback, no changes before confirmation, failure/retry, failed result recording, alternate mock rules, open-board mode, deadlines, keyboard/reduced motion, 8 gameplay viewports, safe single dock, identity/comparison pages at 4 widths, and no external requests or page errors.');
  if (!captureScreenshots) console.log('Screenshot generation disabled (--no-screenshots).');
} finally { await browser.close(); }
