# Sepolia two-player match evidence

Verified through `https://ethereum-sepolia-rpc.publicnode.com` on **21 October 2026**. This document describes the match contract, separately from the earlier open-board evidence in DEPLOYMENT.md.

| Item | Value |
| --- | --- |
| Network | Ethereum Sepolia, chain ID 11155111 |
| Match contract | [`0x98f9726a04Fc43b6145A270f61c9a97243650A33`](https://sepolia.etherscan.io/address/0x98f9726a04Fc43b6145A270f61c9a97243650A33) |
| Configuration | Decay 10 blocks; reinforcement cooldown 3 blocks; power cap 5; match duration 100 blocks |
| Player 1 / A | `0x104674c96993e62Af72407A6d76aBCE55725e2d2` |
| Player 2 / B | `0xcc157a66abbc356c1bf794CE83EBA2444ca201B1` |
| Start block | 11956131 |
| Deadline block | 11956231 |
| Result block | 11957401 |
| Recorded winner | Player 2 / B |
| Final scores | A: 0, B: 3 |
| Final state | `phase() = 3`, `finalized() = true` |

## Transactions checked

| Action | Block | Transaction |
| --- | --- | --- |
| Player 1 joins | 11956080 | [Join seat 1](https://sepolia.etherscan.io/tx/0x4fb734d3f75760a84bb3f57a8f7833de49010a9a601afd7edcd04abe9505805c) |
| Player 2 joins and starts match | 11956131 | [Join seat 2 / MatchStarted](https://sepolia.etherscan.io/tx/0x3da4fb3ee3a71ddcfbac997323fbb679dbd4c9ee1cae871d84596d8a193577d5) |
| B claims B1 | 11956140 | [Claim B1](https://sepolia.etherscan.io/tx/0x22f7480e19132aed66eaed1cd2e5e800c5ebe7561e81ddc17b92215caf7d3ceb) |
| B reinforces B1 to power 2 | 11956146 | [Reinforce B1](https://sepolia.etherscan.io/tx/0xad6e7f017b8f22b993fc7d9595a1862dc51e3e6a51146b361bd432d534f99a2a) |
| B captures A1 from B1 | 11956155 | [Capture A1](https://sepolia.etherscan.io/tx/0xdd86633ffd4c8a030cf1a26555e33538294bc32cedac7e07cdc51fe95f95f654) |
| Record final result | 11957401 | [MatchFinalized](https://sepolia.etherscan.io/tx/0x874687427e1221263cf0a5d55ec697fb2d0f26fbb8eda130365128fb2764eb37) |

Logs were filtered to the match contract address. The second join emitted both starting claims (A1 for A, H8 for B) and `MatchStarted(11956131,11956231)`. The capture emitted B as attacker, A as previous owner, coordinates `(1,0) → (0,0)` and remaining source power 1.

The result receipt has status **1** and includes `MatchFinalized(B,0,3)`. Current reads independently confirm winner B and scores 0/3. `getGrid()` contains exactly three owned tiles: A1, B1 and H8, all belonging to B at effective power 1. No C1 claim occurred in this match.

The [saved real MetaMask screenshot](screenshots/sepolia-match-result.png) was visually reviewed and embedded in README. It shows Sepolia, Player 2 wins, 0 blocks left, scores 0/3, and Result confirmed at block 11957401. Its displayed current block is 11957441.

## Verification scope

Receipt, event logs, settings and current contract state were checked independently. A historical `getGrid()` call at the deadline was unavailable on this public RPC; no historical-grid comparison is claimed. The local automated tests cover exact deadline rejection and freezing effective power. These checks do not constitute explorer source verification or a compiled-runtime comparison for this new deployment.
