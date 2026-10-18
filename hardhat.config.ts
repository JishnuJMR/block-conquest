import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  networks: {
    hardhatMainnet: { type: "edr-simulated", chainType: "l1" },
  },
  solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 } } },
});
