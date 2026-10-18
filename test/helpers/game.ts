import { network } from "hardhat";
import type { BlockConquest } from "../../types/ethers-contracts/BlockConquest.js";

export const { ethers, networkHelpers, provider } = await network.create();

export async function setup(cap = 5, decayInterval = 10, cooldown = 3) {
  const [alice, bob, carol] = await ethers.getSigners();
  const game = await ethers.deployContract("BlockConquest", [decayInterval, cooldown, cap]);
  await game.waitForDeployment();
  return { game, alice, bob, carol };
}

// Query the node directly to avoid ethers' short-lived block-number cache.
export async function blockNumber() {
  return BigInt(await provider.request({ method: "eth_blockNumber" }) as string);
}

export async function mineTo(block: bigint) {
  const current = await blockNumber();
  if (block > current) await networkHelpers.mine(block - current);
}

// A sent transaction is included in the NEXT block, unlike a view/static call.
export async function readyToReinforce(game: BlockConquest, x: number, y: number) {
  const tile = await game.getTile(x, y);
  await mineTo(tile.lastUpdateBlock + await game.reinforcementCooldown() - 1n);
}

export async function reinforce(game: BlockConquest, x: number, y: number) {
  await readyToReinforce(game, x, y);
  return game.reinforce(x, y);
}
