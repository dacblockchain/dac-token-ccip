// Bridges DACT from the current network to its configured remote chain.
//
//   AMOUNT=100 RECEIVER=0x... [FEE_TOKEN=native|link] \
//     npx hardhat run scripts/06_bridge_tokens.js --network <network>
const { ethers, network } = require("hardhat");
const { getNetworkConfig, getTokenAddress } = require("./lib");

async function main() {
  const cfg = getNetworkConfig(network.name);
  const remoteCfg = getNetworkConfig(cfg.remote);
  const [signer] = await ethers.getSigners();

  const amount = ethers.parseUnits(process.env.AMOUNT || "0", 18);
  if (amount === 0n) throw new Error("Set AMOUNT (whole DACT tokens) in the environment.");
  const receiver = process.env.RECEIVER || signer.address;
  const payInLink = (process.env.FEE_TOKEN || "native").toLowerCase() === "link";

  const tokenAddress = getTokenAddress(network.name);
  const token = await ethers.getContractAt("EthereumDacToken", tokenAddress); // any ERC20 ABI
  const router = await ethers.getContractAt("IRouterClient", cfg.router);

  const message = {
    receiver: ethers.AbiCoder.defaultAbiCoder().encode(["address"], [receiver]),
    data: "0x",
    tokenAmounts: [{ token: tokenAddress, amount }],
    feeToken: payInLink ? cfg.link : ethers.ZeroAddress,
    extraArgs: "0x", // defaults; token-only transfer needs no execution gas on destination
  };

  const fee = await router.getFee(remoteCfg.chainSelector, message);
  console.log(`Bridging ${ethers.formatUnits(amount)} DACT ${network.name} -> ${cfg.remote}`);
  console.log(`Receiver: ${receiver}`);
  console.log(`CCIP fee: ${ethers.formatUnits(fee)} ${payInLink ? "LINK" : "native"}`);

  console.log("Approving token transfer to router...");
  await (await token.approve(cfg.router, amount)).wait();
  if (payInLink) {
    const link = await ethers.getContractAt("EthereumDacToken", cfg.link);
    await (await link.approve(cfg.router, fee)).wait();
  }

  const messageId = await router.ccipSend.staticCall(remoteCfg.chainSelector, message, {
    value: payInLink ? 0n : fee,
  });
  const tx = await router.ccipSend(remoteCfg.chainSelector, message, { value: payInLink ? 0n : fee });
  await tx.wait();

  console.log(`Sent. Tx: ${tx.hash}`);
  console.log(`Track: https://ccip.chain.link/msg/${messageId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
