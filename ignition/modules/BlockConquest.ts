import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Current contract with decay/cooldown. A fresh module ID separates it from
// the historical throwaway contract. Public deployment requires authorization.
export default buildModule("BlockConquest", (m) => {
  const game = m.contract("BlockConquest", [10, 3, 5]);
  return { game };
});
