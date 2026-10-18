# Block Conquest

A university DApp assignment due **2 November 2026**. Players share an 8×8 board, claim empty tiles, reinforce their territory, and capture orthogonally adjacent enemy tiles using greater power. The Solidity contract enforces programmed rules; it is not cheat-proof.

**Status: deployed on Sepolia, with frontend claim, reinforcement, and decay observed by the user.** The current contract enforces decay and cooldown. The Vite/ethers frontend provides an interactive board, wallet connection, transactions, and leaderboard. A real Sepolia UI screenshot is included below. Independent deployment verification and GitHub publication remain pending. See [PROJECT_PLAN.md](PROJECT_PLAN.md), [deployment evidence](docs/DEPLOYMENT.md), [rule examples](docs/GAME_RULES.md), and the [frontend guide](docs/FRONTEND.md).

## Local setup on Windows

Verified tools: Node.js 24.13.0, npm 11.6.2, Git 2.54.0.windows.1. Hardhat 3 requires Node.js >=22.13.0; use a supported even-numbered LTS release. This project pins Hardhat 3.19.0, ethers 6.17.0, and Solidity 0.8.28; commit package-lock.json for reproducible installs.

In the VS Code PowerShell terminal:

```powershell
cd C:\folder\blockchain
npm.cmd ci
npm.cmd test
npm.cmd run typecheck
```

Dependencies are already installed in the current working folder, so `npm.cmd ci` is only needed after cloning or restoring dependencies. Use `npm.cmd` and `npx.cmd` because this machine's PowerShell execution policy blocks the corresponding .ps1 wrappers. No system execution-policy change is necessary. The first build downloads the Solidity compiler and needs internet access. Tests run on an ephemeral local Hardhat chain without MetaMask, Sepolia ETH, or private keys. Run tests or `npm.cmd run compile` before typechecking to generate contract types.

## Current contract

- `claim(x, y)`: claim an empty tile for the caller at power 1.
- `reinforce(x, y)`: after cooldown, add one effective power to your tile, up to the configured cap.
- `attack(fromX, fromY, toX, toY)`: capture an adjacent enemy tile if source power is strictly greater. Source loses defender power; captured tile starts at 1.
- `effectivePower(x, y)`: current power after lazy decay, with floor 1 for owned tiles and 0 for empty tiles.
- `getTile(x, y)`: stored owner, power, and last-update block.
- `getGrid()`: all 64 tiles in row-major order, `index = y * 8 + x`, with effective power.
- `scoreOf(player)`: current tile count. No on-chain player list.

Constructor arguments are `(decayInterval, reinforcementCooldown, maxPower)`, with intended defaults `(10, 3, 5)`. Intervals must be positive and maxPower must be at least 2 to allow reinforcement and combat. Parameters are immutable. Claims, reinforcement, and captures emit events. Both attacked tiles receive updated block timestamps. All power mutations already use effective-power calculations before resetting timestamps.

Power loses one point per full decay interval since the tile's last update. Reinforcement is allowed when `block.number - lastUpdateBlock >= reinforcementCooldown`. Claims, reinforcements, and successful attacks reset the relevant tile's timer; an attack resets both source and captured tiles. Cooldown restricts reinforcement, while attack eligibility depends on ownership, adjacency, and effective power. Decay never removes ownership or changes scores. All rules use the transaction's inclusion block, so a preview can change before confirmation.

There are no tokens, NFTs, betting, randomness, administrative takeover, or upgrades.

## Frontend

Run this in the project folder, then open **http://127.0.0.1:5173** in the browser containing MetaMask:

```powershell
npm.cmd run dev
```

The script compiles the current contract and exports its ABI before starting Vite. This working folder is configured for Sepolia at `0x4D8ebB57f5140fD302F7b1f4Ff57EF23ff1c3Cb3`; the user has completed frontend claim, reinforcement, and decay checks. After cloning, copy `frontend/.env.example` to `frontend/.env.local` with `Copy-Item frontend/.env.example frontend/.env.local`, or enter the address using **Board settings**. Browser-saved Board settings override environment defaults; update them if an earlier board is still selected. The old throwaway Sepolia address is explicitly rejected because it lacks decay/cooldown.

Features include a responsive 8×8 owner-coloured board, effective power, connected account's on-chain score, leaderboard counted from grid owners, claim/reinforce/attack controls, cooldown countdown, block refresh, network switching, account-change handling, and wallet/pending/success/error feedback. Select your tile → choose attack → select a weaker adjacent enemy → confirm. Arrow keys move focus between tiles.

Build with `npm.cmd run build`; the output is `frontend/dist/`. Preview the build with `npm.cmd run preview`. The [frontend guide](docs/FRONTEND.md) covers optional public environment defaults, local deployment, and full run instructions. No secrets belong in `VITE_` variables or frontend code.

### UI screenshots

The user's Sepolia screenshot shows the connected wallet, H1 owned at power 1, score 1, leaderboard, and a confirmed reinforcement transaction:

![Block Conquest running on Sepolia](docs/screenshots/sepolia-board.png)

Additional browser-test screenshots show a real local Hardhat board with three players: [desktop](docs/screenshots/local-board-desktop.png), [mobile](docs/screenshots/local-board-mobile.png).

## Validation

**80 tests pass:** 62 contract tests, 6 frontend logic tests, and 12 browser integration tests. Solidity compilation, TypeScript checking, and the Vite production build succeed.

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run test:frontend
npm.cmd run test:ui
```

Browser tests start their own local node and preview server, requiring free ports 8545 and 4173. They use installed Chrome and a test-only wallet adapter against real local contracts. They verify transactions and frontend behavior but do not automate the actual MetaMask extension. Tests cover wallet rejection, pending locks, account/network changes, stale confirmations, decay refresh, failed attacks, invalid addresses, local deployment, keyboard navigation, and mobile layout. See [FRONTEND.md](docs/FRONTEND.md) for browser alternatives.

Tests cover empty state, constructor validation, coordinates, occupied tiles, ownership, configurable caps, invalid targets, diagonal/distant/wrapped attacks, all four orthogonal directions at edges, equal/insufficient power, attack cost, captured power, events, timestamps, and score consistency through recapture. Timing tests cover cooldown boundaries after claims/reinforcements/attacks, per-tile timers, decay boundaries and floor, long inactivity without underflow, reinforcement from decayed power, effective-power caps, both powers in combat, and inclusion-block races. The deployment integration test exercises the current Ignition module, a first claim, cooldown, and decay on a local chain.

## Deployment and submission

- Target network: **Sepolia**, chain ID **11155111**.
- Historical basic deployment (user-reported): **`0x5A6dB2fA7424F519a10805c48EF33F4eA141A9c9`**. This throwaway contract has no decay/cooldown enforcement and is not the final submission address. The user reported `getTile(0,0)` showing an owner and `scoreOf = 1`; transaction hashes and independent receipt verification remain outstanding.
- Current Sepolia contract address (user-reported): **`0x4D8ebB57f5140fD302F7b1f4Ff57EF23ff1c3Cb3`**. Deployment transaction hash and independent rule verification remain pending. A frontend claim of H1 was confirmed by the user and screenshot: [claim transaction](https://sepolia.etherscan.io/tx/0x9fcbd74381c90cf660a619e1a2973635458608b1b6ff62d518cd34f552802ddd). See [deployment evidence](docs/DEPLOYMENT.md) for verification status.
- Deployment instructions: [Sepolia setup and first claim](docs/SEPOLIA_SETUP.md). Local rehearsal: `npm.cmd run deploy:rehearsal`. Live signing uses MetaMask through Remix; no live network credentials are stored in the project.
- Frontend run steps and UI screenshots: complete. User confirms Sepolia claim, reinforcement, and decay; the saved Sepolia screenshot is embedded above.
- GitHub repository/publication: pending; nothing has been published.

The early setup check is complete based on the user's report. The basic source was preserved in `docs/archive/BlockConquest.milestone-1.sol` before the local contract changed. The current local rehearsal module is `ignition/modules/BlockConquest.ts`; running it does not update the historical Sepolia contract. Never paste a private key or seed phrase into chat. Keep secrets out of Git and frontend code; .gitignore excludes environment files and common key files. Local Hardhat test accounts are only for local development.

Next: finish recording deployment evidence and publish the GitHub submission after authorization. See [the submission guide](docs/GITHUB_SUBMISSION.md). No public deployment or publication was performed during milestones 3 or 4.
