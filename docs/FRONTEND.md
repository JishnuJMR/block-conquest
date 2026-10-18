# Run and use the Block Conquest frontend

The frontend is plain HTML/CSS/JavaScript with Vite and ethers.js. It signs transactions through MetaMask. Board state comes from the contract; there is no server database or on-chain player list.

## Open the local app

In VS Code's PowerShell terminal:

```powershell
cd C:\folder\blockchain
npm.cmd run dev
```

Open **http://127.0.0.1:5173** in the browser containing MetaMask. This command compiles the current contract, exports its public ABI, and starts Vite. It does not deploy a contract. Press Ctrl+C in that terminal when finished.

You can view the layout immediately. This working folder now defaults to the user-reported new Sepolia contract `0x4D8ebB57f5140fD302F7b1f4Ff57EF23ff1c3Cb3`; real MetaMask frontend acceptance and independent deployment verification remain pending. Your historical Sepolia address `0x5A6dB2fA7424F519a10805c48EF33F4eA141A9c9` runs the old rules, so this frontend explicitly rejects it on Sepolia. Restart Vite if it was running before the new defaults were set. If browser-saved settings select a different board, update Board settings explicitly.

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

The transaction log distinguishes wallet confirmation, submitted/pending, success, and rejection/failure. Sepolia transactions link to the explorer. Changing accounts or networks clears the selection and invalidates old reads. If a wallet changes while a transaction is pending, check MetaMask for that transaction's result; an already broadcast move cannot be cancelled by changing the page.

## How live state works

The app polls new blocks through MetaMask, then reads `getGrid()`, `scoreOf(account)`, and constructor settings at the same block number. It displays effective power from `getGrid()`. The leaderboard counts tile owners in that grid. Decay changes power without changing score or ownership. A failed refresh disables actions until a successful refresh, so stale state cannot initiate a move.

Cooldown display is conservative: the button enables once the latest observed block has reached the cooldown, even though a transaction may be eligible when the next block mines. Power/ownership can change after you open MetaMask; the contract decides eligibility when the transaction is included. Gas limits include 20% allowance over the estimate; the wallet still shows the fee for approval.

## Optional local chain for development

For normal assignment use, wait for the final Sepolia deployment. To experiment locally instead:

1. Start the node in terminal 1:

   ```powershell
   npm.cmd run node:local
   ```

2. Deploy the current contract in terminal 2:

   ```powershell
   npm.cmd run deploy:local
   ```

   Copy the printed **local contract address**. This script is fixed to loopback and verifies chain ID 31337.

3. Start the frontend with `npm.cmd run dev`. Select **Local Hardhat** in Board settings and enter the local address.
4. To sign local moves manually, use a separate disposable MetaMask account imported from one of the local node's printed test keys. These are public development keys and must never hold real funds or be used for your Sepolia account. The local network is **http://127.0.0.1:8545**, chain ID **31337**, currency **ETH**. The app can ask MetaMask to add it if necessary.

The local node mines on transactions, not on a wall-clock schedule. To advance ten blocks while testing decay without another transaction:

```powershell
$rpcBody = @{ jsonrpc = '2.0'; id = 1; method = 'hardhat_mine'; params = @('0xa') } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri http://127.0.0.1:8545 -Method Post -ContentType 'application/json' -Body $rpcBody
```

Stopping the node loses its local state. Restarting it requires another local deployment; verify the address in Board settings.

## Build and checks

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run test:frontend
npm.cmd run test:ui
```

`test:ui` builds the frontend and starts its own temporary Hardhat node and production preview, so ports **8545** and **4173** must be free. It runs headless Chrome (already installed on this machine) against real contract deployments, with a test-only EIP-1193 adapter forwarding requests to unlocked local accounts. It tests application behavior and RPC transactions, **not the actual MetaMask extension popup**. No adapter, private keys, or test controls are included in the production app. Set `$env:PLAYWRIGHT_CHANNEL = 'msedge'` to use installed Edge instead.

For a production build alone, run `npm.cmd run build`. Files are emitted to `frontend/dist/`. `npm.cmd run preview` serves that build at **http://127.0.0.1:4173**. Building and previewing do not publish anything.

## Screenshots and remaining validation

Browser tests capture the app showing a real local Hardhat board with three current owners:

- [Desktop screenshot](screenshots/local-board-desktop.png)
- [Mobile screenshot](screenshots/local-board-mobile.png)

These are labelled as local screenshots. The user has since connected real MetaMask to the new Sepolia contract, claimed H1, reinforced it, and observed decay back to 1. Their [Sepolia screenshot](screenshots/sepolia-board.png) is also saved and embedded in README. Independent receipt/bytecode verification remains documented in [DEPLOYMENT.md](DEPLOYMENT.md).
