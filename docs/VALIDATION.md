# Submission and UI validation

## Final publication review — 21 October 2026

The complete suite passed again before publication: 90 contract tests, 12 frontend logic tests and 29 browser tests (131 total), plus TypeScript checking and the production build. All local Markdown links resolved. A tracked-file credential-pattern scan found no matches. Review found no blocking code issues; outdated branch setup instructions and completed-match guidance were corrected. Automated browser checks use local contracts, not MetaMask or Sepolia.

## Completed Sepolia match — 21 October 2026

The real MetaMask session completed both joins, B's B1 claim and reinforcement, B1 → A1 capture, deadline expiry and result recording. Result transaction [`0x87468742…2764eb37`](https://sepolia.etherscan.io/tx/0x874687427e1221263cf0a5d55ec697fb2d0f26fbb8eda130365128fb2764eb37) has receipt status 1 at block 11957401. Its match-address log is `MatchFinalized(B,0,3)`; current contract reads confirm phase 3, finalized true, winner B and scores A: 0/B: 3. B owns A1, B1 and H8 at effective power 1.

MatchStarted records start 11956131 and deadline 11956231. Finalization occurred after the deadline, as allowed. The [saved screenshot](screenshots/sepolia-match-result.png) was visually reviewed, agrees with the receipt and final board, and is embedded in README. The third-account spectator flow, return after losing all tiles, draw and disconnect/reconnect are covered by local automated tests; they are not claimed as additional live checks in this match. See [full match evidence](MATCH_DEPLOYMENT.md).

## Match deployment configuration read

The match at [`0x98f9726a04Fc43b6145A270f61c9a97243650A33`](https://sepolia.etherscan.io/address/0x98f9726a04Fc43b6145A270f61c9a97243650A33) was checked using `https://ethereum-sepolia-rpc.publicnode.com` on chain 11155111 at block **11956053**. Contract code is present. Reads returned `MATCH_VERSION = 1`, decay interval 10, reinforcement cooldown 3, maximum power 5, and duration 100. Phase was 0 (Waiting), both seats were zero addresses, start/end blocks were 0, and finalized was false. These reads confirm the exposed settings and lobby state; creation receipt, source/runtime verification and live gameplay are separate checks.

## Two-player match — 20 October 2026

The working checkout passed **131 tests**: 90 contract tests (62 existing open-board checks plus 28 match/rehearsal checks), 12 frontend logic tests and 29 browser tests. Typechecking and the production build passed. The original `BlockConquest.sol`, dependencies and Hardhat compiler configuration are unchanged.

Match checks cover distinct seats, simultaneous starting tiles, spectator restrictions, the last playable block, rejection at the exact deadline, either winner and a draw, public finalization, duplicate finalization, frozen scores/power and long-inactivity combat. Browser checks exercise joining from two accounts, capture, countdown, winner/draw recording, rejection, deadline expiry during wallet confirmation, reconnect, old-contract mode mismatch, and 360×640 reachability. P1/P2 labels agree with the seats.

The saved local match lobby, active-match and recorded-result screenshots were visually reviewed. These tests use local Hardhat contracts and a test-only wallet adapter. This automated validation preceded the Sepolia deployment and live match recorded above. Older public-network evidence farther below applies to the open-board version.

Fresh-checkout verification caught a TypeScript typing issue in the match Ignition rehearsal: connecting its generic contract returned `BaseContract`. The rehearsal now obtains the generated `BlockConquestMatch` type through `getContractAt`. This changes test typing only. The previous version is preserved at tag `v3-survey-atlas-open-board` (`d9af00b`).

### Match fresh checkout

A new local clone was created with `--no-hardlinks` in an empty temporary folder from `60da48f`, then fast-forwarded to **`f2aa1f4`** for the rehearsal typing fix. No dependencies, artifacts, generated types, caches or `.env.local` were copied. Windows 11, Node.js 24.13.0, npm 11.6.2 and installed Chrome were used.

| Check | Result |
| --- | --- |
| npm ci | 207 packages installed; audit reported zero vulnerabilities |
| npm test | 90 contract tests passed |
| npm run typecheck | Passed |
| npm run test:frontend | 12 logic tests passed |
| npm run test:ui | Production build and all 29 browser tests passed |
| npm run dev | Compile/export and Vite startup passed on port 5173 |
| HTTP readiness | HTTP 200; match panel, join and result controls present |
| README/reference links | All local links in README and docs/MATCH.md resolve |

All **131 tests** passed in the fresh checkout. The temporary development server was stopped after checking it. No Sepolia transaction or GitHub publication was performed during that automated validation. The subsequent manual deployment, actual MetaMask match and saved result screenshot are documented above.

## Survey Atlas fresh checkout — 18 October 2026

Tested a fresh local Git clone of **f38560e** on `ui/conquest-clarity` in an empty temporary directory, using `--no-hardlinks`. Dependencies, build output, caches, generated types and `.env.local` were not copied. Environment: Windows 11, Node.js 24.13.0, npm 11.6.2 and installed Chrome; commands used the documented `npm.cmd` substitution.

| Check | Result |
| --- | --- |
| npm ci | Passed: 207 packages installed; audit reported zero vulnerabilities |
| npm test | 62 contract tests passed |
| npm run typecheck | Passed |
| npm run test:frontend | 8 logic tests passed |
| npm run test:ui | Production build and 21 browser integration tests passed |
| npm run dev | Predev compile/export and Vite startup passed on port 5173 |
| HTTP readiness | GET http://127.0.0.1:5173/ returned 200 with Survey Atlas and Disconnect controls |
| Actual MetaMask acceptance | The fresh-checkout Sepolia board loaded, disconnected and reconnected successfully, confirmed through real MetaMask |

All **91 tests** passed. The new browser checks cover permission revocation, unsupported-revocation fallback, disconnect during wallet confirmation, persistent disconnection, keyboard attacks and Escape, contract-derived rules with `(20,4,7)`, primary action reachability at 360×640, and six distinct faction textures. Desktop and mobile greyscale screenshots were visually inspected. The three-tile sparse board, attack estimate, reduced motion, new-block decay and transaction feedback are covered by browser checks and saved local screenshots.

Browser automation uses real local Hardhat contracts through a test-only wallet adapter. Actual MetaMask acceptance is the separate manual check above. The [real Sepolia screenshot of Survey Atlas](screenshots/sepolia-survey-atlas.png) was visually reviewed and added to the README. It shows two factions, scores of 4 and 1, Disconnect, and an Attack confirmed message at block 11941711. This screenshot review is not an independent receipt check of that newer attack; the independently checked earlier capture is recorded below. No contract, deployment, dependencies or game rules changed. The submission baseline is preserved at `v1-submission-ready`, and the earlier UI at `v2-before-survey-atlas`.

## Earlier clarity UI fresh checkout — 18 October 2026 (historical)

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

Creation receipt, deployed parameters `(10,3,5)`, runtime comparison, claim event, reinforcement event, and the two-account capture have been independently checked. Capture transaction `0xf868656f729c9704f55e5cdaa958dc707028629772a7a3723a0917469f0ecb47` succeeded at block 11940708. Reads at that block confirm A owns H1/G1 at power 1, B retains G2, and scores are A: 2, B: 1. See [deployment evidence](DEPLOYMENT.md). Fresh-checkout wallet acceptance and live capture were performed with real MetaMask; the earlier capture screenshot remains linked in README alongside the current Survey Atlas screenshot.
