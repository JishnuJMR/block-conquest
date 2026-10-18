# Current Sepolia deployment record

- Network: Ethereum Sepolia, chain ID 11155111.
- Contract address: `0x4D8ebB57f5140fD302F7b1f4Ff57EF23ff1c3Cb3` (provided by the user).
- Intended constructor arguments: `(10, 3, 5)`.
- Deployment transaction hash: not yet recorded.
- Frontend claim transaction: [0x9fcbd74381c90cf660a619e1a2973635458608b1b6ff62d518cd34f552802ddd](https://sepolia.etherscan.io/tx/0x9fcbd74381c90cf660a619e1a2973635458608b1b6ff62d518cd34f552802ddd).
- Claimed tile: H1, contract coordinates `(7, 0)`.
- Screenshot shows: **Claim confirmed**, inclusion block **11939882**, owner **You**, effective power **1 / 5**.
- User confirms the expected territory score is displayed as 1.
- User subsequently confirmed that reinforcement raised power to 2 and it later decayed to 1 in the frontend. Reinforcement transaction hash and an exact block-by-block timing observation were not supplied.
- Saved [Sepolia screenshot](screenshots/sepolia-board.png) shows **Reinforcement confirmed** at block **11939902**, current block **11939931**, H1 power **1**, score **1**, and the Sepolia network. This screenshot was visually reviewed and embedded in README.

Evidence above consists of the user's transaction hash, report, and screenshot shared in chat. The receipt, sender address, target address, deployed bytecode, and constructor values have not yet been independently fetched and verified.

## Remaining live checks

- [x] Connect real MetaMask to the frontend and load the Sepolia board.
- [x] Submit a claim through the frontend and observe success, ownership, power, and score (user report and screenshot).
- [x] Reinforce the tile and observe power 2 (user report).
- [x] Observe power later return to 1 (user report; exact elapsed blocks were not independently checked).
- [ ] Record the deployment transaction and independently verify deployment/claim receipts and updated rules.
- [x] Save and review the user's Sepolia UI screenshot at docs/screenshots/sepolia-board.png and embed it in README. Local screenshots remain labelled separately.

The historical basic contract at `0x5A6dB2fA7424F519a10805c48EF33F4eA141A9c9` remains separate and is not the submission address.
