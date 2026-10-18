# GitHub submission

> Historical guide from before initial publication. The repository is now published at https://github.com/JishnuJMR/block-conquest. Pending statuses and instructions below are retained as development history.

The project contains the assignment code, tests, instructions, public Sepolia address, and real UI screenshot. Publishing still requires the user's explicit instruction. Local Git preparation does not upload files.

## Create an empty GitHub repository

1. Sign into GitHub and open https://github.com/new.
2. Name the repository `block-conquest` (or the name required by the university).
3. Choose the visibility required for marking. Public is accessible by repository URL; a private repository requires granting your marker access.
4. Leave **Add a README**, **Add .gitignore**, and **Choose a license** unchecked/unselected. This project already contains its README and ignore rules.
5. Create the empty repository and copy its HTTPS URL, for example `https://github.com/YOUR-USERNAME/block-conquest.git`.

Creating an empty repository does not upload the project. Provide its URL and explicitly request the upload when ready. Sign-in or authentication prompts should be completed directly with GitHub/Git Credential Manager; do not paste passwords or access tokens into chat.

## Upload once authorized

With the local project committed and the intended URL confirmed, configure the repository remote and push main. If doing this yourself in PowerShell:

```powershell
cd C:\folder\blockchain
git remote add origin https://github.com/YOUR-USERNAME/block-conquest.git
git push -u origin main
```

Replace the example URL with the actual repository URL. If origin already exists, inspect `git remote -v` before changing it. Do not overwrite another repository's history or force-push.

## Check the submission

- README renders the real Sepolia screenshot and contains deployment/frontend run instructions, address, network, description, and features.
- Source includes contracts, frontend, tests, scripts, Hardhat/Vite config, and package-lock.json.
- `node_modules`, build artifacts, test output, local environment files, and wallet secrets are excluded.
- Clone/run instructions: `npm.cmd ci`, copy `frontend/.env.example` to `frontend/.env.local`, then `npm.cmd run dev`. Open http://127.0.0.1:5173 and connect MetaMask on Sepolia.
- Current address: `0x4D8ebB57f5140fD302F7b1f4Ff57EF23ff1c3Cb3` on Ethereum Sepolia (11155111).
- Claim transaction evidence and remaining independent-verification limitations are recorded in docs/DEPLOYMENT.md.
- Submit the repository's browser URL to the university by **2 November 2026**. Website hosting is not needed to satisfy the stated repository/frontend requirements.
