# Two-player match reference

`contracts/BlockConquestMatch.sol` is a standalone contract; `BlockConquest.sol` remains the unchanged earlier open board. The match is deployed on Sepolia at `0x98f9726a04Fc43b6145A270f61c9a97243650A33`. Constructor order: decay interval, reinforcement cooldown, power cap, match duration. Its `(10, 3, 5, 100)` values and empty lobby were read through Sepolia RPC at block 11956053. This read is not source-code verification or a live gameplay acceptance test.

## Lifecycle

| phase() | Meaning | Allowed writes |
| --- | --- | --- |
| 0 / Waiting | Zero or one registered player | `join()` by a distinct address |
| 1 / Active | Two players and current block < endBlock | `claim`, `reinforce`, `attack` by the registered players |
| 2 / Ended | Current block >= endBlock, result not recorded | `finalize()` by anyone |
| 3 / Finalized | Result recorded | None |

The first join reserves a seat without allocating territory. The second join sets `startBlock`, `endBlock = startBlock + matchDuration`, and A1/H8 with identical power 1 and update blocks. Starting tiles emit `TileClaimed` and are subject to reinforcement cooldown.

At exactly `endBlock`, moves revert. Finalization is allowed in that block. Therefore, ownership and scores are locked even when finalization is delayed. Effective power uses `min(block.number, endBlock)` after the match starts, preserving the final board. `getTile()` still returns stored power; `getGrid()` and `effectivePower()` return effective power.

`winner()` is meaningful as a recorded result only when `finalized()` is true. It is the winning address or the zero address for a draw. `MatchFinalized` records both final scores. Before finalization, the UI computes the already locked outcome from grid owners and labels it as waiting for recording. A new deployment is required for another match.

No on-chain player enumeration is maintained: the two seat addresses are fixed match participants, and the frontend leaderboard still counts grid ownership. The match scoreboard includes participants with zero tiles. P1/P2 labels always correspond to the seats, independent of rank or browser storage.

## Local block clock

Hardhat normally mines when a transaction arrives. To advance to the deadline without making game moves, run the following PowerShell command while the local node is running. It advances 100 blocks, enough for the default match to expire after it starts:

```powershell
$matchRpcBody = @{ jsonrpc = '2.0'; id = 1; method = 'hardhat_mine'; params = @('0x64') } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri http://127.0.0.1:8545 -Method Post -ContentType 'application/json' -Body $matchRpcBody
```

This is a development RPC supported by local Hardhat, not a Sepolia action. The frontend should show the ended match, disable moves and enable **Record final result**. A spectator may record it as well. Restarting the local node loses its deployed contracts and requires redeployment.

## Manual Sepolia acceptance after deployment

1. Deploy and read back all four constructor settings; save the creation transaction.
2. Load the match in MetaMask with player 1; join and confirm it waits without starting the clock.
3. Join with player 2; check A1/H8, one point each and the countdown. Confirm a third account sees spectator controls.
4. Claim adjacent territory with the two players; reinforce and capture. Confirm score transfer and attack estimate.
5. Observe the deadline close moves. Record the winner or draw, refresh, and confirm the result persists.
6. Save transaction links and a screenshot that includes the network, match result and scores. Repeat disconnect/reconnect in the deployed match.

Deployment and a live two-player match are complete. Both players joined, B claimed and reinforced B1, captured A1, and won 3–0 after the deadline; the result was recorded and independently checked. See [live match evidence](MATCH_DEPLOYMENT.md) and the [saved result screenshot](screenshots/sepolia-match-result.png), embedded in README. Third-account spectator controls and disconnect/reconnect remain covered by local automated tests rather than this live session.
