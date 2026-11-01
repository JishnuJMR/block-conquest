# Block Conquest — approved hybrid direction (C)

Direction C combines **Standard Bearer's editorial tabletop foundation** with a more distinctive game identity. This records the direction explicitly selected in the design brief. The implementation described here is still an **isolated prototype awaiting approval for integration**. It is not the earlier unrelated three-direction concept named Paper Rivals.

## Preserved foundation

Warm ivory, a deep navy playing surface, cobalt and terracotta ownership, geometric player emblems, functional ownership patterns, condensed display typography and a board-first layout. No new gameplay, decorative terrain, neon, glass surfaces, currencies, rematch system or cryptocurrency-dashboard components are introduced.

## The identity: every square counts

The brand motif is a **stepped territory square**: a held square with one corner open, repeated as an offset pair and a selected corner. This comes from claiming territory and counting ownership, not from fictional game lore.

- **Shield:** four territories inside the existing shield silhouette. The brass territory has a cut corner; the lower notch completes the standard. It remains a compact SVG suitable for the favicon and mobile header.
- **Wordmark:** tracked `BLOCK` above a dense `CONQUEST`, with an offset-square accent and a brass square terminal. Both lines retain Barlow Condensed.
- **Board:** a brass corner rule and two quiet registration squares give the frame the same signature. The board remains square and untextured; no terrain or adjacency restriction is implied.
- **Completion:** the motif frames the winning or shared standard. The final field stays inspectable.

The [identity study](identity.html) shows the mark, wordmark, player emblems, ownership samples, greyscale silhouettes and 16/24/40px mark sizes.

## Player identities

| Player | Crest | Ownership pattern | Labels |
| --- | --- | --- | --- |
| Cobalt | Squared shield with a stepped C-shaped internal counter | Diagonal hatch | P1 / You |
| Ember | Angular seal containing a split pennant | Dots | P2 |

The same crest shapes appear in the scoreboard, inspector, standings and result. Larger desktop tiles carry a small inverted crest; mobile tiles prioritize the power numeral, pattern and owner label. Small tile crests are hidden rather than squeezing the number. These are visual identities, not different player abilities.

Exported vectors: [shield](assets/mark.svg), [Cobalt](assets/crest-cobalt.svg), [Ember](assets/crest-ember.svg). The two crest exports match the inline symbols used in the prototype.

## Palette and typography

The detailed [design system](DESIGN_SYSTEM.md) remains the foundation. The hybrid layer adds branding and action feedback without replacing its tokens.

| Role | Value |
| --- | --- |
| Ivory | `#F4F1E8` |
| Navy | `#182B3A` |
| Cobalt | `#2459B8` |
| Terracotta | `#B94827` |
| Brass / light brass | `#B48728` / `#EFCF7B` |
| Supporting text | `#5E655F` |
| Display / power | Barlow Condensed SemiBold |
| Body / controls | Source Sans 3 Variable |

Fonts and OFL licenses are bundled locally. Gradients only draw ownership patterns. No external font or image requests are needed. Readable body text takes priority over decorative micro-labels.

## Board and action language

Empty ground uses a quiet corner registration mark; selection reveals its coordinate. Selected and chosen targets have a solid brass frame separated from the tile by navy. Attackable enemies use a dashed brass frame. Pending tiles retain their owner and power under an ivory dashed frame and a static hourglass. Keyboard focus is independent of selection.

The directional connector has a navy underlay, brass stroke and outlined arrowhead. It connects tile edges while leaving the power numerals clear. Its numerical counterpart always shows **source power − defender power = source remaining**, plus captured power 1, and labels the result an estimate.

| Action | Pending | Confirmed or failed |
| --- | --- | --- |
| Claim | Neutral ground stays empty | Short local registration frame; “Ground secured”; owner becomes Cobalt, power 1 and score +1 |
| Reinforce | Old power remains visible | Small numeral settle and `+1` cue; “Power reinforced”; effective power increases by one |
| Capture | Both owners and powers remain unchanged | Direction-aware low-opacity reveal and local frame; “Territory captured”; source pays defender power and scores transfer |
| Failure | Same static pending treatment | Cross icon and terracotta feedback; no ownership, power or score mutation; the valid action remains retryable |
| Result recording | Explicit mock pending label | Recorded check only after completion; failed recording leaves the result unrecorded with a visible error |

The prototype waits 900ms to demonstrate pending state. This duration is not a game rule or a prediction of Sepolia confirmation speed. In the eventual application, only a successful transaction receipt may trigger ownership/score changes or success animation. A submitted, rejected, reverted or replaced transaction must remain distinguishable.

Claim and reinforcement have distinct local animations. Capture reveal direction follows the attack direction. Reduced motion removes all animation and keeps static outlines, the numeric result and confirmation text. There is no full-screen celebration, shake, bounce or confetti.

## Mobile behavior

The compact scoreboard, full coordinate frame and readable power values are preserved at **360px, 390px and 430px**. Labels and patterns provide ownership recognition independently of colour.

There is one action-row DOM node. It is relocated from the desktop inspector to document flow after the mobile board, then becomes sticky at the top only after the board has scrolled away. It never acts as a fixed bottom overlay. Row eight is not covered, even when pending/error feedback makes the dock taller. The prototype controls are clearly separate from game controls.

Secondary instructions use body text; unavailable attacks are explained rather than rendered as long disabled buttons. The selected coordinate and estimate remain in the shared action row. Supporting rule details stay available in a collapsible section.

Browser checks cover the requested widths, short 640px-high variants, 320px, tablet and desktop, plus multiple scroll positions and keyboard focus when crossing the layout breakpoint. These are browser checks, not physical-device testing.

## Match completion and evidence

The completion panel replaces the live score strip. It shows the winner or draw, both final scores, the fact that final tile counts equal final points, total claimed/unclaimed territory, and the frozen final board.

**Expiration and recording remain separate:** the clock closes play and locks scores; a later action records the result. The mock pending and failure cases preserve this distinction. Victory and Draw presets show already-recorded mock results. No rematch control is provided.

This study has no deployed contract or transaction hashes. The provenance row therefore says **“Mock match · No deployed contract”** and **“Explorer unavailable for mock data.”** It intentionally does not link a real contract to fictional scores. At integration, replace that row with the actual configured network, contract address, validated explorer URL and successful result transaction when available.

## Rules and legacy support

- Timed matches have two registered players. Both may submit valid actions while active; there is no alternating turn order.
- Any empty tile may be claimed. Expansion does not require connection to existing territory.
- Reinforcement, orthogonal attacks, effective power, attack cost and decay retain their existing meanings.
- The prototype reads cap, cooldown, decay and duration from each scene's **mock contract-settings object**. Its review defaults are 5/3/10/100. Alternate mock settings are exercised in the browser check. Real integration must continue reading the deployed immutable values rather than copying these defaults into UI code.
- The **Earlier open board** scene demonstrates owner standings and unrestricted participation without a match countdown, seats, expiration or winner. Its mock clock advances decay/cooldown indefinitely. Two owners are shown as example data, not as a player limit.
- “Reset,” the scene selector and “Fail the next mock action” are design-review tools. They are not proposed contract features.

The actual application's match and open-board implementations are unchanged.

## Review routes and artifacts

Start from the repository root:

```powershell
npx.cmd vite --config prototypes/standard-bearer/vite.config.js
```

| Review | Local route |
| --- | --- |
| Desktop/mobile gameplay and attack | `http://127.0.0.1:5180/` |
| Claim / reinforcement / failure | `?scene=claim` / `?scene=reinforce` / `?scene=failure` |
| Victory / draw | `?scene=victory` / `?scene=draw` |
| Earlier open board | `?scene=open` |
| Brand and player-emblem study | `http://127.0.0.1:5180/identity.html` |
| Before-and-after gallery | `http://127.0.0.1:5180/review.html` |

The gallery preserves previous screenshots in `screenshots/before/` and compares equivalent desktop, mobile, branding and completion compositions. It also collects claim/reinforcement/failure feedback. The comparisons document the existing mock scenes; they are not Sepolia evidence.

## Implementation boundary and validation

Everything remains inside `prototypes/standard-bearer/`: plain HTML/CSS/JavaScript, an independent Vite configuration, local SVG/font assets and mock data. The build includes the gameplay, identity and review pages. No framework, wallet adapter, RPC dependency, environment-file loading, persistent data or real application import is introduced.

`verify.mjs` checks targeting, scores and attack costs, pending/confirmed state separation, action-specific feedback, failure and retry, failed result recording, reset races, alternate settings, legacy open-board behavior, deadline freezing, keyboard controls, reduced motion, one responsive dock and row-eight clearance. It checks identity/comparison pages and their images at desktop and the three requested mobile widths. Screenshot sessions disable Vite's reload client so file notifications cannot reset a paused mock clock.

The standalone build and browser checks must pass before review. The original application's tests are not rerun by this design script. Integration, deployment and publication remain outside this phase and require further authorization.
