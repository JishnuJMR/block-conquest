# Standard Bearer — Phase 2 design system

Status: foundation for the approved hybrid Direction C, awaiting approval for integration. See [DESIGN.md](DESIGN.md) for the current brand, player crests, action feedback, legacy-mode treatment and before/after review. All pictured matches and pending/recorded states are mock data.

## Identity

Ivory space, a navy playing surface, cobalt and terracotta factions, brass targeting, geometric crests and condensed editorial typography. The board is the central object. Geometry comes from territory squares and standards, not cryptocurrency widgets or decorative terrain.

The Block Conquest mark retains its four territories and shield silhouette. A cut brass square and lower notch establish the stepped-square motif. Cobalt's crest is a squared shield with a stepped C-shaped counter; Ember's is a split pennant inside an angular seal. Both are inline SVG, legible without colour, and reused in scores, inspection, standings and results. Larger tiles carry inverted miniature crests; small mobile tiles prioritize power, patterns and labels.

## Colour tokens

| Token | Value | Role |
| --- | --- | --- |
| `--ivory` | `#F4F1E8` | Page, text on owned tiles, quiet surfaces |
| `--navy` | `#182B3A` | Board frame, text, controls, attack-path underlay |
| `--cobalt` | `#2459B8` | Player 1, shield and diagonal ownership pattern |
| `--cobalt-dark` | `#19478E` | Source power in the estimate |
| `--terracotta` | `#B94827` | Player 2, angular crest and dotted pattern |
| `--terracotta-dark` | `#94381F` | Defender power in the estimate |
| `--brass` | `#B48728` | Countdown, estimate edge and completion rule |
| `--gold` | `#EFCF7B` | High-visibility selection and targeting on navy |
| `--line` | `#D1CFC3` | Separators on ivory |
| `--muted` | `#5E655F` | Supporting text |
| Empty territory | `#E9E8DE` | Inset neutral square, quiet corner registration mark |
| Estimate surface | `#EAE1C9` | Localized power-cost explanation |

Do not use brass for small text on ivory. Colour is always reinforced by labels, shape or line treatment. Functional ownership patterns are the only gradients; there is no decorative gradient layer.

## Typography and spacing

Fonts are bundled locally with their OFL licenses: **Barlow Condensed SemiBold** for headings and power, **Source Sans 3 Variable** for interface text, and the existing system monospace stack for coordinates and addresses.

| Element | Desktop | Mobile |
| --- | --- | --- |
| Field title | 38px | 26px |
| Inspector title | 34px | 31px |
| Result title | 34–49px | 32px |
| Instructions | 15px | 15px |
| Supporting feedback | 12–13px | 12–13px |
| Primary action | 14px, minimum 47px high | 14px, minimum 46px high |
| Tile power | 20–34px | 21px at requested widths |
| Tile owner | 10px | 9px; deliberately compact within the fixed eight-column board |
| Coordinates | 11px | 10px |

Tiny type is reserved for compact identity or board metadata. Rules, errors and estimates use readable body text. Compact labels must not replace the full owner/power accessible names on tiles.

Spacing follows 4/8/12/16/24/32px, with 3–4px board gutters and small optical adjustments. Controls have 2px corners; boards and editorial sections remain square. Do not add floating rounded cards.

## Board state language

| State | Visual treatment | Meaning and feedback |
| --- | --- | --- |
| Empty | Neutral inset square and corner registration mark; coordinate on hover/focus or selection | No owner, effective power 0 |
| Cobalt | Blue, diagonal hatch, power and `You` | Player 1 territory |
| Ember | Terracotta, dots, power and `P2` | Player 2 territory |
| Selected | Solid brass frame with a navy inner separation; navy/ivory treatment on empty ground | Territory under inspection |
| Attack source | Ivory inner frame and small corner marker | Power is paid from this tile |
| Attackable | Inset dashed brass frame | Adjacent enemy with strictly lower effective power |
| Chosen target | Solid brass frame plus directional path | This is the target in the current estimate |
| Pending | Ivory dashed frame, navy inner separation and static hourglass on affected tiles | Mock confirmation is pending; ownership and scores remain unchanged |
| Confirmed | Short local frame/reveal; explicit confirmation text | Mock state has changed; standings update from board owners |
| Keyboard focus | Separate outer focus outline | Does not replace selection or targeting |

The attack connector uses the same endpoints for a navy underlay and a brass top stroke. The head has a navy keyline so it remains visible across both factions and gutters. It connects tile edges rather than covering the power numerals.

Empty tiles do not imply connected expansion. Any empty tile can be claimed during an active match. Patterns and player labels remain visible in selected and pending states.

## Mobile composition and dock

1. Compact brand and guide access.
2. Score contest and block countdown, with player scores beside identities.
3. Field title, full coordinate frame and eight board rows.
4. State legend and the **single shared action row**.
5. Inspector, estimate, current ownership standings, collapsible rules and study controls.

The same action-row DOM node is moved between desktop and mobile. It is never duplicated. On mobile it occupies normal document flow after the board and becomes sticky at the top only after that position is reached. Its containing workspace extends through the inspector. A fixed bottom overlay is deliberately avoided: row eight remains visible and reachable at any tested scroll position, including short viewports.

When actions are unavailable, explain why in the inspector rather than filling the dock with a disabled multiline attack button. Feedback appears inside the action row. Rule details are collapsed by default but remain keyboard-accessible. On a shorter phone, a small scroll may be needed to reach the action row; the board is not covered to force both into one viewport.

The requested 360px, 390px and 430px widths are checked, including short 640px-high variants. Additional 320px, tablet and desktop regression sizes are included. This is browser validation, not a claim of physical-device testing.

## Completion

Completion is an in-page editorial result, not a modal blocking the final board.

- **Victory:** winning crest, `VICTORY / PLAYER`, faction headline and both final scores. Colour follows the winner, not always the connected player.
- **Draw:** equal visual weight for both crests, neutral framing and equal scores. No winning-player emphasis.
- **Deadline reached:** ownership, scores and effective power freeze; the panel says `SCORES LOCKED · RESULT NOT RECORDED`.
- **Mock result recording:** explicit pending label; a confirmation check appears only after recording.
- **Recorded:** `MOCK RESULT RECORDED`; no restart or rematch button implying a new match can begin in the same contract.

The Victory and Draw scenes are already-recorded mock snapshots. The running mock clock also demonstrates the unrecorded and recorded distinction. Tile inspection remains available after completion; actions and the gameplay dock close.

## Motion

| Feedback | Duration | Reduced-motion equivalent |
| --- | --- | --- |
| Claim registration | 340ms local frame | Static outline and text |
| Reinforcement | 320ms numeral settle; 650ms `+1` cue | Static numeric cue, outline and text |
| Capture frame | 440ms | Static outline and text |
| Capture surface reveal | 380ms, low-opacity local wipe | No reveal overlay |
| Mock pending | 900ms simulated wait, no looping animation | Same static hourglass/frame |

Do not animate ownership or scores before confirmation. Do not shake the board, flash the full screen, bounce counters or use confetti. Mock pending is a prototype timing aid, not a rule or estimate of blockchain confirmation time. The optional clock runs one simulated block per 1.5 seconds; this is not Sepolia timing.

## Language

Use **Territory & actions**, **Select a territory**, **Choose attack target**, **Attack estimate**, **Mock confirmation pending** and **Final territory**. Do not label an area “Your move” or introduce “Your turn”, “End turn”, round counters or turn-order indicators. Both players may act while a match is active.

Keep terms precise: power differs from score; decay does not remove ownership; cooldown restricts reinforcement; the deadline ends play and recording stores the result afterward.

## Isolation and acceptance

- HTML, CSS and plain JavaScript remain served by the independent Vite configuration.
- `mock-data.js` contains fixtures and mock rule values; `main.js` owns prototype interactions and rendering.
- No application imports, wallet access, RPC calls, environment-file loading or browser persistence.
- Only prototype files and its screenshots are changed. Nothing is deployed or published.
- `verify.mjs` covers state transitions, pending races, keyboard controls, reduced motion, deadline/recording, both outcomes, responsive control relocation and row-eight clearance.
- Integration into the real application still requires explicit approval. This prototype does not implement or validate the real wallet experience.
