const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// Real chain selectors, purely symbolic in the local environment.
const ETH_SELECTOR = 5009297550715157269n;
const BSC_SELECTOR = 11344663589394136015n;

const DISABLED_LIMIT = { isEnabled: false, capacity: 0n, rate: 0n };
const abi = ethers.AbiCoder.defaultAbiCoder();

/**
 * End-to-end test of the actual pool mechanics using the audited Chainlink
 * pools. Both "chains" live on the same Hardhat network; the CCIP Router,
 * onRamp and offRamp are simulated by mocks/signers, so the tests exercise
 * exactly what the pools do on lockOrBurn/releaseOrMint.
 */
describe("DACT bridge (LockRelease on Ethereum <-> BurnMint on BSC)", function () {
  async function deployBridgeFixture() {
    const [deployer, user, onRampEth, offRampEth, onRampBsc, offRampBsc] = await ethers.getSigners();

    const rmn = await ethers.deployContract("MockRMN");
    const routerEth = await ethers.deployContract("MockPoolRouter");
    const routerBsc = await ethers.deployContract("MockPoolRouter");

    // "Ethereum": canonical token, full supply to user, lock/release pool
    const ethToken = await ethers.deployContract("EthereumDacToken", [user.address, deployer.address]);
    const ethPool = await ethers.deployContract("LockReleaseTokenPool", [
      await ethToken.getAddress(), 18, [], await rmn.getAddress(), await routerEth.getAddress(),
    ]);

    // "BSC": burn/mint representation and its pool
    const bscToken = await ethers.deployContract("DacToken", [deployer.address]);
    const bscPool = await ethers.deployContract("BurnMintTokenPool", [
      await bscToken.getAddress(), 18, [], await rmn.getAddress(), await routerBsc.getAddress(),
    ]);
    await bscToken.grantMintAndBurnRoles(await bscPool.getAddress());

    // Cross-wire the pools exactly like scripts/05_apply_chain_updates.js
    await ethPool.applyChainUpdates([], [{
      remoteChainSelector: BSC_SELECTOR,
      remotePoolAddresses: [abi.encode(["address"], [await bscPool.getAddress()])],
      remoteTokenAddress: abi.encode(["address"], [await bscToken.getAddress()]),
      outboundRateLimiterConfig: DISABLED_LIMIT,
      inboundRateLimiterConfig: DISABLED_LIMIT,
    }]);
    await bscPool.applyChainUpdates([], [{
      remoteChainSelector: ETH_SELECTOR,
      remotePoolAddresses: [abi.encode(["address"], [await ethPool.getAddress()])],
      remoteTokenAddress: abi.encode(["address"], [await ethToken.getAddress()]),
      outboundRateLimiterConfig: DISABLED_LIMIT,
      inboundRateLimiterConfig: DISABLED_LIMIT,
    }]);

    // Authorize our simulated ramps on the routers
    await routerEth.setOnRamp(BSC_SELECTOR, onRampEth.address);
    await routerEth.setOffRamp(BSC_SELECTOR, offRampEth.address, true);
    await routerBsc.setOnRamp(ETH_SELECTOR, onRampBsc.address);
    await routerBsc.setOffRamp(ETH_SELECTOR, offRampBsc.address, true);

    return { deployer, user, onRampEth, offRampEth, onRampBsc, offRampBsc,
             ethToken, ethPool, bscToken, bscPool };
  }

  // The onRamp transfers the sender's tokens to the pool before calling lockOrBurn;
  // tests replicate that transfer explicitly.
  async function sendEthToBsc(f, amount) {
    await f.ethToken.connect(f.user).transfer(await f.ethPool.getAddress(), amount);
    await f.ethPool.connect(f.onRampEth).lockOrBurn({
      receiver: abi.encode(["address"], [f.user.address]),
      remoteChainSelector: BSC_SELECTOR,
      originalSender: f.user.address,
      amount,
      localToken: await f.ethToken.getAddress(),
    });
    await f.bscPool.connect(f.offRampBsc).releaseOrMint({
      originalSender: abi.encode(["address"], [f.user.address]),
      remoteChainSelector: ETH_SELECTOR,
      receiver: f.user.address,
      sourceDenominatedAmount: amount,
      localToken: await f.bscToken.getAddress(),
      sourcePoolAddress: abi.encode(["address"], [await f.ethPool.getAddress()]),
      sourcePoolData: "0x",
      offchainTokenData: "0x",
    });
  }

  it("locks DACT on Ethereum and mints the same amount on BSC", async function () {
    const f = await loadFixture(deployBridgeFixture);
    const amount = ethers.parseUnits("1000", 18);

    await sendEthToBsc(f, amount);

    expect(await f.ethToken.balanceOf(await f.ethPool.getAddress())).to.equal(amount);
    expect(await f.bscToken.balanceOf(f.user.address)).to.equal(amount);
    expect(await f.bscToken.totalSupply()).to.equal(amount);
  });

  it("burns DACT on BSC and releases the locked tokens on Ethereum", async function () {
    const f = await loadFixture(deployBridgeFixture);
    const amount = ethers.parseUnits("1000", 18);
    await sendEthToBsc(f, amount);

    const balanceBefore = await f.ethToken.balanceOf(f.user.address);

    // BSC -> ETH: burn on BSC
    await f.bscToken.connect(f.user).transfer(await f.bscPool.getAddress(), amount);
    await expect(
      f.bscPool.connect(f.onRampBsc).lockOrBurn({
        receiver: abi.encode(["address"], [f.user.address]),
        remoteChainSelector: ETH_SELECTOR,
        originalSender: f.user.address,
        amount,
        localToken: await f.bscToken.getAddress(),
      })
    ).to.emit(f.bscPool, "LockedOrBurned");
    expect(await f.bscToken.totalSupply()).to.equal(0n);

    // ETH: release from the lock pool
    await f.ethPool.connect(f.offRampEth).releaseOrMint({
      originalSender: abi.encode(["address"], [f.user.address]),
      remoteChainSelector: BSC_SELECTOR,
      receiver: f.user.address,
      sourceDenominatedAmount: amount,
      localToken: await f.ethToken.getAddress(),
      sourcePoolAddress: abi.encode(["address"], [await f.bscPool.getAddress()]),
      sourcePoolData: "0x",
      offchainTokenData: "0x",
    });

    expect(await f.ethToken.balanceOf(f.user.address)).to.equal(balanceBefore + amount);
    expect(await f.ethToken.balanceOf(await f.ethPool.getAddress())).to.equal(0n);
  });

  it("rejects lockOrBurn from callers the router does not know as onRamp", async function () {
    const f = await loadFixture(deployBridgeFixture);
    const amount = ethers.parseUnits("1", 18);
    await f.ethToken.connect(f.user).transfer(await f.ethPool.getAddress(), amount);

    await expect(
      f.ethPool.connect(f.user).lockOrBurn({
        receiver: abi.encode(["address"], [f.user.address]),
        remoteChainSelector: BSC_SELECTOR,
        originalSender: f.user.address,
        amount,
        localToken: await f.ethToken.getAddress(),
      })
    ).to.be.revertedWithCustomError(f.ethPool, "CallerIsNotARampOnRouter");
  });

  it("rejects releaseOrMint claiming to come from an unknown source pool", async function () {
    const f = await loadFixture(deployBridgeFixture);
    const attacker = f.user;

    await expect(
      f.bscPool.connect(f.offRampBsc).releaseOrMint({
        originalSender: abi.encode(["address"], [attacker.address]),
        remoteChainSelector: ETH_SELECTOR,
        receiver: attacker.address,
        sourceDenominatedAmount: ethers.parseUnits("1000000", 18),
        localToken: await f.bscToken.getAddress(),
        sourcePoolAddress: abi.encode(["address"], [attacker.address]), // not the ETH pool
        sourcePoolData: "0x",
        offchainTokenData: "0x",
      })
    ).to.be.revertedWithCustomError(f.bscPool, "InvalidSourcePoolAddress");
  });

  it("rejects transfers to chains that were never configured", async function () {
    const f = await loadFixture(deployBridgeFixture);
    const bogusSelector = 1234n; // never configured on the pool

    await expect(
      f.ethPool.connect(f.onRampEth).lockOrBurn({
        receiver: abi.encode(["address"], [f.user.address]),
        remoteChainSelector: bogusSelector,
        originalSender: f.user.address,
        amount: 1n,
        localToken: await f.ethToken.getAddress(),
      })
    ).to.be.revertedWithCustomError(f.ethPool, "ChainNotAllowed");
  });

  it("enforces the outbound rate limit when enabled", async function () {
    const f = await loadFixture(deployBridgeFixture);
    const capacity = ethers.parseUnits("100", 18);

    await f.ethPool.setChainRateLimiterConfig(
      BSC_SELECTOR,
      { isEnabled: true, capacity, rate: capacity / 3600n },
      DISABLED_LIMIT
    );

    const amount = capacity + 1n;
    await f.ethToken.connect(f.user).transfer(await f.ethPool.getAddress(), amount);
    await expect(
      f.ethPool.connect(f.onRampEth).lockOrBurn({
        receiver: abi.encode(["address"], [f.user.address]),
        remoteChainSelector: BSC_SELECTOR,
        originalSender: f.user.address,
        amount,
        localToken: await f.ethToken.getAddress(),
      })
    ).to.be.revertedWithCustomError(f.ethPool, "TokenMaxCapacityExceeded");
  });

  it("reports the remote token and pool it was configured with", async function () {
    const f = await loadFixture(deployBridgeFixture);
    expect(await f.ethPool.getRemoteToken(BSC_SELECTOR)).to.equal(
      abi.encode(["address"], [await f.bscToken.getAddress()])
    );
    expect(await f.bscPool.getRemoteToken(ETH_SELECTOR)).to.equal(
      abi.encode(["address"], [await f.ethToken.getAddress()])
    );
  });
});
