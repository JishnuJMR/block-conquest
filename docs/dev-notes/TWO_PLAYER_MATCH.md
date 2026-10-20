# Two-player match plan — 18 October 2026

Baseline: `v3-survey-atlas-open-board` at `d9af00b`. Work branch: `feature/two-player-match`.

One match per deployment. First two distinct addresses join; the second join starts the clock and assigns A1/H8 at power 1, with equal update blocks. Only those players can claim, reinforce or attack during the match. Existing tile rules remain. Default constructor settings: decay 10, cooldown 3, cap 5, duration 100 blocks. Duration must exceed cooldown and fit uint64; all settings are immutable.

Moves require inclusion strictly before `endBlock = startBlock + matchDuration`. At and after that block, scores and ownership cannot change; effective power freezes at the deadline. Anyone may finalize. Higher score wins; equal scores draw. Losing all tiles is not elimination: either player may claim any empty tile during play. There is no reset, prize, staking, admin or upgrade. A fresh deployment creates another match. Seats are open, cannot be released, and one person may control both wallets. Claiming is unrestricted; balance needs playtesting.

The frontend explicitly distinguishes match contracts from the existing open-board contract. It shows seats, deadline, both scores (including zero), join/finalize actions, spectators, and final results. Legacy on-chain evidence applies only to the open board. No public deployment or publication is authorized by this build request.

- [x] Preserve baseline in Git.
- [x] Match contract and lifecycle/gameplay tests: 90 contract checks including both versions and deployment rehearsals.
- [x] Match UI and browser tests, including deadline and wallet changes: 12 logic and 29 browser checks passed.
- [x] Local screenshots, README and deployment instructions.
- [x] Fresh-checkout validation at `f2aa1f4`: clean install, all 131 tests, typecheck, build, dev startup and HTTP 200. See ../VALIDATION.md.
- [x] Review local desktop result and mobile lobby screenshots before requesting Sepolia deployment.

## Live follow-up — 21 October 2026

The user deployed the match to Sepolia at `0x98f9726a04Fc43b6145A270f61c9a97243650A33`. Both players joined and B won 3–0 after claiming B1, reinforcing it and capturing A1. Finalization receipt, events, settings and current scores were independently checked. See [match evidence](../MATCH_DEPLOYMENT.md). The [real result screenshot](../screenshots/sepolia-match-result.png) is saved, visually reviewed and embedded in README. The branch remains local; no GitHub upload is authorized by supplying this evidence.
