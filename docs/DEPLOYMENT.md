# Sepolia deployment evidence

## Verified deployment

| Item | Value |
| --- | --- |
| Network | Ethereum Sepolia, chain ID 11155111 |
| Contract | [`0x4D8ebB57f5140fD302F7b1f4Ff57EF23ff1c3Cb3`](https://sepolia.etherscan.io/address/0x4D8ebB57f5140fD302F7b1f4Ff57EF23ff1c3Cb3) |
| Creation transaction | [`0xca33b7db66a7fa2db1460285581d2cc879d2e03b4d9626d2ea2fae11ca505d81`](https://sepolia.etherscan.io/tx/0xca33b7db66a7fa2db1460285581d2cc879d2e03b4d9626d2ea2fae11ca505d81) |
| Creation block | 11939856 |
| Creator | `0x104674c96993e62Af72407A6d76aBCE55725e2d2` |
| decayInterval() | 10 blocks |
| reinforcementCooldown() | 3 blocks |
| maxPower() | 5 |

The Etherscan address page identifies the creation transaction. Sepolia RPC independently confirms its successful receipt and matching contractAddress. The three parameters were read through contract calls. The deployed runtime matches the compiled contracts/BlockConquest.sol runtime after removing trailing compiler metadata and masking compiler-reported immutable offsets. This is a local comparison, not explorer source-code verification.

## Verified frontend transactions

| Action | Transaction | Block | Event |
| --- | --- | --- | --- |
| Claim H1 | [0x9fcbd743…2802ddd](https://sepolia.etherscan.io/tx/0x9fcbd74381c90cf660a619e1a2973635458608b1b6ff62d518cd34f552802ddd) | 11939882 | TileClaimed(player, 7, 0) |
| Reinforce H1 | [0xaf99d3aa…d3de50c](https://sepolia.etherscan.io/tx/0xaf99d3aa6b37990fee418dbef511ff39a5e450a6f55658a73ba413a87d3de50c) | 11939902 | TileReinforced(player, 7, 0, 2) |
| Capture G1 from H1 | [0xf868656f…f0ecb47](https://sepolia.etherscan.io/tx/0xf868656f729c9704f55e5cdaa958dc707028629772a7a3723a0917469f0ecb47) | 11940708 | TileCaptured(A, B, 7, 0, 6, 0, 1) |

The claim receipt has status 1 and contains the game contract's TileClaimed event for the creator account above. Its outer transaction destination is a wallet execution/router address; verification used the emitting contract address, rather than assuming a direct transaction. The reinforcement log records power 2. Before the later capture, reads showed H1 owned by that account at effective power 1 with score 1. The user separately observed reinforcement to 2 followed by decay to 1.

The saved [Sepolia screenshot](screenshots/sepolia-board.png) shows reinforcement confirmed at block 11939902 and current block 11939931, H1 power 1, and score 1. It supports the end state, not an exact observation of the first decay block.

## Verified two-account capture

Account A: `0x104674c96993e62Af72407A6d76aBCE55725e2d2`.
Account B: `0xcc157a66abbc356c1bf794CE83EBA2444ca201B1`.

The capture receipt has status 1 and contains TileCaptured emitted by the deployed game address, with A as attacker, B as previous owner, source `(7,0)`, target `(6,0)`, and final source power 1. Contract calls at block **11940708** independently confirmed:

| Read | Result |
| --- | --- |
| getTile(7,0), H1 | A-owned, power 1, lastUpdateBlock 11940708 |
| getTile(6,0), G1 | A-owned, power 1, lastUpdateBlock 11940708 |
| getTile(6,1), G2 | B-owned, power 1 |
| scoreOf(A) | 2 |
| scoreOf(B) | 1 |

The reviewed [capture screenshot](screenshots/sepolia-capture.png) shows both owner colours, scores 2 and 1, and **Attack confirmed** at block 11940708. It is embedded in README.

## Fresh-checkout acceptance

A clean clone of the revised tracked snapshot passed installation, all 80 tests, typechecking, and production build. Its development server returned HTTP 200 on the documented port-5174 fallback. The user opened that fresh-checkout app, configured Sepolia/address, connected real MetaMask, and confirmed the board loaded. See [validation details](VALIDATION.md). The human confirmation is separate from automated browser/RPC checks.

The public RPC did not serve historical account state at the creation block, so no historical getCode check is claimed. Creation was checked using its receipt; runtime and parameter checks use current chain state.
