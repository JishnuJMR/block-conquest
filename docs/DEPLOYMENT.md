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

The claim receipt has status 1 and contains the game contract's TileClaimed event for the creator account above. Its outer transaction destination is a wallet execution/router address; verification used the emitting contract address, rather than assuming a direct transaction. The reinforcement log records power 2. Current reads show H1 owned by that account at effective power 1 with score 1. The user separately observed reinforcement to 2 followed by decay to 1.

The saved [Sepolia screenshot](screenshots/sepolia-board.png) shows reinforcement confirmed at block 11939902 and current block 11939931, H1 power 1, and score 1. It supports the end state, not an exact observation of the first decay block.

## Evidence still to collect

- Two-account capture transaction and a Sepolia screenshot showing two owner colours.
- Human MetaMask acceptance from the fresh checkout; automated browser/RPC checks are separate.

The public RPC did not serve historical account state at the creation block, so no historical getCode check is claimed. Creation was checked using its receipt; runtime and parameter checks use current chain state.
