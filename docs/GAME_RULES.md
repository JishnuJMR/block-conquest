# Block timing and effective power

These tile mechanics apply to both contracts. The two-player version adds a fourth constructor argument (match duration), two registered seats and a deadline. See [match rules](MATCH.md). Effective power in a match freezes at the deadline; the open board continues decaying indefinitely.

The constructor's default values are `(10, 3, 5)`: decay interval in blocks, reinforcement cooldown in blocks, and power cap. They are fixed for the lifetime of a deployed contract.

## Lazy decay

For an owned tile, effective power is `max(1, storedPower - floor(elapsedBlocks / decayInterval))`. Empty tiles always have power 0. Solidity checks whether decay has exhausted stored power **before** subtracting, so long inactivity cannot cause unsigned subtraction underflow.

For example, with stored power 5 and last update at block 100:

| Current block | Effective power |
| --- | --- |
| 100–109 | 5 |
| 110–119 | 4 |
| 120–129 | 3 |
| 130–139 | 2 |
| 140 and later | 1 |

Nothing needs to send a transaction to apply decay. `effectivePower()` and `getGrid()` compute it when read. `getTile()` deliberately returns the stored power and timestamp, which may differ from effective power. Ownership and score survive decay.

## Reinforcement and cooldown

A tile claimed at block 100 can first be reinforced at block 103 with cooldown 3. Reinforcement at block 103 increases effective power by 1 and starts both timers from 103, so the next reinforcement is allowed at 106. A rejected transaction does not change the tile or its timers.

Reinforcement checks the cap using effective power. If a tile stored power 5 but decayed to 1, reinforcement stores **2**, then updates its timestamp. It does not restore 5 or add to the old stored value.

Cooldown is per tile. It applies to reinforcement after a claim, reinforcement, or successful attack. An attack resets the timers on both its source and captured tile. Attacks have no separate waiting requirement.

## Combat after decay

Both effective powers are calculated before modifying either tile. With effective source power 3 and defender power 1, capture leaves source power **2** and captured power **1**, regardless of their old stored powers. The source must be strictly stronger, so equal power cannot capture. Scores transfer one owned tile from the defender to the attacker.

After storing these results, both tiles' last-update blocks become the attack's inclusion block. This prevents old decay from immediately reducing the newly stored source power.

## Transaction timing

Reads show the state at the block queried. A wallet transaction may be mined in a later block where power or cooldown eligibility has changed. For example, a power-2 source at block 109 may decay to 1 at block 110 and fail to capture a power-1 target. The contract's check at execution is authoritative. The frontend must refresh on new blocks and show failed transaction feedback.

Local tests mine explicit block counts, account for the transaction itself mining the next block, and check both sides of each boundary. Run `npm test` to reproduce them; no wallet is needed. Use `npm.cmd test` on Windows PowerShell if script policy blocks npm.ps1.
