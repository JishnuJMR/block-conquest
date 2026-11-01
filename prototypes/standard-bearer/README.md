# Standard Bearer — Phase 2 refined prototype

A browser-viewable design study for Block Conquest, built with the project's existing plain HTML/CSS/JavaScript and Vite. Everything in this directory is separate from the real frontend. All players, blocks and actions are mock data. There are no wallet, RPC or contract calls, and no application files are imported.

The approved Standard Bearer foundation is preserved. The hybrid refinement adds a stepped-square brand motif, distinctive wordmark and player crests, action-specific feedback, failure/retry demonstrations and an earlier open-board scene. See [DESIGN.md](DESIGN.md), the [identity study](identity.html), [before-and-after gallery](review.html), and [design-system reference](DESIGN_SYSTEM.md).

## Run locally

From the repository root (`C:\folder\blockchain`), with the existing project dependencies installed:

```powershell
npx.cmd vite --config prototypes/standard-bearer/vite.config.js
```

Open **http://127.0.0.1:5180/**. Leave that terminal running; press Ctrl+C to stop. On macOS/Linux use `npx` instead of `npx.cmd`. On a fresh checkout, run `npm ci` first. This command does not use the main application's `predev` hook or compile contracts.

The independent Vite configuration uses only this folder as its root and disables environment-file loading. Existing app settings, environment files and browser storage are not used.

## Explore

- **Starting view:** midgame, with D4 (your power 4) attacking E4 (enemy power 2). Review the estimate: D4 keeps 2; E4 starts at 1.
- Select **D5**, the other brass-marked target, to see a different estimate.
- **Cancel attack**, then select any territory to inspect it. Your own territories offer reinforcement and, when eligible, attack targeting. Empty territories offer a mock claim.
- **Preview capture / claim / reinforcement** first shows a 900ms mock pending state. Affected tiles receive a dashed ivory frame and hourglass. Ownership and scores change only after mock confirmation. No wallet opens.
- Use the **Study scene** selector below the field: **Attack preview**, **Opening board** (three tiles), **Claim territory**, **Reinforce territory**, **Failed action**, **Victory**, **Draw**, or **Earlier open board**. The reset icon resets the current scene. **Fail the next mock action** demonstrates a failure without changing territory or scores; the same action can then be retried. Selecting a scene returns to the top.
- **Run mock clock** simulates one block every 1.5 seconds. It starts paused. This is an illustrative speed, not Sepolia timing. Simulated blocks advance cooldown and decay; moves close at zero. The result is initially locked but unrecorded; **Preview record result** demonstrates recording locally. No result is recorded on-chain.
- Use arrow keys within the board, Enter/Space to select, and Escape to cancel targeting or clear selection. **Field guide** opens a keyboard-accessible dialog.
- On mobile, one shared action row follows the board, then sticks to the top once the board has scrolled away. It never overlays the board's bottom row. Scroll for the inspector, full estimate, standings, collapsible rules and study controls. There are no duplicate primary actions.
- Both players may act during an active match. **Territory & actions** replaces the ambiguous “Your move” label. This is not alternating-turn play.

The identity study is at **http://127.0.0.1:5180/identity.html** and comparisons at **http://127.0.0.1:5180/review.html**. These are local review pages, not deployments.

Direct local scene links, while the server is running: [attack preview](http://127.0.0.1:5180/?scene=midgame), [opening](http://127.0.0.1:5180/?scene=opening), [victory](http://127.0.0.1:5180/?scene=victory), [draw](http://127.0.0.1:5180/?scene=draw).

## Design decisions

- A navy playing surface gives the board a physical presence, including when almost empty.
- Ivory space, condensed headlines and a small heraldic block mark create a printed tabletop identity.
- Cobalt uses a battlement shield and diagonal hatching; Ember uses an angular crest and dots. Labels identify ownership independently of colour.
- Brass distinguishes selection and attack targeting. A directional arrow and the numerical equation make the cost visible.
- The compact score contest stays above the board; the territory inspector and ownership standings sit beside it on desktop and below it on mobile. Completion replaces the live score strip with a result print and keeps the board inspectable.
- Barlow Condensed and Source Sans 3 are bundled locally. Pattern gradients encode ownership; there are no ornamental gradients, glass surfaces or external font requests.
- Motion only accompanies locally applied mock moves; reduced-motion mode uses a static highlight.

## Validation and screenshots

With the prototype server running:

```powershell
node prototypes/standard-bearer/verify.mjs
```

Requires installed Chrome, or set `PLAYWRIGHT_CHANNEL` to another installed Playwright browser channel such as `msedge`. The isolated smoke check covers tile selection, both attack targets, invalid targets, capture cost and scores, pending/confirmed distinctions, reset races, mock claim/reinforce/cooldown/decay, power cap, keyboard controls, guide, sparse layout, reduced motion, deadline/result recording, victory/draw, overflow and tile sizes. It checks the single shared dock and row-eight clearance at multiple scroll positions across eight viewports, including **360×640, 390×844 and 430×932**, plus short 390/430px layouts. It additionally checks action-specific feedback, failure and retry, failed result recording, alternate mock settings, open-board behavior, and identity/comparison pages at four widths. Screenshot checks disable the Vite reload client to keep paused clocks deterministic. It generates screenshots inside this directory only and does not run or write to the game tests.

- [Brand and player-emblem study](screenshots/identity.png) / [mobile](screenshots/identity-mobile.png)
- [Desktop gameplay](screenshots/gameplay-desktop.png)
- [Attack preview](screenshots/desktop.png)
- [Pending capture](screenshots/pending-desktop.png)
- [Confirmed capture](screenshots/capture-confirmed.png)
- [Claim confirmation](screenshots/claim-confirmed.png) / [reinforcement confirmation](screenshots/reinforce-confirmed.png)
- [Failure and retry presentation](screenshots/failure-desktop.png)
- [Earlier open-board scene](screenshots/open-board.png)
- [360px mobile gameplay](screenshots/mobile-360.png) / [first viewport](screenshots/mobile-360-viewport.png)
- [390px mobile gameplay](screenshots/mobile-390.png) / [first viewport](screenshots/mobile-390-viewport.png)
- [430px mobile gameplay](screenshots/mobile-430.png) / [first viewport](screenshots/mobile-430-viewport.png)
- [Sparse desktop](screenshots/opening-desktop.png)
- [Sparse mobile](screenshots/opening-mobile.png)
- [Victory desktop](screenshots/victory-desktop.png) / [mobile](screenshots/victory-mobile.png)
- [Draw desktop](screenshots/draw-desktop.png) / [mobile](screenshots/draw-mobile.png)

Optional standalone build:

```powershell
npx.cmd vite build --config prototypes/standard-bearer/vite.config.js
```

The build includes all three HTML pages. Output is this prototype's ignored `dist/` directory. Nothing is deployed or integrated into the application.

## Font attribution

Fonts are from the official [Google Fonts repository](https://github.com/google/fonts), under the SIL Open Font License:

- Barlow Condensed SemiBold: [license](assets/fonts/BarlowCondensed-OFL.txt).
- Source Sans 3 Variable: [license](assets/fonts/SourceSans3-OFL.txt).

Integration into the actual game remains subject to design approval.
