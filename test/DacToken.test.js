const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const MAX_SUPPLY = ethers.parseUnits("1000000000", 18);

describe("DacToken (burn/mint representation)", function () {
  async function deployFixture() {
    const [admin, pool, alice, bob] = await ethers.getSigners();
    const token = await ethers.deployContract("DacToken", [admin.address]);
    await token.grantMintAndBurnRoles(pool.address);
    return { token, admin, pool, alice, bob };
  }

  it("has the same metadata as the canonical token", async function () {
    const { token } = await loadFixture(deployFixture);
    expect(await token.name()).to.equal("Dac Token");
    expect(await token.symbol()).to.equal("DACT");
    expect(await token.decimals()).to.equal(18);
  });

  it("starts with zero supply", async function () {
    const { token } = await loadFixture(deployFixture);
    expect(await token.totalSupply()).to.equal(0n);
  });

  describe("mint", function () {
    it("allows the pool to mint", async function () {
      const { token, pool, alice } = await loadFixture(deployFixture);
      await token.connect(pool).mint(alice.address, 1000n);
      expect(await token.balanceOf(alice.address)).to.equal(1000n);
    });

    it("rejects mint from accounts without MINTER_ROLE", async function () {
      const { token, alice } = await loadFixture(deployFixture);
      await expect(token.connect(alice).mint(alice.address, 1n)).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("caps total supply at the canonical 1B supply", async function () {
      const { token, pool, alice } = await loadFixture(deployFixture);
      await token.connect(pool).mint(alice.address, MAX_SUPPLY);
      await expect(token.connect(pool).mint(alice.address, 1n))
        .to.be.revertedWithCustomError(token, "MaxSupplyExceeded")
        .withArgs(MAX_SUPPLY + 1n);
    });
  });

  describe("burn", function () {
    it("allows the pool to burn its own balance", async function () {
      const { token, pool } = await loadFixture(deployFixture);
      await token.connect(pool).mint(pool.address, 500n);
      await token.connect(pool)["burn(uint256)"](200n);
      expect(await token.totalSupply()).to.equal(300n);
    });

    it("rejects burn from accounts without BURNER_ROLE", async function () {
      const { token, pool, alice } = await loadFixture(deployFixture);
      await token.connect(pool).mint(alice.address, 100n);
      await expect(token.connect(alice)["burn(uint256)"](100n)).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("supports allowance-based burnFrom for the pool", async function () {
      const { token, pool, alice } = await loadFixture(deployFixture);
      await token.connect(pool).mint(alice.address, 100n);
      await token.connect(alice).approve(pool.address, 100n);
      await token.connect(pool).burnFrom(alice.address, 100n);
      expect(await token.totalSupply()).to.equal(0n);
    });
  });

  describe("CCIP admin", function () {
    it("exposes getCCIPAdmin for registry self-registration", async function () {
      const { token, admin } = await loadFixture(deployFixture);
      expect(await token.getCCIPAdmin()).to.equal(admin.address);
    });

    it("lets only DEFAULT_ADMIN_ROLE rotate the CCIP admin", async function () {
      const { token, admin, alice } = await loadFixture(deployFixture);
      await expect(token.connect(alice).setCCIPAdmin(alice.address)).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
      await expect(token.connect(admin).setCCIPAdmin(alice.address))
        .to.emit(token, "CCIPAdminTransferred")
        .withArgs(admin.address, alice.address);
      expect(await token.getCCIPAdmin()).to.equal(alice.address);
    });
  });
});
