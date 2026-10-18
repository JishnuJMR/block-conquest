# UI enhancement branch — 18 October 2026

## Survey Atlas redesign

The initial clarity pass is preserved at tag `v2-before-survey-atlas` (`503cf3b`). Survey Atlas continues on `ui/conquest-clarity`; the original submission remains at `v1-submission-ready` on `main`.

- [x] Cool-paper/ink identity, map corner marks, stronger typography and compact board statistics.
- [x] Six distinct patterns; power and player label on tiles, insignias in the Move panel and leaderboard. The connected faction reads **You**.
- [x] One Move panel containing the estimate, contract-derived countdowns, actions and transaction feedback.
- [x] Source-to-target attack arrow, static pending outlines, confirmed capture feedback and reduced-motion support.
- [x] Visible Disconnect: local session cleanup and MetaMask permission-revocation request, with an honest fallback if unsupported.
- [x] Explicitly unloaded disconnected board; no new public RPC dependency.
- [x] Mobile action row, reachable at 360×640, including selected coordinate and transaction feedback.
- [x] Keyboard navigation with arrows, Enter/Space and Escape.
- [x] Sparse three-tile desktop/mobile screenshots and six-faction greyscale review.
- [x] 21 browser integration tests and production build passed.
- [ ] Survey Atlas fresh clone, clean install, all 91 tests, typecheck and dev startup.
- [ ] Real MetaMask review and new Sepolia screenshots.
- [ ] Review before merge/publication.

No gameplay changes or redeployment. Dark theme, block ruler, pip animations, capture stamps and activity feeds remain deferred. Feature freeze remains **26 October 2026**. The tests use a local wallet adapter; actual MetaMask acceptance remains a manual step.

## Earlier clarity pass (historical)

Submission baseline: tag `v1-submission-ready` at `da795a0`. Work branch: `ui/conquest-clarity`. The Solidity contract and deployed Sepolia address remain unchanged.

## Agreed scope

- [x] Attack outcome preview with inclusion-block caveat.
- [x] Contextual action text.
- [x] Persistent board-local owner labels and a fixed palette.
- [x] Per-tile reinforcement and next-decay block countdowns.
- [x] Dismissible, reopenable instructions.
- [x] Confirmed-capture animation with reduced-motion support.
- [x] Territory-share bars, based on all 64 tiles.

Activity feeds, connected borders, decorative terrain and additional game rules remain outside this change. UI feature freeze: 26 October 2026.

## Validation

- [x] 62 contract tests; contract source unchanged.
- [x] 8 frontend logic tests.
- [x] 15 browser integration tests using real local Hardhat contracts.
- [x] TypeScript check and production build.
- [x] Desktop/mobile screenshot inspection, keyboard navigation and narrow-screen checks.
- [x] Fresh clone of `3792861`: `npm ci`, all 85 tests, typecheck, build, `npm run dev`, and HTTP 200 on port 5173. No existing dependencies, build output, types, cache or `.env.local` were copied.
- [ ] Real MetaMask connection to the enhanced UI and new Sepolia screenshot.
- [ ] Review before merging the branch.

New checks cover countdown boundaries, persistent owner labels, preview invalidation after decay, onboarding persistence, and confirmed-capture feedback with and without reduced motion. Browser tests use a test-only wallet adapter, not the MetaMask extension. Existing Sepolia screenshots and receipts document the submission UI; new local screenshots show the enhanced UI and are labelled accordingly.
