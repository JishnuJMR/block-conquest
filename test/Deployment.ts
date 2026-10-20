import { expect } from "chai";
import { network } from "hardhat";
import BlockConquest from "../ignition/modules/BlockConquest.js";
import BlockConquestMatch from "../ignition/modules/BlockConquestMatch.js";

describe("Current deployment rehearsal (local only)", function () {
  it("deploys a match through Ignition, starts with two players and finalizes a draw", async function () {
    const { ignition, ethers, networkHelpers } = await network.create();
    const { game } = await ignition.deploy(BlockConquestMatch);
    const [, second] = await ethers.getSigners();
    expect(await game.matchDuration()).to.equal(100);
    await game.join();
    await game.connect(second).join();
    expect(await game.phase()).to.equal(1);
    await networkHelpers.mine(100);
    await game.finalize();
    expect(await game.finalized()).to.equal(true);
    expect(await game.winner()).to.equal(ethers.ZeroAddress);
  });
  it("deploys the module, claims, enforces cooldown, and decays power", async function () {
    const { ignition, ethers, networkHelpers } = await network.create();
    const { game } = await ignition.deploy(BlockConquest);
    const [player] = await ethers.getSigners();
    expect(await game.decayInterval()).to.equal(10);
    expect(await game.reinforcementCooldown()).to.equal(3);
    expect(await game.maxPower()).to.equal(5);
    expect(await game.scoreOf(player.address)).to.equal(0);
    const tx = await game.claim(0, 0);
    await expect(tx).to.emit(game, "TileClaimed").withArgs(player.address, 0, 0);
    const tile = await game.getTile(0, 0);
    expect(tile.owner).to.equal(player.address);
    expect(tile.power).to.equal(1);
    expect(await game.scoreOf(player.address)).to.equal(1);
    await expect(game.reinforce.staticCall(0, 0)).to.be.revertedWithCustomError(game, "ReinforcementCooldownActive");
    await networkHelpers.mine(2);
    await game.reinforce(0, 0);
    expect(await game.effectivePower(0, 0)).to.equal(2);
    await networkHelpers.mine(10);
    expect(await game.effectivePower(0, 0)).to.equal(1);
  });
});
