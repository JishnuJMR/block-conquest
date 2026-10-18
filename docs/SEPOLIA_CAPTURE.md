# Two-account Sepolia capture demonstration

Completed: [attack transaction](https://sepolia.etherscan.io/tx/0xf868656f729c9704f55e5cdaa958dc707028629772a7a3723a0917469f0ecb47), block 11940708. Receipt/event and post-attack board state were independently verified. The [capture screenshot](screenshots/sepolia-capture.png) shows two colours, scores A: 2 and B: 1, and Attack confirmed. The procedure below documents reproduction on a suitable board; the demonstrated G1 is now A-owned.

Use the existing contract `0x4D8ebB57f5140fD302F7b1f4Ff57EF23ff1c3Cb3`. No code change or redeployment is needed. Perform wallet confirmations yourself. Both accounts use Ethereum Sepolia, chain ID 11155111.

## Prepare the second account

1. In MetaMask, open the account selector and choose the option to create/add another **Ethereum account**. Name it **Block Conquest B**. Create it within the existing wallet; no key import or new seed phrase is needed.
2. Copy B's public address.
3. Switch to the original account A (the one ending `e2d2` that owns H1).
4. With **Sepolia** selected, use **Send** to transfer **0.003 SepoliaETH** to B. Review the destination, network, amount, and testnet gas fee in MetaMask before confirming. Wait for confirmation. This uses the existing test balance; no real ETH purchase is required.

## Create two colours on the board

1. Switch MetaMask to B and connect B to the frontend if asked. Check the app's connected address matches B before submitting anything.
2. Select **G1** (contract `(6,0)`) if empty. Claim it and confirm in MetaMask.
3. Also claim **G2** (`(6,1)`) if empty. This tile stays with B after G1 is captured, preserving two colours in the final screenshot.
4. Check B has score 2 and the original H1 has a different owner colour. If either proposed tile is occupied, stop and choose the source/target arrangement based on current board ownership instead of attempting an invalid claim.

## Perform the capture

1. Switch MetaMask back to A. Check the frontend's connected account matches A.
2. Select **H1** (`(7,0)`). If effective power is 1 and reinforcement is Ready, click **Reinforce** and confirm. Wait for power 2.
3. While H1 is still stronger than G1, select H1 → **Choose attack target** → **G1** → **Confirm attack**. Confirm in MetaMask.
4. After success, H1 should have power 1, G1 should be owned by A at power 1, and G2 should remain B-owned. A's score should be 2 and B's score 1, assuming these are their only tiles and no other move intervened.

Decay continues while a wallet request is open. If H1 falls back to 1 before capture, reinforce again after cooldown and retry with current effective powers. Do not redeploy. Capture is legal only while the source is strictly stronger than the adjacent defender.

## Save evidence

- Copy the attack transaction hash from **View transaction**.
- Save a screenshot showing Sepolia, the two owner colours, score/leaderboard, and **Attack confirmed** to `docs/screenshots/sepolia-capture.png`.
- Record the hash and verify the contract-emitted `TileCaptured` event, source/captured power, and scores through RPC. Add the checked attack link and screenshot to README.

## Fresh-checkout wallet acceptance

If using the clean-checkout server, open its printed localhost URL, set the contract address and Ethereum Sepolia in Board settings, and approve MetaMask account access. Confirm that H1 and the current score load. This human extension check is distinct from browser tests with the local test adapter.
