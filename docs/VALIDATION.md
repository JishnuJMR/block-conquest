# Submission validation

## Fresh checkout of the revised submission

Tested a new Git clone of local commit **1f8904f** in an empty temporary folder. The clone did not contain node_modules, artifacts, cache, generated contract types, or frontend/.env.local. Git objects were copied without hardlinks. This validates the tracked revised snapshot; subsequent changes add only documentation and live-capture evidence. Application code, contracts, dependency lockfile, and build/test configuration are unchanged from the tested snapshot.

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
