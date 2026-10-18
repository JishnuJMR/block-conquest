# Block Conquest — project specification and progress

Deadline: **2 November 2026**. Environment: Windows 11, VS Code, PowerShell.

## Scope and submission

A university DApp demonstrating a Solidity contract with user-callable functions and a minimal HTML/CSS/JavaScript frontend using Vite, ethers.js, MetaMask, and Sepolia. The contract enforces programmed rules; it is not described as cheat-proof. No tokens, NFTs, betting, randomness, admin takeover, or upgrades.

GitHub submission must include a README with description, features, deployment instructions, frontend run instructions, deployed contract address, network, and UI screenshots. Never commit secrets or put them in frontend code. Never request private keys or seed phrases in chat. Deployment and publication require the user's explicit instruction.

## Game specification

- One shared 8×8 board per deployed contract; coordinates range from 0 to 7.
- Claim any empty tile: owner becomes msg.sender and power becomes 1.
- Reinforce an owned tile: add 1 to effective power, subject to cooldown and cap.
- Default maximum power: 5.
- Attack from an owned tile into an orthogonally adjacent enemy tile. No diagonal movement or edge wrapping.
- Attacker effective power must be strictly greater than defender effective power.
- Successful attack subtracts defender effective power from source power; captured tile becomes attacker-owned with power 1.
- On-chain scoreOf(address) counts currently owned tiles.
- Decay reduces power by 1 per decay interval, with a floor of 1. Empty tiles have power 0; ownership never decays.
- Constructor takes decay interval (default 10 blocks), reinforcement cooldown (default 3 blocks), and power cap (default 5). Validate parameters and make them immutable. Require positive interval/cooldown and cap >= 2 so reinforcement and combat are possible.
- effectivePower() exists from milestone 1; decay arithmetic is introduced at milestone 3, with comparison before subtraction to avoid unsigned underflow.
- Whenever power changes, save the final result derived from effective power before resetting lastUpdateBlock.
- Attacks calculate both effective powers before modifying either tile and update both timestamps.
- Cooldown applies after claiming and attacking. At milestone 3, reinforcement is allowed when block.number - lastUpdateBlock >= reinforcementCooldown; attacks themselves have no additional waiting restriction.
- Emit events for successful claims, reinforcement, and captures.
- getGrid() returns 64 tiles in row-major order (index = y * 8 + x). Frontend leaderboard counts returned owners; no on-chain player list.

## Frontend specification

Wallet connection, network checking, grid coloured by owner, effective power, connected player's score, and leaderboard. Attack flow: select owned tile → choose Attack → select adjacent enemy. Show wallet confirmation, pending, success, and clear errors. Refresh on new blocks for lazy decay; handle account and network changes.

## Build order and progress

- [x] Inspect project folder and Node.js, npm, Git availability.
- [x] Record specification and progress checklist.
- [x] 1. Scaffold Hardhat; implement and test basic claiming, reinforcement, combat, scores, events, validation, and effectivePower API. No decay/cooldown enforcement yet. Stop for user review.
- [x] 2. Early throwaway Sepolia deployment and one MetaMask claim (completed based on user report on 18 October 2026; independent receipt verification outstanding).
  - Authorization received: user requested "next milestone".
  - [x] Prepare basic Ignition deployment module and local first-claim integration test.
  - [x] Write MetaMask setup, funding, deployment, and claim instructions in docs/SEPOLIA_SETUP.md.
  - [x] User installed MetaMask and reported 0.0500 SepoliaETH before deployment.
  - [x] User reported deployed contract: `0x5A6dB2fA7424F519a10805c48EF33F4eA141A9c9` on Sepolia.
  - [x] User reported claiming `(0,0)`, an owner address returned by getTile, and scoreOf = 1.
  - [ ] Collect deployment/claim transaction hashes and independently verify receipts and full tile state. This evidence is not yet provided; do not claim independent verification.
- [x] 3. Implement and test safe decay and cooldown; use effective powers throughout. 62 tests pass; TypeScript checking passes.
- [x] 4. Build and test frontend locally: Vite/ethers, responsive board, wallet handling, moves, live power, scores, and leaderboard. 6 logic tests and 12 browser integration tests pass.
- [ ] 5. After explicit authorization: final tested Sepolia deployment.
  - [x] User followed the updated deployment procedure and reported address `0x4D8ebB57f5140fD302F7b1f4Ff57EF23ff1c3Cb3` on 18 October 2026.
  - [x] Validate address formatting/checksum and configure public frontend defaults for Sepolia.
  - [ ] Collect deployment transaction evidence and verify updated rules on-chain.
  - [x] User confirmed a frontend claim using real MetaMask. Screenshot shows H1 owned by You, power 1, and Claim confirmed at block 11939882; user confirms score 1. Claim hash: `0x9fcbd74381c90cf660a619e1a2973635458608b1b6ff62d518cd34f552802ddd`. Independent receipt verification pending; see docs/DEPLOYMENT.md.
  - [x] User confirms live reinforcement raised power from 1 to 2, then power decayed back to 1 on Sepolia. Exact timing/receipt verification remains separate.
  - [x] Capture and review final Sepolia UI screenshot: docs/screenshots/sepolia-board.png. Embedded in README.
- [ ] 6. Complete README, real UI screenshots, and GitHub submission (publication requires authorization).
  - [x] README contains description, features, deployment and frontend instructions, Sepolia contract address, network, and UI screenshots.
  - [x] Saved and reviewed the user's Sepolia screenshot; added it to README.
  - [x] Initialize local Git on main and prepare the submission files; no remote upload performed.
  - [ ] Connect the intended GitHub repository and publish after explicit authorization.
  - [ ] Publish after explicit authorization and confirm the repository contents.

## Test checklist

- [x] Invalid coordinates and occupied tiles.
- [x] Ownership restrictions and empty tiles.
- [x] Orthogonal adjacency including edges; reject diagonals and wrapping.
- [x] Equal or insufficient attack power.
- [x] Attack cost, captured power, scores, timestamps, and events.
- [x] Constructor validation and power cap.
- [x] Cooldown and decay boundaries (milestone 3).
- [x] Reinforcement after long inactivity yields 2 from decayed power 1, rather than resurrecting stored power (milestone 3).
- [x] Attacks after decay use both tiles' effective powers (milestone 3).
- [x] Frontend claim/reinforce/attack flows against real local contracts.
- [x] Frontend wallet rejection, pending transactions, stale confirmations, account/network changes, invalid addresses, and failure feedback.
- [x] Block refresh displays decay and enables reinforcement after cooldown.
- [x] Desktop/mobile layout and keyboard navigation; screenshots saved from a local board.
- [x] Real MetaMask frontend claim, reinforcement, and decay observed by the user on the new Sepolia board; independent deployment verification remains pending.

## Environment findings

Node.js v24.13.0; npm 11.6.2; Git 2.54.0.windows.1. PowerShell blocks npm.ps1 under the current execution policy; use npm.cmd and npx.cmd without changing system policy. Folder initially empty. Hardhat 3 supports this Node version (official getting-started prerequisite: Node >=22.13.0).

## Current milestone results and limitations

Milestone 5 in progress (18 October 2026): user reported the new contract address `0x4D8ebB57f5140fD302F7b1f4Ff57EF23ff1c3Cb3` after following the current-contract Remix deployment procedure. Its address checksum is valid. Frontend configuration selects chain 11155111 and this address. User and screenshot confirm a successful frontend H1 claim, power 1, and expected score; claim hash is recorded in docs/DEPLOYMENT.md. User also confirms reinforcement to power 2 followed by decay to 1. Independent bytecode/receipt verification and repository screenshots of the Sepolia board remain pending.

Milestone 4 (18 October 2026): 62 contract tests + 6 frontend logic tests + 12 browser integration tests pass (80 total); TypeScript checking and Vite production build pass. Browser tests ran headless installed Chrome with a test-only EIP-1193 adapter forwarding to a real local Hardhat node. The production app contains no test wallet/keys. Local deployment instructions were exercised, and real local desktop/mobile screenshots are in docs/screenshots. All temporary browser-test servers were stopped by the test runner.

The frontend uses HTML/CSS/JavaScript, Vite 8.3.4, and ethers 6.17.0. Its ABI is exported from the compiled contract. Network/address settings are public and browser-local; all signing is delegated to MetaMask. The known historical Sepolia address is rejected. Snapshot reads share one block number, and the leaderboard counts owners returned by getGrid(). See docs/FRONTEND.md for run/configuration instructions.

Milestone 3 (18 October 2026): Solidity 0.8.28 compilation succeeds; all 62 tests pass; TypeScript checking passes; `npm.cmd run deploy:rehearsal` succeeds on an ephemeral local chain. Tests cover exact inclusion-block cooldown and decay boundaries, floor after a million blocks, custom constructor values, cap applied to effective power, both decayed powers in attacks, and timestamps after mutations. The local Ignition module is now `ignition/modules/BlockConquest.ts` and exercises the current contract with defaults `(10,3,5)`.

The original basic source was copied to `docs/archive/BlockConquest.milestone-1.sol` before editing for historical reference. The reported Sepolia address still refers to the basic contract and does not enforce decay/cooldown. It is not the final assignment deployment. Transaction hashes and independent on-chain verification remain outstanding.

No new public deployment or publication was performed during milestones 3 or 4. The user has since deployed the new Sepolia contract and performed frontend transactions. Their Sepolia screenshot is now saved and reviewed, showing reinforcement confirmed at block 11939902 and current block 11939931 with power and score both 1. Independent deployment evidence and GitHub submission remain pending. The user prefers Astra for coding and 6.1 Sol for questions/configuration; the current task is submission preparation. Publication still requires explicit authorization.
