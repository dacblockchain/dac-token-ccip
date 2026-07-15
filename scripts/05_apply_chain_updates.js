// Wires the local pool to its remote counterpart: remote chain selector, remote
// pool + token addresses, and rate limits. Run on BOTH chains after both pools
// are deployed (the remote addresses are read from deployments/<remote>.json).
//
// Rate limits default to a 100,000 DACT bucket refilling over ~1 hour, both
// directions. Override with RATE_LIMIT_CAPACITY / RATE_LIMIT_RATE (whole tokens)
// or disable with RATE_LIMITS_ENABLED=false.
const { ethers, network } = require("hardhat");
const { getNetworkConfig, getTokenAddress, getPoolAddress } = require("./lib");

async function main() {
  const cfg = getNetworkConfig(network.name);
  const remoteCfg = getNetworkConfig(cfg.remote);
  const pool = await ethers.getContractAt(
    cfg.role === "home" ? "LockReleaseTokenPool" : "BurnMintTokenPool",
    getPoolAddress(network.name)
  );

  const remotePool = getPoolAddress(cfg.remote);
  const remoteToken = getTokenAddress(cfg.remote);

  const enabled = process.env.RATE_LIMITS_ENABLED !== "false";
  const capacity = ethers.parseUnits(process.env.RATE_LIMIT_CAPACITY || "100000", 18);
  const rate = process.env.RATE_LIMIT_RATE
    ? ethers.parseUnits(process.env.RATE_LIMIT_RATE, 18)
    : capacity / 3600n; // full bucket refills in ~1 hour
  const rateLimiterConfig = { isEnabled: enabled, capacity: enabled ? capacity : 0n, rate: enabled ? rate : 0n };

  const abi = ethers.AbiCoder.defaultAbiCoder();
  const chainUpdate = {
    remoteChainSelector: remoteCfg.chainSelector,
    remotePoolAddresses: [abi.encode(["address"], [remotePool])],
    remoteTokenAddress: abi.encode(["address"], [remoteToken]),
    outboundRateLimiterConfig: rateLimiterConfig,
    inboundRateLimiterConfig: rateLimiterConfig,
  };

  console.log(`Connecting ${network.name} pool to ${cfg.remote}:`);
  console.log(`  remote pool:  ${remotePool}`);
  console.log(`  remote token: ${remoteToken}`);
  console.log(`  rate limits:  ${enabled ? `${ethers.formatUnits(capacity)} DACT capacity` : "disabled"}`);

  await (await pool.applyChainUpdates([], [chainUpdate])).wait();
  console.log("Chain update applied.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
