import { readFile } from 'node:fs/promises';
import { ContractFactory, JsonRpcProvider } from 'ethers';

// Fixed loopback endpoint and chain check: this script cannot target Sepolia.
const provider = new JsonRpcProvider('http://127.0.0.1:8545');
try {
  if ((await provider.getNetwork()).chainId !== 31337n) throw new Error('Expected local Hardhat chain 31337.');
  const artifact = JSON.parse(await readFile(new URL('../artifacts/contracts/BlockConquest.sol/BlockConquest.json', import.meta.url), 'utf8'));
  const game = await new ContractFactory(artifact.abi, artifact.bytecode, await provider.getSigner(0)).deploy(10, 3, 5);
  await game.waitForDeployment();
  console.log(`Local Block Conquest: ${await game.getAddress()}`);
  console.log('Choose Local Hardhat in the frontend and paste this address into Board settings.');
} finally {
  provider.destroy();
}
