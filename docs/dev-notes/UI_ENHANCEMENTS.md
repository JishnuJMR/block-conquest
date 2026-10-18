# UI enhancement branch — 18 October 2026

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
- [ ] Fresh checkout, clean install and README run commands.
- [ ] Real MetaMask connection to the enhanced UI and new Sepolia screenshot.
- [ ] Review before merging the branch.

New checks cover countdown boundaries, persistent owner labels, preview invalidation after decay, onboarding persistence, and confirmed-capture feedback with and without reduced motion. Browser tests use a test-only wallet adapter, not the MetaMask extension. Existing Sepolia screenshots and receipts document the submission UI; new local screenshots show the enhanced UI and are labelled accordingly.
