import { expect } from "chai";
import { ethers, networkHelpers, mineTo, blockNumber } from "./helpers/game.js";

async function setup(duration = 1000, decay = 10, cooldown = 3, cap = 5) {
  const [alice, bob, spectator] = await ethers.getSigners();
  const game = await ethers.deployContract("BlockConquestMatch", [decay, cooldown, cap, duration]);
  await game.waitForDeployment();
  return { game, alice, bob, spectator };
}
async function started(duration = 1000, decay = 10, cooldown = 3, cap = 5) {
  const fixture = await setup(duration, decay, cooldown, cap);
  await fixture.game.join();
  await fixture.game.connect(fixture.bob).join();
  return fixture;
}

describe("BlockConquestMatch — lifecycle and gameplay", function () {
  for (const args of [[0, 3, 5, 100], [10, 0, 5, 100], [10, 3, 1, 100], [10, 3, 5, 0], [10, 3, 5, 3], [10n, 3n, 5n, 2n ** 64n]]) {
    it(`rejects invalid configuration ${args}`, async function () {
      const factory = await ethers.getContractFactory("BlockConquestMatch");
      await expect(factory.deploy(...args as [number, number, number, number])).to.be.revertedWithCustomError(factory, "InvalidConfiguration");
    });
  }
  it("waits indefinitely for two players with no territory or clock running", async function () {
    const { game, alice } = await setup();
    expect(await game.MATCH_VERSION()).to.equal(1);
    expect(await game.matchDuration()).to.equal(1000);
    expect(await game.phase()).to.equal(0);
    await expect(game.join()).to.emit(game, "PlayerJoined").withArgs(alice.address, 1);
    await networkHelpers.mine(1500);
    expect(await game.startBlock()).to.equal(0);
    expect(await game.endBlock()).to.equal(0);
    expect(await game.phase()).to.equal(0);
    expect(await game.scoreOf(alice.address)).to.equal(0);
    expect((await game.getGrid()).every(t => t.owner === ethers.ZeroAddress)).to.equal(true);
    for (const call of [() => game.claim(1, 0), () => game.reinforce(0, 0), () => game.attack(0, 0, 1, 0), () => game.finalize()]) {
      await expect(call()).to.be.revertedWithCustomError(game, "MatchNotStarted");
    }
  });
  it("starts on second join and gives equal power, timestamps and scores at opposite corners", async function () {
    const { game, alice, bob } = await setup(100);
    await game.join();
    const tx = await game.connect(bob).join();
    const block = BigInt((await tx.wait())!.blockNumber);
    await expect(tx).to.emit(game, "PlayerJoined").withArgs(bob.address, 2)
      .and.to.emit(game, "MatchStarted").withArgs(block, block + 100n)
      .and.to.emit(game, "TileClaimed").withArgs(alice.address, 0, 0)
      .and.to.emit(game, "TileClaimed").withArgs(bob.address, 7, 7);
    expect(await game.phase()).to.equal(1);
    expect(await game.getTile(0, 0)).to.deep.equal([alice.address, 1n, block]);
    expect(await game.getTile(7, 7)).to.deep.equal([bob.address, 1n, block]);
    expect(await game.scoreOf(alice.address)).to.equal(1);
    expect(await game.scoreOf(bob.address)).to.equal(1);
    await expect(game.reinforce.staticCall(0, 0)).to.be.revertedWithCustomError(game, "ReinforcementCooldownActive");
  });
  it("rejects duplicate joins and a third seat, and restricts moves to players", async function () {
    const { game, bob, spectator } = await setup();
    await game.join();
    await expect(game.join()).to.be.revertedWithCustomError(game, "AlreadyJoined");
    await game.connect(bob).join();
    await expect(game.connect(bob).join()).to.be.revertedWithCustomError(game, "AlreadyJoined");
    await expect(game.connect(spectator).join()).to.be.revertedWithCustomError(game, "MatchFull");
    for (const call of [() => game.connect(spectator).claim(1, 0), () => game.connect(spectator).reinforce(0, 0), () => game.connect(spectator).attack(0, 0, 1, 0)]) {
      await expect(call()).to.be.revertedWithCustomError(game, "NotPlayer");
    }
  });
  it("rejects early finalization", async function () {
    const { game } = await started();
    await expect(game.finalize()).to.be.revertedWithCustomError(game, "MatchStillActive");
  });
  it("allows a move in the last playable block, rejects all moves exactly at deadline", async function () {
    const { game, bob } = await started(20);
    const end = await game.endBlock();
    await mineTo(end - 2n);
    await game.claim(1, 0);
    expect(await blockNumber()).to.equal(end - 1n);
    expect(await game.phase()).to.equal(1);
    await expect(game.claim(2, 0, { gasLimit: 200_000 })).to.be.revertedWithCustomError(game, "MatchEnded");
    expect(await blockNumber()).to.equal(end);
    expect(await game.phase()).to.equal(2);
    for (const call of [() => game.reinforce.staticCall(0, 0), () => game.connect(bob).attack.staticCall(7, 7, 6, 7)]) {
      await expect(call()).to.be.revertedWithCustomError(game, "MatchEnded");
    }
  });
  for (const victor of ["one", "two", "draw"]) {
    it(`records ${victor} result through a spectator and cannot finalize twice or resume`, async function () {
      const { game, alice, bob, spectator } = await started(20);
      if (victor !== "draw") await game.connect(victor === "one" ? alice : bob).claim(4, 4);
      const winner = victor === "draw" ? ethers.ZeroAddress : victor === "one" ? alice.address : bob.address;
      await mineTo(await game.endBlock());
      await expect(game.connect(spectator).finalize()).to.emit(game, "MatchFinalized")
        .withArgs(winner, victor === "one" ? 2 : 1, victor === "two" ? 2 : 1);
      expect(await game.winner()).to.equal(winner);
      expect(await game.finalized()).to.equal(true);
      expect(await game.phase()).to.equal(3);
      await expect(game.finalize()).to.be.revertedWithCustomError(game, "AlreadyFinalized");
      await expect(game.claim(5, 5)).to.be.revertedWithCustomError(game, "MatchEnded");
      await expect(game.connect(spectator).join()).to.be.revertedWithCustomError(game, "MatchFull");
    });
  }
  it("can finalize in the exact deadline block", async function () {
    const { game } = await started(20);
    const end = await game.endBlock();
    await mineTo(end - 1n);
    const tx = await game.finalize({ gasLimit: 200_000 });
    expect((await tx.wait())!.blockNumber).to.equal(Number(end));
  });
  it("freezes effective power at the deadline, even if finalization is delayed", async function () {
    const { game } = await started(20, 100);
    await networkHelpers.mine(3);
    await game.reinforce(0, 0);
    await mineTo(await game.endBlock());
    const grid = await game.getGrid();
    expect(await game.effectivePower(0, 0)).to.equal(2);
    await networkHelpers.mine(1000);
    expect(await game.getGrid()).to.deep.equal(grid);
    await game.finalize();
    expect(await game.getGrid()).to.deep.equal(grid);
  });
  it("validates coordinates on all tile APIs and rejects occupied starting tiles", async function () {
    const { game, bob } = await started();
    for (const [x, y] of [[8, 0], [0, 8], [255, 255]]) {
      for (const call of [() => game.claim(x, y), () => game.reinforce(x, y), () => game.getTile(x, y), () => game.effectivePower(x, y), () => game.attack(x, y, 0, 0), () => game.attack(0, 0, x, y)]) {
        await expect(call()).to.be.revertedWithCustomError(game, "InvalidCoordinates");
      }
    }
    await expect(game.claim(0, 0)).to.be.revertedWithCustomError(game, "TileOccupied");
    await expect(game.connect(bob).claim(0, 0)).to.be.revertedWithCustomError(game, "TileOccupied");
    await expect(game.reinforce(7, 7)).to.be.revertedWithCustomError(game, "NotTileOwner");
    await expect(game.attack(7, 7, 6, 7)).to.be.revertedWithCustomError(game, "NotTileOwner");
    await expect(game.attack(0, 0, 1, 0)).to.be.revertedWithCustomError(game, "NotEnemyTile");
    await game.claim(1, 0);
    await expect(game.attack(0, 0, 1, 0)).to.be.revertedWithCustomError(game, "NotEnemyTile");
  });
  for (const [sx, sy, tx, ty, allowed] of [[0,0,1,0,true], [7,7,6,7,true], [0,0,0,1,true], [7,7,7,6,true], [7,0,0,1,false], [0,0,1,1,false], [0,0,0,2,false]] as const) {
    it(`checks adjacency at ${sx},${sy} to ${tx},${ty}`, async function () {
      const { game, bob } = await started(1000, 100);
      // H8 belongs to player two; use that player as the attacker for this edge.
      const sourceIsBob = sx === 7 && sy === 7;
      const source = sourceIsBob ? game.connect(bob) : game;
      const target = sourceIsBob ? game : game.connect(bob);
      if (!(sx === 0 && sy === 0) && !sourceIsBob) await source.claim(sx, sy);
      await target.claim(tx, ty);
      await networkHelpers.mine(3);
      await source.reinforce(sx, sy);
      if (allowed) await expect(source.attack(sx, sy, tx, ty)).to.emit(game, "TileCaptured");
      else await expect(source.attack(sx, sy, tx, ty)).to.be.revertedWithCustomError(game, "NotAdjacent");
    });
  }
  it("rejects equal and insufficient power; captures using both decayed powers and updates scores/timestamps", async function () {
    const { game, alice, bob } = await started(1000, 20);
    await game.connect(bob).claim(1, 0);
    await expect(game.attack(0, 0, 1, 0)).to.be.revertedWithCustomError(game, "InsufficientPower");
    await networkHelpers.mine(3);
    await game.connect(bob).reinforce(1, 0);
    await expect(game.attack(0, 0, 1, 0)).to.be.revertedWithCustomError(game, "InsufficientPower");
    for (let i = 0; i < 3; i++) { await networkHelpers.mine(3); await game.reinforce(0, 0); }
    const source = await game.getTile(0, 0), target = await game.getTile(1, 0);
    await mineTo(source.lastUpdateBlock + 20n - 1n);
    const tx = await game.attack(0, 0, 1, 0);
    const block = BigInt((await tx.wait())!.blockNumber);
    const sp = source.power - (block - source.lastUpdateBlock) / 20n;
    const tp = target.power - (block - target.lastUpdateBlock) / 20n;
    expect(sp).to.equal(3); expect(tp).to.equal(1);
    await expect(tx).to.emit(game, "TileCaptured").withArgs(alice.address, bob.address, 0, 0, 1, 0, 2);
    expect(await game.getTile(0, 0)).to.deep.equal([alice.address, 2n, block]);
    expect(await game.getTile(1, 0)).to.deep.equal([alice.address, 1n, block]);
    expect(await game.scoreOf(alice.address)).to.equal(2);
    expect(await game.scoreOf(bob.address)).to.equal(1);
    await expect(game.reinforce.staticCall(0, 0)).to.be.revertedWithCustomError(game, "ReinforcementCooldownActive");
    await expect(game.reinforce.staticCall(1, 0)).to.be.revertedWithCustomError(game, "ReinforcementCooldownActive");
  });
  it("enforces exact cooldown and cap, and reinforces from decayed power after long inactivity", async function () {
    const { game } = await started(10000, 20, 3, 3);
    const start = await game.startBlock();
    await mineTo(start + 2n);
    await expect(game.reinforce.staticCall(0, 0)).to.be.revertedWithCustomError(game, "ReinforcementCooldownActive");
    await game.reinforce(0, 0);
    expect(await game.effectivePower(0, 0)).to.equal(2);
    await networkHelpers.mine(2); await game.reinforce(0, 0);
    await networkHelpers.mine(3);
    await expect(game.reinforce(0, 0)).to.be.revertedWithCustomError(game, "PowerCapReached");
    const update = (await game.getTile(0, 0)).lastUpdateBlock;
    await mineTo(update + 19n); expect(await game.effectivePower(0, 0)).to.equal(3);
    await networkHelpers.mine(1); expect(await game.effectivePower(0, 0)).to.equal(2);
    await networkHelpers.mine(2000); expect(await game.effectivePower(0, 0)).to.equal(1);
    await game.reinforce(0, 0);
    expect((await game.getTile(0, 0)).power).to.equal(2);
    expect(await game.effectivePower(1, 1)).to.equal(0);
  });
  it("lets a player with zero tiles return by claiming an empty tile", async function () {
    const { game, alice, bob } = await started(1000, 100);
    await game.connect(bob).claim(1, 0);
    await networkHelpers.mine(3); await game.connect(bob).reinforce(1, 0);
    await game.connect(bob).attack(1, 0, 0, 0);
    expect(await game.scoreOf(alice.address)).to.equal(0);
    await game.claim(2, 2);
    expect(await game.scoreOf(alice.address)).to.equal(1);
    const counts = new Map<string, bigint>();
    for (const tile of await game.getGrid()) if (tile.owner !== ethers.ZeroAddress) counts.set(tile.owner, (counts.get(tile.owner) ?? 0n) + 1n);
    expect(await game.scoreOf(alice.address)).to.equal(counts.get(alice.address));
    expect(await game.scoreOf(bob.address)).to.equal(counts.get(bob.address));
  });
});
