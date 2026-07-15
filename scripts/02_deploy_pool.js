// Deploys the CCIP token pool for the current network:
//  - home chains:   LockReleaseTokenPool (canonical supply gets locked/released)
//  - remote chains: BurnMintTokenPool (representation gets minted/burned)
const { ethers, network } = require("hardhat");
const { getNetworkConfig, getTokenAddress, saveDeployment } = require("./lib");

const DECIMALS = 18;

async function main() {
  const cfg = getNetworkConfig(network.name);
  const token = getTokenAddress(network.name);
  const allowlist = []; // empty = any sender may bridge

  const poolContract = cfg.role === "home" ? "LockReleaseTokenPool" : "BurnMintTokenPool";
  console.log(`Deploying ${poolContract} on ${network.name} for token ${token}`);

  const pool = await ethers.deployContract(poolContract, [
    token,
    DECIMALS,
    allowlist,
    cfg.rmnProxy,
    cfg.router,
  ]);
  await pool.waitForDeployment();
  saveDeployment(network.name, "pool", await pool.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
