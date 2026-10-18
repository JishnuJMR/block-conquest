import { expect } from "chai";
import { ethers, setup, reinforce, readyToReinforce } from "./helpers/game.js";

describe("BlockConquest — board rules", function () {

  it("initializes a shared empty 8×8 board and immutable configuration", async function () {
    const { game, alice } = await setup();
    expect(await game.BOARD_SIZE()).to.equal(8);
    expect(await game.decayInterval()).to.equal(10);
    expect(await game.reinforcementCooldown()).to.equal(3);
    expect(await game.maxPower()).to.equal(5);
    expect(await game.scoreOf(alice.address)).to.equal(0);
    const grid = await game.getGrid();
    expect(grid).to.have.length(64);
    for (const tile of grid) {
      expect(tile.owner).to.equal(ethers.ZeroAddress);
      expect(tile.power).to.equal(0);
      expect(tile.lastUpdateBlock).to.equal(0);
    }
    expect(await game.effectivePower(7, 7)).to.equal(0);
  });

  for (const args of [[0, 3, 5], [10, 0, 5], [10, 3, 0], [10, 3, 1]] as const) {
    it(`rejects invalid configuration ${args}`, async function () {
      const factory = await ethers.getContractFactory("BlockConquest");
      await expect(factory.deploy(args[0], args[1], args[2])).to.be.revertedWithCustomError(factory, "InvalidConfiguration");
    });
  }

  for (const [x, y] of [[8, 0], [0, 8], [8, 8], [255, 0]]) {
    it(`rejects invalid coordinates ${x},${y} across the API`, async function () {
      const { game } = await setup();
      for (const call of [
        () => game.claim(x, y), () => game.reinforce(x, y),
        () => game.getTile(x, y), () => game.effectivePower(x, y),
        () => game.attack(x, y, 0, 0), () => game.attack(0, 0, x, y),
      ]) await expect(call()).to.be.revertedWithCustomError(game, "InvalidCoordinates");
    });
  }

  it("claims boundary tiles, records score, timestamp, and row-major grid", async function () {
    const { game, alice } = await setup();
    for (const [x, y] of [[0, 0], [7, 0], [0, 7], [7, 7]]) {
      const tx = await game.claim(x, y);
      await expect(tx).to.emit(game, "TileClaimed").withArgs(alice.address, x, y);
      const receipt = await tx.wait();
      const tile = await game.getTile(x, y);
      expect(tile.owner).to.equal(alice.address);
      expect(tile.power).to.equal(1);
      expect(tile.lastUpdateBlock).to.equal(receipt!.blockNumber);
      expect((await game.getGrid())[y * 8 + x].owner).to.equal(alice.address);
    }
    expect(await game.scoreOf(alice.address)).to.equal(4);
  });

  it("rejects occupied claims by either player without changing scores", async function () {
    const { game, alice, bob } = await setup();
    await game.claim(0, 0);
    for (const player of [alice, bob]) {
      await expect(game.connect(player).claim(0, 0)).to.be.revertedWithCustomError(game, "TileOccupied");
    }
    expect(await game.scoreOf(alice.address)).to.equal(1);
    expect(await game.scoreOf(bob.address)).to.equal(0);
  });

  it("restricts reinforcement and attack sources to their owner", async function () {
    const { game, bob } = await setup();
    await game.claim(0, 0);
    await expect(game.connect(bob).reinforce(0, 0)).to.be.revertedWithCustomError(game, "NotTileOwner");
    await expect(game.reinforce(1, 1)).to.be.revertedWithCustomError(game, "NotTileOwner");
    await expect(game.connect(bob).attack(0, 0, 1, 0)).to.be.revertedWithCustomError(game, "NotTileOwner");
    await expect(game.attack(1, 1, 0, 0)).to.be.revertedWithCustomError(game, "NotTileOwner");
  });

  for (const cap of [2, 5, 7]) {
    it(`reinforces up to configured cap ${cap} and keeps score unchanged`, async function () {
      const { game, alice } = await setup(cap);
      await game.claim(0, 0);
      for (let power = 2; power <= cap; power++) {
        const tx = await reinforce(game, 0, 0);
        await expect(tx).to.emit(game, "TileReinforced").withArgs(alice.address, 0, 0, power);
        expect(await game.effectivePower(0, 0)).to.equal(power);
        expect((await game.getTile(0, 0)).lastUpdateBlock).to.equal((await tx.wait())!.blockNumber);
      }
      await readyToReinforce(game, 0, 0);
      await expect(game.reinforce(0, 0)).to.be.revertedWithCustomError(game, "PowerCapReached");
      expect(await game.scoreOf(alice.address)).to.equal(1);
    });
  }

  it("rejects empty, friendly, and self targets", async function () {
    const { game } = await setup();
    await game.claim(0, 0);
    await game.claim(1, 0);
    for (const [x, y] of [[0, 1], [1, 0], [0, 0]]) {
      await expect(game.attack(0, 0, x, y)).to.be.revertedWithCustomError(game, "NotEnemyTile");
    }
  });

  for (const [fx, fy, tx, ty] of [[0, 0, 1, 1], [0, 0, 2, 0], [7, 0, 0, 1], [0, 0, 7, 0], [0, 7, 0, 0]]) {
    it(`rejects non-adjacent attack ${fx},${fy} → ${tx},${ty}`, async function () {
      const { game, bob } = await setup();
      await game.claim(fx, fy);
      await reinforce(game, fx, fy);
      await game.connect(bob).claim(tx, ty);
      await expect(game.attack(fx, fy, tx, ty)).to.be.revertedWithCustomError(game, "NotAdjacent");
    });
  }

  it("rejects equal and lower attack power with no state changes", async function () {
    const { game, bob } = await setup();
    await game.claim(0, 0);
    await game.connect(bob).claim(1, 0);
    for (let i = 0; i < 2; i++) {
      const before = await game.getGrid();
      await expect(game.attack(0, 0, 1, 0)).to.be.revertedWithCustomError(game, "InsufficientPower");
      expect(await game.getGrid()).to.deep.equal(before);
      await reinforce(game.connect(bob), 1, 0);
    }
  });

  for (const [fx, fy, tx, ty] of [[0, 0, 1, 0], [7, 7, 6, 7], [7, 6, 7, 7], [0, 1, 0, 0]]) {
    it(`captures in an orthogonal direction at edges ${fx},${fy} → ${tx},${ty}`, async function () {
      const { game, alice, bob } = await setup();
      await game.claim(fx, fy);
      for (let i = 0; i < 4; i++) await reinforce(game, fx, fy);
      await game.connect(bob).claim(tx, ty);
      await reinforce(game.connect(bob), tx, ty);
      const transaction = await game.attack(fx, fy, tx, ty);
      await expect(transaction).to.emit(game, "TileCaptured").withArgs(alice.address, bob.address, fx, fy, tx, ty, 3);
      const block = (await transaction.wait())!.blockNumber;
      const source = await game.getTile(fx, fy);
      const target = await game.getTile(tx, ty);
      expect(source.owner).to.equal(alice.address);
      expect(source.power).to.equal(3);
      expect(target.owner).to.equal(alice.address);
      expect(target.power).to.equal(1);
      expect(source.lastUpdateBlock).to.equal(block);
      expect(target.lastUpdateBlock).to.equal(block);
      expect(await game.scoreOf(alice.address)).to.equal(2);
      expect(await game.scoreOf(bob.address)).to.equal(0);
      await expect(game.connect(bob).reinforce(tx, ty)).to.be.revertedWithCustomError(game, "NotTileOwner");
    });
  }

  it("preserves board-count scores through capture and recapture", async function () {
    const { game, alice, bob, carol } = await setup();
    await game.claim(0, 0);
    await reinforce(game, 0, 0);
    await game.connect(bob).claim(1, 0);
    await game.connect(bob).claim(2, 0);
    await game.connect(carol).claim(7, 7);
    await game.attack(0, 0, 1, 0);
    await reinforce(game.connect(bob), 2, 0);
    await game.connect(bob).attack(2, 0, 1, 0);
    const grid = await game.getGrid();
    for (const player of [alice, bob, carol]) {
      expect(await game.scoreOf(player.address)).to.equal(grid.filter(t => t.owner === player.address).length);
    }
    expect(await game.scoreOf(ethers.ZeroAddress)).to.equal(0);
    expect((await game.getTile(2, 0)).power).to.equal(1);
  });
});
