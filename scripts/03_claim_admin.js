// Registers the signer as CCIP token admin via RegistryModuleOwnerCustom.
//  - home chains:   registerAdminViaOwner — the signer MUST be the token's owner()
//                   (on Ethereum mainnet: 0x1A5C332B8aEEBA5489403A231d283dce59B00E11)
//  - remote chains: registerAdminViaGetCCIPAdmin — the signer MUST be getCCIPAdmin()
const { ethers, network } = require("hardhat");
const { getNetworkConfig, getTokenAddress } = require("./lib");

async function main() {
  const cfg = getNetworkConfig(network.name);
  const token = getTokenAddress(network.name);
  const [signer] = await ethers.getSigners();

  const registryModule = await ethers.getContractAt(
    "RegistryModuleOwnerCustom",
    cfg.registryModuleOwnerCustom
  );

  console.log(`Claiming CCIP admin for ${token} on ${network.name} as ${signer.address}`);
  const tx =
    cfg.role === "home"
      ? await registryModule.registerAdminViaOwner(token)
      : await registryModule.registerAdminViaGetCCIPAdmin(token);
  await tx.wait();
  console.log(`Admin registration proposed: ${tx.hash}`);
  console.log("Next: scripts/04_accept_admin_and_set_pool.js");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
