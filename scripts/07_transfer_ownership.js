// Hands every admin right over to the Safe multisig on the current network:
//  - token pool ownership           (2-step: the Safe must call pool.acceptOwnership())
//  - TokenAdminRegistry admin role  (2-step: the Safe must call registry.acceptAdminRole(token))
//  - burn/mint chains: DacToken DEFAULT_ADMIN_ROLE + CCIP admin, then the signer renounces
//
//   SAFE=0x... npx hardhat run scripts/07_transfer_ownership.js --network <network>
//
// Only the transfers the signer is authorized for are sent; the rest are reported.
// On Ethereum mainnet the pool owner (deployer) and registry admin (token owner)
// differ, so run it once with each key.
const { ethers, network } = require("hardhat");
const { getNetworkConfig, getTokenAddress, getPoolAddress } = require("./lib");

async function transferToSafe({ signer, safe, token, pool, registry, role }) {
  const me = signer.address;
  const pending = [];

  if ((await pool.owner()) === me) {
    console.log(`Pool: transferring ownership to ${safe}`);
    await (await pool.transferOwnership(safe)).wait();
  } else {
    console.log(`Pool: owned by ${await pool.owner()}, not the signer — skipped`);
  }
  pending.push(`pool ${await pool.getAddress()}: acceptOwnership()`);

  const tokenAddress = await token.getAddress();
  const { administrator } = await registry.getTokenConfig(tokenAddress);
  if (administrator === me) {
    console.log(`TokenAdminRegistry: transferring admin role to ${safe}`);
    await (await registry.transferAdminRole(tokenAddress, safe)).wait();
  } else {
    console.log(`TokenAdminRegistry: admin is ${administrator}, not the signer — skipped`);
  }
  pending.push(`registry ${await registry.getAddress()}: acceptAdminRole(${tokenAddress})`);

  if (role === "remote") {
    const ADMIN = await token.DEFAULT_ADMIN_ROLE();
    if (await token.hasRole(ADMIN, me)) {
      console.log(`DacToken: granting DEFAULT_ADMIN_ROLE and CCIP admin to ${safe}`);
      if (!(await token.hasRole(ADMIN, safe))) await (await token.grantRole(ADMIN, safe)).wait();
      if ((await token.getCCIPAdmin()) !== safe) await (await token.setCCIPAdmin(safe)).wait();

      // Renouncing is irreversible: only do it once the Safe provably holds the role.
      if (!(await token.hasRole(ADMIN, safe))) throw new Error("Safe does not hold DEFAULT_ADMIN_ROLE; not renouncing");
      console.log(`DacToken: signer renouncing DEFAULT_ADMIN_ROLE`);
      await (await token.renounceRole(ADMIN, me)).wait();
    } else {
      console.log(`DacToken: signer holds no DEFAULT_ADMIN_ROLE — skipped`);
    }
  }

  return pending;
}

async function main() {
  const cfg = getNetworkConfig(network.name);
  const [signer] = await ethers.getSigners();
  const safe = process.env.SAFE && ethers.getAddress(process.env.SAFE);
  if (!safe) throw new Error("Set SAFE to the multisig address on this network.");
  if ((await ethers.provider.getCode(safe)) === "0x") {
    throw new Error(`${safe} has no code on ${network.name} — wrong address or Safe not deployed on this chain.`);
  }

  const token = await ethers.getContractAt(
    cfg.role === "remote" ? "DacToken" : "EthereumDacToken",
    getTokenAddress(network.name)
  );
  const pool = await ethers.getContractAt(
    cfg.role === "home" ? "LockReleaseTokenPool" : "BurnMintTokenPool",
    getPoolAddress(network.name)
  );
  const registry = await ethers.getContractAt("TokenAdminRegistry", cfg.tokenAdminRegistry);

  console.log(`Handing ${network.name} admin rights from ${signer.address} to Safe ${safe}`);
  const pending = await transferToSafe({ signer, safe, token, pool, registry, role: cfg.role });

  console.log("\nNow execute from the Safe (skip any already accepted):");
  for (const call of pending) console.log(`  - ${call}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { transferToSafe };
