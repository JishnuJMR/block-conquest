# Milestone 2: throwaway Sepolia deployment and first MetaMask claim

> Historical setup guide for an obsolete deployment. Use the root README and docs/DEPLOYMENT.md for the active contract. Historical source is preserved in docs/dev-notes/archive/BlockConquest.milestone-1.sol. Statuses and old paths below describe earlier milestones.

Status: the user reported completing this setup check on **18 October 2026**, including a deployed address, getTile owner output, and scoreOf = 1 after claiming `(0,0)`. Transaction hashes and independent receipt/full-state verification are still outstanding. The historical deployment is the basic contract without decay/cooldown; the current local source now implements those rules. Do not use the historical address as the final assignment deployment.

The original rehearsal passed 28 local tests. Milestone 3 now passes 62 tests with decay and cooldown, including the current deployment module. This guide records the browser setup flow; there is no need to repeat deployment for the completed setup check.

## 1. Install and fund MetaMask (you perform these steps)

1. Start at [MetaMask's official installation guide](https://support.metamask.io/hc/en-us/articles/360015489531) and follow its extension link for your browser.
2. Create a wallet for this assignment and follow the wallet's backup instructions. Keep recovery material private and offline. Never enter it in this project, Git, chat, or a faucet. No key export is required for the browser deployment below.
3. Open MetaMask's network selector and enable **Show test networks**, then select **Sepolia** (Ethereum Sepolia, chain ID **11155111**, not Base Sepolia or another network). See [MetaMask's testnet instructions](https://support.metamask.io/configure/networks/how-to-view-testnets-in-metamask/).
4. Copy the account's public `0x...` address. Use [Google Cloud's Ethereum Sepolia faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) to request test ETH and follow its sign-in instructions. This was the working route used in this session after the MetaMask documentation link led to Infura API documentation. No Infura API key is needed for the Remix/MetaMask flow. Faucet availability and eligibility can vary; [ethereum.org's network page](https://ethereum.org/developers/docs/networks/) lists alternatives. Do not buy real ETH for this exercise.
5. Wait for a positive Sepolia ETH balance. Deployment and claiming require gas even though no ETH is sent to the contract. If the faucet refuses your request, share its error text without credentials so we can resolve it.

You may share your public address and transaction hashes. Never share your seed phrase, private key, or wallet password.

## 2. Local rehearsal (optional to repeat)

In VS Code's PowerShell terminal:

```powershell
cd C:\folder\blockchain
npm.cmd test
npm.cmd run typecheck
npm.cmd run deploy:rehearsal
```

The current deployment module is `ignition/modules/BlockConquest.ts`. It uses constructor arguments `(10, 3, 5)` and deploys the current contract with decay/cooldown. The rehearsal command explicitly targets an in-memory Hardhat network, despite its name `hardhatMainnet`; it cannot broadcast to Ethereum mainnet or Sepolia. The simulated chain disappears when the command exits. Any printed local address is not a Sepolia deployment address. The automated deployment test uses an ethers signer; it cannot substitute for a real MetaMask confirmation.

## 3. Browser deployment procedure (historical setup reference)

The basic source used during this setup check is preserved in `docs/archive/BlockConquest.milestone-1.sol`. The instructions below use the current source when a new deployment is explicitly authorized. Do not repeat deployment simply because the local source changed; final deployment is a later milestone.

We use Remix's browser-wallet interface for this setup check so signing stays in MetaMask. Hardhat remains the local compiler/test tool; the final frontend will use ethers.js. A separate RPC account or exported private key is not needed for this route.

1. Open [Remix](https://remix.ethereum.org/) in the browser with MetaMask installed. Create `contracts/BlockConquest.sol` and copy the entire current file from this project into it. Do not use an unrelated sample contract.
2. In **Solidity Compiler**, choose version **0.8.28**, enable the optimizer with **200 runs**, and select EVM target **cancun** in advanced settings. Compile `BlockConquest.sol`. These match the local build settings.
3. In **Deploy & Run**, choose **Browser Extension → MetaMask** (some versions label this **Injected Provider – MetaMask**). Approve the connection for your assignment account. Confirm that Remix and MetaMask both show **Sepolia / 11155111**. Do not choose Remix VM for this live check.
4. Select `BlockConquest`. Leave **Value = 0 wei**. Enter constructor values `10, 3, 5` in that order. Leave optional source verification off for this throwaway step; it is not required to call the contract through Remix.
5. Click **Deploy** and inspect the MetaMask request: Sepolia, your test account, contract creation, zero transferred ETH plus a testnet gas fee. Confirm once. If it is rejected or fails, inspect the error before submitting again.
6. Wait for the receipt. Copy the **deployed contract address** and **deployment transaction hash**. Confirm successful status on the Sepolia explorer linked by MetaMask. A transaction hash alone does not prove success.

The browser flow is documented in [Remix Deploy & Run](https://remix-ide.readthedocs.io/en/latest/run.html). Wallet connection approves access to an account address; deploying is a separate signed transaction.

## 4. Make one claim through MetaMask

1. Expand the deployed `BlockConquest` instance in Remix.
2. Read `decayInterval()` → `10`, `reinforcementCooldown()` → `3`, and `maxPower()` → `5`. These reads do not need transaction confirmation.
3. Read `getTile(0, 0)`; it should have zero owner and power `0`. Since this is a shared public board, if someone already claimed it, choose another empty coordinate in the range 0–7.
4. Expand `claim`, enter the empty tile's `x` and `y`, and submit with **Value = 0**. Confirm the contract interaction in MetaMask and wait for successful inclusion.
5. Read `getTile(x, y)` again: owner must equal your connected public address and power must be `1`. Read `scoreOf(yourPublicAddress)`; it should be `1` if this is your first claim and no subsequent capture changed it. `effectivePower(x, y)` should be `1`.
6. Record the claim transaction hash. The receipt should include `TileClaimed`. Share the public contract address and both transaction hashes so we can verify and record the result.

If the page is refreshed, recompile the same source and use **Add Contract / At Address** to load the saved address; do not redeploy just to reconnect. A rejected signature sends no transaction. An occupied-tile error means choose a different empty tile. Insufficient funds means the selected account needs more Sepolia test ETH. Wrong-network errors mean select Ethereum Sepolia before trying again.

## Completion record

- Network: Ethereum Sepolia (11155111)
- Constructor: `(10, 3, 5)`
- Historical contract address (user-reported): `0x5A6dB2fA7424F519a10805c48EF33F4eA141A9c9`
- Deployment transaction hash: not provided
- Claim coordinates (user-reported): `(0,0)`; transaction hash not provided
- User readback: getTile returned an owner beginning `0x10...`; scoreOf returned `1`
- Independent receipt and full owner/power verification: pending
- Current contract with decay/cooldown: not publicly deployed

Milestone 2 is treated as complete based on the user's report. Preserve the distinction between that report and independent on-chain verification. Milestone 3 implements safe decay and cooldown locally; the final version will require a new deployment after frontend work and explicit authorization.
