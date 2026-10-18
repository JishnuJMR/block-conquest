# Submission and UI validation

## Enhanced UI fresh checkout — 18 October 2026

A fresh local Git clone of **3792861** (`ui/conquest-clarity`) was created in an empty temporary folder without hardlinks. No dependencies, build output, cache, generated types, or `.env.local` were copied. On Windows 11 with Node.js 24.13.0, npm 11.6.2 and installed Chrome, the documented `npm.cmd` equivalents passed:

| Check | Result |
| --- | --- |
| npm ci | 207 packages installed; audit reported zero vulnerabilities |
| npm test | 62 contract tests passed |
| npm run typecheck | Passed |
| npm run test:frontend | 8 logic tests passed |
| npm run test:ui | Production build and 15 browser integration tests passed |
| npm run dev | Predev compile/export and Vite startup passed on port 5173 |
| HTTP readiness | GET http://127.0.0.1:5173/ returned 200 with the guide and attack-preview markup |

The 85 tests include preview invalidation after decay, block countdown boundaries, owner-label persistence across reloads/accounts, instructions, and reduced-motion capture feedback. Desktop and mobile screenshots were reviewed, with additional checks for horizontal overflow and tile-content fit at 320px. Browser tests use actual local contracts with a test-only wallet adapter. Real MetaMask acceptance and an updated Sepolia screenshot for this UI remain separate manual checks before merging; the earlier evidence below describes the submission version.

## Fresh checkout of the revised submission

Tested a new Git clone of local commit **1f8904f** in an empty temporary folder. The clone did not contain node_modules, artifacts, cache, generated contract types, or frontend/.env.local. Git objects were copied without hardlinks. Subsequent changes through submission commit **da795a0** added only documentation and live-capture evidence. The UI branch is validated separately above.

Environment: Windows 11, Node.js 24.13.0, npm 11.6.2, installed Google Chrome. Commands used the README's documented Windows `npm.cmd` substitution.

| Check | Result |
| --- | --- |
| npm ci | Passed: clean installation of locked dependencies; audit reported zero vulnerabilities |
| npm test | Passed: 62 contract tests |
| npm run typecheck | Passed |
| npm run test:frontend | Passed: 6 logic tests |
| npm run test:ui | Passed: production build and 12 browser integration tests |
| npm run dev | Predev compile/export passed; port 5173 was occupied by an existing app |
| npm run dev -- --port 5174 | Documented fallback started successfully |
| HTTP readiness | GET http://127.0.0.1:5174/ returned 200 |
| Actual MetaMask acceptance | User opened the fresh-checkout app on port 5174, configured Sepolia/address, connected MetaMask, and confirmed that the board loads |

Browser integration tests used actual local Hardhat deployments through a test-only wallet adapter. They do not constitute a MetaMask extension test. Mac/Linux execution has not been claimed; the README's main npm commands are portable.

## Live Sepolia checks

Creation receipt, deployed parameters `(10,3,5)`, runtime comparison, claim event, reinforcement event, and the two-account capture have been independently checked. Capture transaction `0xf868656f729c9704f55e5cdaa958dc707028629772a7a3723a0917469f0ecb47` succeeded at block 11940708. Reads at that block confirm A owns H1/G1 at power 1, B retains G2, and scores are A: 2, B: 1. See [deployment evidence](DEPLOYMENT.md). Human fresh-checkout wallet acceptance and live capture were performed with real MetaMask; the saved Sepolia capture screenshot is embedded in README.
