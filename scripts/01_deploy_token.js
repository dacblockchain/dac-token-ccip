// Deploys the DACT token for the current network's bridge role.
//  - remote chains (BSC): the burn/mint DacToken representation
//  - home testnet (Sepolia): the EthereumDacToken replica, for rehearsing the
//    lock/release side. On Ethereum mainnet the canonical token already exists.
const { ethers, network } = require("hardhat");
const { getNetworkConfig, saveDeployment } = require("./lib");

async function main() {
  const cfg = getNetworkConfig(network.name);
  const [deployer] = await ethers.getSigners();

  if (cfg.token) {
    throw new Error(`${network.name} already has the canonical token at ${cfg.token}; nothing to deploy.`);
  }

  let token;
  if (cfg.role === "remote") {
    const admin = process.env.TOKEN_ADMIN || deployer.address;
    console.log(`Deploying burn/mint DacToken on ${network.name} (admin: ${admin})`);
    token = await ethers.deployContract("DacToken", [admin]);
  } else {
    const recipient = process.env.TOKEN_RECIPIENT || deployer.address;
    const owner = process.env.TOKEN_OWNER || deployer.address;
    console.log(`Deploying EthereumDacToken replica on ${network.name} (recipient: ${recipient}, owner: ${owner})`);
    token = await ethers.deployContract("EthereumDacToken", [recipient, owner]);
  }

  await token.waitForDeployment();
  saveDeployment(network.name, "token", await token.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
