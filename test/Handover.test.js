const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { transferToSafe } = require("../scripts/07_transfer_ownership");

/**
 * scripts/07_transfer_ownership.js against the real TokenAdminRegistry and
 * pools: every admin right ends up with the Safe, and the deployer keeps none.
 */
describe("Admin handover to the Safe (scripts/07)", function () {
  async function deployFixture() {
    const [deployer, safe, stranger] = await ethers.getSigners();
    const rmn = await ethers.deployContract("MockRMN");
    const router = await ethers.deployContract("MockPoolRouter");

    const token = await ethers.deployContract("DacToken", [deployer.address]);
    const pool = await ethers.deployContract("BurnMintTokenPool", [
      await token.getAddress(), 18, [], await rmn.getAddress(), await router.getAddress(),
    ]);
    await token.grantMintAndBurnRoles(await pool.getAddress());

    // Registry state after scripts/03 + 04: deployer is the token's CCIP admin
    const registry = await ethers.deployContract("TokenAdminRegistry");
    await registry.addRegistryModule(deployer.address);
    await registry.proposeAdministrator(await token.getAddress(), deployer.address);
    await registry.acceptAdminRole(await token.getAddress());
    await registry.setPool(await token.getAddress(), await pool.getAddress());

    return { deployer, safe, stranger, token, pool, registry };
  }

  it("moves pool, registry and token admin to the Safe on a burn/mint chain", async function () {
    const { deployer, safe, token, pool, registry } = await loadFixture(deployFixture);
    const ADMIN = await token.DEFAULT_ADMIN_ROLE();
    const tokenAddress = await token.getAddress();

    const pending = await transferToSafe({
      signer: deployer, safe: safe.address, token, pool, registry, role: "remote",
    });
    expect(pending).to.have.length(2);

    // Token: Safe is admin + CCIP admin, deployer renounced
    expect(await token.hasRole(ADMIN, safe.address)).to.equal(true);
    expect(await token.hasRole(ADMIN, deployer.address)).to.equal(false);
    expect(await token.getCCIPAdmin()).to.equal(safe.address);

    // Two-step transfers complete once the Safe accepts
    await pool.connect(safe).acceptOwnership();
    await registry.connect(safe).acceptAdminRole(tokenAddress);
    expect(await pool.owner()).to.equal(safe.address);
    expect((await registry.getTokenConfig(tokenAddress)).administrator).to.equal(safe.address);

    // Pool keeps its mint/burn roles; deployer can no longer grant new minters
    expect(await token.hasRole(await token.MINTER_ROLE(), await pool.getAddress())).to.equal(true);
    await expect(token.grantMintAndBurnRoles(deployer.address))
      .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
  });

  it("skips rights the signer does not hold instead of reverting", async function () {
    const { safe, stranger, token, pool, registry } = await loadFixture(deployFixture);
    const ADMIN = await token.DEFAULT_ADMIN_ROLE();

    await transferToSafe({ signer: stranger, safe: safe.address, token, pool, registry, role: "remote" });

    expect(await pool.owner()).to.not.equal(safe.address);
    expect(await token.hasRole(ADMIN, safe.address)).to.equal(false);
  });
});
