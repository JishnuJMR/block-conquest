import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("BlockConquestMatch", (m) => {
  const game = m.contract("BlockConquestMatch", [10, 3, 5, 100]);
  return { game };
});
