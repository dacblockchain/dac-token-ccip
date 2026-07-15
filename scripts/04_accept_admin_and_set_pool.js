// Completes registration in the TokenAdminRegistry: accepts the admin role,
// links the token to its pool, and (on burn/mint chains) grants the pool
// mint+burn roles on the token.
const { ethers, network } = require("hardhat");
const { getNetworkConfig, getTokenAddress, getPoolAddress } = require("./lib");

async function main() {
  const cfg = getNetworkConfig(network.name);
  const token = getTokenAddress(network.name);
  const pool = getPoolAddress(network.name);

  const registry = await ethers.getContractAt("TokenAdminRegistry", cfg.tokenAdminRegistry);

  console.log(`Accepting admin role for ${token}`);
  await (await registry.acceptAdminRole(token)).wait();

  console.log(`Setting pool ${pool} for ${token}`);
  await (await registry.setPool(token, pool)).wait();

  if (cfg.role === "remote") {
    console.log(`Granting mint+burn roles to the pool`);
    const dacToken = await ethers.getContractAt("DacToken", token);
    await (await dacToken.grantMintAndBurnRoles(pool)).wait();
  }

  console.log("Done. Next: scripts/05_apply_chain_updates.js (on both chains)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
