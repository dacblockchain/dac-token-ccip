require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const {
  MAINNET_RPC_URL,
  BSC_RPC_URL,
  SEPOLIA_RPC_URL,
  BSC_TESTNET_RPC_URL,
  DEPLOYER_PRIVATE_KEY,
  ETHERSCAN_API_KEY,
} = process.env;

const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      // cancun is supported by both Ethereum and BNB Chain (post-Haber)
      evmVersion: "cancun",
    },
  },
  networks: {
    mainnet: {
      url: MAINNET_RPC_URL || "https://eth.llamarpc.com",
      accounts,
    },
    bsc: {
      url: BSC_RPC_URL || "https://bsc-dataseed.bnbchain.org",
      accounts,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts,
    },
    bscTestnet: {
      url: BSC_TESTNET_RPC_URL || "https://bsc-testnet-dataseed.bnbchain.org",
      accounts,
    },
  },
  etherscan: {
    // Etherscan API v2: one key works across Etherscan-family explorers (incl. BscScan)
    apiKey: ETHERSCAN_API_KEY || "",
  },
};
