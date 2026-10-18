import { expect } from "chai";
import { ethers, setup, reinforce, mineTo, blockNumber, networkHelpers } from "./helpers/game.js";

async function poweredTile() {
  const fixture = await setup();
  await fixture.game.claim(0, 0);
  for (let power = 2; power <= 5; power++) await reinforce(fixture.game, 0, 0);
  const tile = await fixture.game.getTile(0, 0);
  return { ...fixture, tile };
}

async function capturedPair() {
  const fixture = await poweredTile();
  const { game, bob } = fixture;
  await game.connect(bob).claim(1, 0);
  await reinforce(game.connect(bob), 1, 0);
  const tx = await game.attack(0, 0, 1, 0);
  const captureBlock = BigInt((await tx.wait())!.blockNumber);
  expect((await game.getTile(0, 0)).power).to.equal(3);
  return { ...fixture, captureBlock };
}

describe("BlockConquest — reinforcement cooldown", function () {
  for (const elapsed of [1, 2, 3, 4]) {
    it(`checks a real reinforcement transaction ${elapsed} blocks after claim`, async function () {
      const { game } = await setup();
      await game.claim(0, 0);
      const before = await game.getTile(0, 0);
      const inclusionBlock = before.lastUpdateBlock + BigInt(elapsed);
      await mineTo(inclusionBlock - 1n);
      if (elapsed < 3) {
        // Explicit gas bypasses estimation so the attempted transaction mines.
        await expect(game.reinforce(0, 0, { gasLimit: 200_000 }))
          .to.be.revertedWithCustomError(game, "ReinforcementCooldownActive");
        expect(await game.getTile(0, 0)).to.deep.equal(before);
      } else {
        const tx = await game.reinforce(0, 0);
        expect((await tx.wait())!.blockNumber).to.equal(inclusionBlock);
        expect((await game.getTile(0, 0)).power).to.equal(2);
      }
      expect(await blockNumber()).to.equal(inclusionBlock);
    });
  }

  it("restarts cooldown after reinforcement; rejection does not restart it", async function () {
    const { game, alice } = await setup();
    await game.claim(0, 0);
    await reinforce(game, 0, 0);
    const before = await game.getTile(0, 0);
    await expect(game.reinforce(0, 0, { gasLimit: 200_000 }))
      .to.be.revertedWithCustomError(game, "ReinforcementCooldownActive");
    expect(await game.getTile(0, 0)).to.deep.equal(before);
    await mineTo(before.lastUpdateBlock + 2n);
    const tx = await game.reinforce(0, 0);
    await expect(tx).to.emit(game, "TileReinforced").withArgs(alice.address, 0, 0, 3);
    expect((await tx.wait())!.blockNumber).to.equal(before.lastUpdateBlock + 3n);
  });

  for (const x of [0, 1]) {
    it(`restarts cooldown on ${x === 0 ? "source" : "captured"} tile after attack`, async function () {
      const { game, captureBlock } = await capturedPair();
      const before = await game.getTile(x, 0);
      expect(before.lastUpdateBlock).to.equal(captureBlock);
      await mineTo(captureBlock + 1n);
      await expect(game.reinforce(x, 0, { gasLimit: 200_000 }))
        .to.be.revertedWithCustomError(game, "ReinforcementCooldownActive");
      expect(await blockNumber()).to.equal(captureBlock + 2n);
      expect(await game.getTile(x, 0)).to.deep.equal(before);
      const tx = await game.reinforce(x, 0);
      expect((await tx.wait())!.blockNumber).to.equal(captureBlock + 3n);
      expect((await game.getTile(x, 0)).power).to.equal(before.power + 1n);
    });
  }

  it("keeps reinforcement cooldown per tile, not per player", async function () {
    const { game } = await setup();
    await game.claim(0, 0);
    const first = await game.getTile(0, 0);
    await game.claim(7, 7);
    await mineTo(first.lastUpdateBlock + 2n);
    await game.reinforce(0, 0);
    await game.reinforce(7, 7);
    expect(await game.effectivePower(0, 0)).to.equal(2);
    expect(await game.effectivePower(7, 7)).to.equal(2);
  });

  it("does not add a cooldown restriction to attacks", async function () {
    const { game, bob } = await setup();
    await game.claim(0, 0);
    await game.connect(bob).claim(1, 0);
    await reinforce(game, 0, 0);
    const source = await game.getTile(0, 0);
    const tx = await game.attack(0, 0, 1, 0);
    expect((await tx.wait())!.blockNumber).to.equal(source.lastUpdateBlock + 1n);
    expect((await game.getTile(1, 0)).power).to.equal(1);
  });
});

describe("BlockConquest — lazy decay", function () {
  for (const [elapsed, expected] of [
    [0, 5], [9, 5], [10, 4], [11, 4], [19, 4], [20, 3],
    [29, 3], [30, 2], [39, 2], [40, 1], [50, 1], [1_000_000, 1],
  ]) {
    it(`returns power ${expected} after ${elapsed} blocks from stored power 5`, async function () {
      const { game, tile, alice } = await poweredTile();
      await mineTo(tile.lastUpdateBlock + BigInt(elapsed));
      expect(await game.effectivePower(0, 0)).to.equal(expected);
      const grid = await game.getGrid();
      expect(grid[0].power).to.equal(expected);
      expect(grid[0].owner).to.equal(alice.address);
      expect(grid[0].lastUpdateBlock).to.equal(tile.lastUpdateBlock);
      expect(await game.scoreOf(alice.address)).to.equal(1);
      // Reads expose lazy decay without modifying storage or timestamps.
      expect(await game.getTile(0, 0)).to.deep.equal(tile);
      expect(await game.effectivePower(7, 7)).to.equal(0);
      expect(grid[63].power).to.equal(0);
    });
  }

  it("preserves a power-1 claim and its ownership after very long inactivity", async function () {
    const { game, bob } = await setup();
    await game.connect(bob).claim(7, 7);
    const claimed = await game.getTile(7, 7);
    await networkHelpers.mine(1_000_000);
    expect(await game.effectivePower(7, 7)).to.equal(1);
    expect(await game.getTile(7, 7)).to.deep.equal(claimed);
    expect(await game.scoreOf(bob.address)).to.equal(1);
    await expect(game.claim(7, 7)).to.be.revertedWithCustomError(game, "TileOccupied");
  });

  it("reinforces a long-inactive stored-power-5 tile to exactly 2", async function () {
    const { game, alice } = await poweredTile();
    await networkHelpers.mine(1_000);
    expect((await game.getTile(0, 0)).power).to.equal(5);
    expect(await game.effectivePower(0, 0)).to.equal(1);
    const tx = await game.reinforce(0, 0);
    await expect(tx).to.emit(game, "TileReinforced").withArgs(alice.address, 0, 0, 2);
    const after = await game.getTile(0, 0);
    expect(after.power).to.equal(2);
    expect(after.lastUpdateBlock).to.equal((await tx.wait())!.blockNumber);
    expect(await game.effectivePower(0, 0)).to.equal(2);
    expect(await game.scoreOf(alice.address)).to.equal(1);
  });

  it("adds one to partially decayed power before starting a fresh decay interval", async function () {
    const { game, tile } = await poweredTile();
    await mineTo(tile.lastUpdateBlock + 20n);
    expect(await game.effectivePower(0, 0)).to.equal(3);
    await game.reinforce(0, 0);
    const after = await game.getTile(0, 0);
    expect(after.power).to.equal(4);
    await mineTo(after.lastUpdateBlock + 9n);
    expect(await game.effectivePower(0, 0)).to.equal(4);
    await networkHelpers.mine();
    expect(await game.effectivePower(0, 0)).to.equal(3);
  });

  it("checks the cap against effective power at the transaction's decay boundary", async function () {
    const { game, tile } = await poweredTile();
    await mineTo(tile.lastUpdateBlock + 9n);
    await expect(game.reinforce.staticCall(0, 0)).to.be.revertedWithCustomError(game, "PowerCapReached");
    // The next block decays 5 to 4, allowing reinforcement back to 5.
    const tx = await game.reinforce(0, 0);
    expect((await tx.wait())!.blockNumber).to.equal(tile.lastUpdateBlock + 10n);
    expect((await game.getTile(0, 0)).power).to.equal(5);
  });

  it("honours custom interval, cooldown, and cap instead of hard-coded defaults", async function () {
    const { game } = await setup(7, 4, 2);
    await game.claim(0, 0);
    for (let power = 2; power <= 7; power++) await reinforce(game, 0, 0);
    const tile = await game.getTile(0, 0);
    expect(tile.power).to.equal(7);
    await mineTo(tile.lastUpdateBlock + 3n);
    expect(await game.effectivePower(0, 0)).to.equal(7);
    await networkHelpers.mine();
    expect(await game.effectivePower(0, 0)).to.equal(6);
  });

  it("supports the minimum interval/cooldown of one block", async function () {
    const { game } = await setup(5, 1, 1);
    await game.claim(0, 0);
    await game.reinforce(0, 0);
    expect(await game.effectivePower(0, 0)).to.equal(2);
    // Each new transaction decays to 1 before reinforcement returns it to 2.
    await game.reinforce(0, 0);
    expect((await game.getTile(0, 0)).power).to.equal(2);
    await networkHelpers.mine();
    expect(await game.effectivePower(0, 0)).to.equal(1);
  });

  it("handles cooldown longer than decay interval", async function () {
    const { game } = await setup(5, 2, 7);
    await game.claim(0, 0);
    await reinforce(game, 0, 0);
    const tile = await game.getTile(0, 0);
    await mineTo(tile.lastUpdateBlock + 6n);
    expect(await game.effectivePower(0, 0)).to.equal(1);
    await expect(game.reinforce.staticCall(0, 0)).to.be.revertedWithCustomError(game, "ReinforcementCooldownActive");
    await game.reinforce(0, 0);
    expect((await game.getTile(0, 0)).power).to.equal(2);
  });

  it("accepts large valid parameters without overflowing cooldown arithmetic", async function () {
    const game = await ethers.deployContract("BlockConquest", [ethers.MaxUint256, ethers.MaxUint256, ethers.MaxUint256]);
    await game.claim(0, 0);
    await networkHelpers.mine(100);
    expect(await game.effectivePower(0, 0)).to.equal(1);
    await expect(game.reinforce(0, 0)).to.be.revertedWithCustomError(game, "ReinforcementCooldownActive");
  });
});

describe("BlockConquest — attacks after decay", function () {
  it("subtracts the effective defender power from the effective attacker power", async function () {
    const { game, bob, alice, tile: sourceBefore } = await poweredTile();
    await game.connect(bob).claim(1, 0);
    await reinforce(game.connect(bob), 1, 0);
    const targetBefore = await game.getTile(1, 0);
    // Source stored 5, target stored 2. At this block they are 3 and 1.
    await mineTo(sourceBefore.lastUpdateBlock + 20n);
    expect(await game.effectivePower(0, 0)).to.equal(3);
    expect(await game.effectivePower(1, 0)).to.equal(1);
    expect(targetBefore.power).to.equal(2);
    const tx = await game.attack(0, 0, 1, 0);
    await expect(tx).to.emit(game, "TileCaptured").withArgs(alice.address, bob.address, 0, 0, 1, 0, 2);
    const block = BigInt((await tx.wait())!.blockNumber);
    const source = await game.getTile(0, 0);
    const target = await game.getTile(1, 0);
    expect(source.power).to.equal(2); // 3 - 1, not 5 - 2, 5 - 1, or 3 - 2.
    expect(target.power).to.equal(1);
    expect(source.lastUpdateBlock).to.equal(block);
    expect(target.lastUpdateBlock).to.equal(block);
    expect(target.owner).to.equal(alice.address);
    expect(await game.scoreOf(alice.address)).to.equal(2);
    expect(await game.scoreOf(bob.address)).to.equal(0);
    await mineTo(block + 9n);
    expect(await game.effectivePower(0, 0)).to.equal(2);
    await networkHelpers.mine();
    expect(await game.effectivePower(0, 0)).to.equal(1);
    expect(await game.effectivePower(1, 0)).to.equal(1);
  });

  it("allows capture when stored powers are equal but defender has decayed further", async function () {
    const { game, bob, alice } = await setup();
    await game.connect(bob).claim(1, 0);
    for (let power = 2; power <= 5; power++) await reinforce(game.connect(bob), 1, 0);
    await networkHelpers.mine(50);
    await game.claim(0, 0);
    for (let power = 2; power <= 5; power++) await reinforce(game, 0, 0);
    expect((await game.getTile(1, 0)).power).to.equal(5);
    expect(await game.effectivePower(1, 0)).to.equal(1);
    await game.attack(0, 0, 1, 0);
    expect((await game.getTile(0, 0)).power).to.equal(4);
    expect((await game.getTile(1, 0)).owner).to.equal(alice.address);
  });

  for (const defenderPower of [1, 2]) {
    it(`rejects a decayed power-1 attacker against effective power ${defenderPower}`, async function () {
      const { game, bob, alice } = await poweredTile();
      await networkHelpers.mine(50);
      await game.connect(bob).claim(1, 0);
      if (defenderPower === 2) await reinforce(game.connect(bob), 1, 0);
      const source = await game.getTile(0, 0);
      const target = await game.getTile(1, 0);
      expect(source.power).to.equal(5);
      expect(await game.effectivePower(0, 0)).to.equal(1);
      await expect(game.attack(0, 0, 1, 0)).to.be.revertedWithCustomError(game, "InsufficientPower");
      expect(await game.getTile(0, 0)).to.deep.equal(source);
      expect(await game.getTile(1, 0)).to.deep.equal(target);
      expect(await game.scoreOf(alice.address)).to.equal(1);
      expect(await game.scoreOf(bob.address)).to.equal(1);
    });
  }

  it("uses inclusion-block power when the source decays exactly as the attack mines", async function () {
    const { game, bob } = await setup();
    await game.claim(0, 0);
    await reinforce(game, 0, 0);
    const source = await game.getTile(0, 0);
    await game.connect(bob).claim(1, 0);
    await mineTo(source.lastUpdateBlock + 9n);
    // A preview succeeds now, but the next block makes the powers equal.
    await game.attack.staticCall(0, 0, 1, 0);
    await expect(game.attack(0, 0, 1, 0, { gasLimit: 300_000 }))
      .to.be.revertedWithCustomError(game, "InsufficientPower");
    expect(await blockNumber()).to.equal(source.lastUpdateBlock + 10n);
    expect((await game.getTile(1, 0)).owner).to.equal(bob.address);
  });
});
