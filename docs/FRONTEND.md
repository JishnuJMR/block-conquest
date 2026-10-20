# Run and use the Block Conquest frontend

**Two-player version:** in Board settings choose **Two-player match** and a newly deployed `BlockConquestMatch` address. `npm run deploy:local` now deploys this version with `(10,3,5,100)`. The match panel handles joining, the countdown and final results; see [match reference](MATCH.md). The existing Sepolia address below is the earlier version and requires **Open board (earlier version)**. P1/P2 labels in matches follow the registered seats; browser-local labels described below apply to open boards.

The frontend is plain HTML/CSS/JavaScript with Vite and ethers.js. It signs transactions through MetaMask. Board state comes from the contract; there is no server database or on-chain player list.

## Open the local app

In a terminal opened in the project folder:

```sh
npm run dev
```

Open **http://127.0.0.1:5173** in the browser containing MetaMask. This command compiles the current contract, exports its public ABI, and starts Vite. It does not deploy a contract. Press Ctrl+C in that terminal when finished.

Set Ethereum Sepolia and `0x4D8ebB57f5140fD302F7b1f4Ff57EF23ff1c3Cb3` in **Board settings**, or copy the public defaults from frontend/.env.example to frontend/.env.local before starting Vite. Claim, reinforcement, and decay have been observed with real MetaMask; deployment parameters and transaction events have also been independently checked. Browser-saved settings override environment defaults.

On Windows PowerShell, substitute `npm.cmd` for `npm` if npm.ps1 is blocked. The commands elsewhere in this guide are portable unless explicitly marked PowerShell.

## Configure a board

1. Open **Board settings** above the board.
2. Choose **Ethereum Sepolia** or **Local Hardhat**.
3. Paste the public address of the updated contract on that network and click **Load board**.
4. Click **Connect wallet** and approve access in MetaMask.
5. If prompted by the page, click **Switch network** and approve the switch in MetaMask.

The address and chosen network are saved in your browser's local storage. No keys are stored by this app. If desired, copy `frontend/.env.example` to `frontend/.env.local` and set public defaults there; browser-saved Board settings override those defaults. Restart Vite after changing environment defaults. All `VITE_` values are exposed to the browser: never put private keys, seed phrases, RPC secrets, or passwords in them.

## Play

- **Claim:** select an empty tile, click **Claim tile**, and confirm in MetaMask.
- **Reinforce:** select your tile. Wait until the cooldown reads **Ready**, then click **Reinforce** and confirm. The button is disabled at the cap.
- **Attack:** select your source tile, choose **Choose attack target**, select a highlighted adjacent enemy, then **Confirm attack** in the panel and approve in MetaMask. Cancel attack returns to source selection.

Rows are 1–8 and columns A–H in the UI. A1 corresponds to contract `(0,0)`, B1 to `(1,0)`, and A2 to `(0,1)`. Arrow keys move keyboard focus between tiles; Enter or Space selects a tile. Owner colours are stable, and accessible tile labels also identify ownership and power.

Survey Atlas uses a board-first layout, one Move panel, six distinct faction patterns, and insignias in the panel and leaderboard. Each owner receives a persistent `P1`, `P2`, … label; the connected owner's displayed label becomes **You** everywhere. Underlying identities persist per chain/contract in this browser, including owners who lose all their tiles. Patterns and shapes repeat after six owners and colours after ten; text labels and addresses distinguish players beyond these limits. Clearing browser storage resets local labels. The **How conquest works** guide can be dismissed and reopened with **How to play**.

The visible **Disconnect** button clears local session state, stops board reads, and requests [MetaMask account-permission revocation](https://docs.metamask.io/metamask-connect/evm/reference/json-rpc-api/wallet_revokePermissions/). If revocation is unavailable or fails, the app stays locally disconnected and explains how to remove the permission in MetaMask. A local preference prevents reloads and wallet events from silently reconnecting. Click **Connect wallet** to resume. A submitted move can still confirm after disconnection. Without a connected wallet, the board is explicitly unloaded; no public RPC or simulated territory is used.

The mobile action row stays at the bottom of the viewport after tile selection. It includes the coordinate, an attack estimate when applicable, and transaction feedback. Keyboard users can Tab into the board, use arrow keys and Enter/Space, and press Escape to cancel attack selection or clear selection. Escape also closes Board settings. Reduced motion disables animation; status text and static highlights remain.

The selected tile shows reinforcement readiness and time until its next power loss in blocks. At power 1 it reports **Minimum power reached**. The attack preview shows both effective powers, the source's remaining power, and captured power 1; it refreshes or disappears as eligibility changes. A successful capture briefly highlights the captured tile after receipt confirmation. Reduced-motion preferences replace that animation with a static highlight. Leaderboard bars use all 64 tiles as their denominator, including unclaimed tiles.

The transaction log distinguishes wallet confirmation, submitted/pending, success, and rejection/failure. Sepolia transactions link to the explorer. Changing accounts or networks clears the selection and invalidates old reads. If a wallet changes while a transaction is pending, check MetaMask for that transaction's result; an already broadcast move cannot be cancelled by changing the page.

## How live state works

The app polls new blocks through MetaMask, then reads `getGrid()`, `scoreOf(account)`, and constructor settings at the same block number. It displays effective power from `getGrid()`. The leaderboard counts tile owners in that grid. Decay changes power without changing score or ownership. A failed refresh disables actions until a successful refresh, so stale state cannot initiate a move.

Cooldown display is conservative: the button enables once the latest observed block has reached the cooldown, even though a transaction may be eligible when the next block mines. Power/ownership can change after you open MetaMask; the contract decides eligibility when the transaction is included. Gas limits include 20% allowance over the estimate; the wallet still shows the fee for approval.

## Optional local chain for development

The deployed Sepolia board is available through the address above. To experiment on a separate local chain instead:

1. Start the node in terminal 1:

   ```powershell
   npm run node:local
   ```

2. Deploy the current contract in terminal 2:

   ```powershell
   npm run deploy:local
   ```

   Copy the printed **local contract address**. This script is fixed to loopback and verifies chain ID 31337.

3. Start the frontend with `npm run dev`. Select **Local Hardhat** in Board settings and enter the local address.
4. To sign local moves manually, use a separate disposable MetaMask account imported from one of the local node's printed test keys. These are public development keys and must never hold real funds or be used for your Sepolia account. The local network is **http://127.0.0.1:8545**, chain ID **31337**, currency **ETH**. The app can ask MetaMask to add it if necessary.

The local node mines on transactions, not on a wall-clock schedule. To advance ten blocks while testing decay without another transaction:

```powershell
$rpcBody = @{ jsonrpc = '2.0'; id = 1; method = 'hardhat_mine'; params = @('0xa') } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri http://127.0.0.1:8545 -Method Post -ContentType 'application/json' -Body $rpcBody
```

Stopping the node loses its local state. Restarting it requires another local deployment; verify the address in Board settings.

## Build and checks

```powershell
npm test
npm run typecheck
npm run test:frontend
npm run test:ui
```

`test:ui` builds the frontend and starts its own temporary Hardhat node and production preview, so ports **8545** and **4173** must be free. It runs headless Chrome (already installed on this machine) against real contract deployments, with a test-only EIP-1193 adapter forwarding requests to unlocked local accounts. It tests application behavior and RPC transactions, **not the actual MetaMask extension popup**. No adapter, private keys, or test controls are included in the production app. Set `$env:PLAYWRIGHT_CHANNEL = 'msedge'` to use installed Edge instead.

For a production build alone, run `npm run build`. Files are emitted to `frontend/dist/`. `npm run preview` serves that build at **http://127.0.0.1:4173**. Building and previewing do not publish anything.

## Screenshots and validation

Browser tests capture the app showing a real local Hardhat board with three current owners:

- [Desktop screenshot](screenshots/local-board-desktop.png)
- [Mobile screenshot](screenshots/local-board-mobile.png)

These are labelled as local screenshots. The [Survey Atlas Sepolia screenshot](screenshots/sepolia-survey-atlas.png) shows a real MetaMask session and is embedded in README. The [earlier capture screenshot](screenshots/sepolia-capture.png) preserves the original two-account capture evidence. The creation receipt, parameters, claim, reinforcement and capture events, and normalized runtime comparison are documented in [DEPLOYMENT.md](DEPLOYMENT.md). Fresh-checkout tests and manual wallet acceptance are recorded in [VALIDATION.md](VALIDATION.md).
