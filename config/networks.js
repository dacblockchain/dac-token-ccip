/**
 * CCIP infrastructure addresses per network.
 * Source: Chainlink CCIP Directory (mirrored in @chainlink/local Register.sol v0.2.9).
 * Cross-check before mainnet operations: https://docs.chain.link/ccip/directory
 *
 * role:
 *  - "home":   chain where the canonical DACT lives; uses LockReleaseTokenPool
 *  - "remote": chain with the bridged representation; uses BurnMintTokenPool
 */
module.exports = {
  mainnet: {
    chainId: 1,
    role: "home",
    remote: "bsc",
    chainSelector: "5009297550715157269",
    router: "0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D",
    rmnProxy: "0x411dE17f12D1A34ecC7F45f49844626267c75e81",
    tokenAdminRegistry: "0xb22764f98dD05c789929716D677382Df22C05Cb6",
    registryModuleOwnerCustom: "0x4855174E9479E211337832E109E7721d43A4CA64",
    link: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    // Canonical Dac Token on Ethereum mainnet
    token: "0x0d9e0916eA60D5439F1535BEA4cB83b25780Eb36",
  },
  bsc: {
    chainId: 56,
    role: "remote",
    remote: "mainnet",
    chainSelector: "11344663589394136015",
    router: "0x34B03Cb9086d7D758AC55af71584F81A598759FE",
    rmnProxy: "0x9e09697842194f77d315E0907F1Bda77922e8f84",
    tokenAdminRegistry: "0x736Fd8660c443547a85e4Eaf70A49C1b7Bb008fc",
    registryModuleOwnerCustom: "0x47Db76c9c97F4bcFd54D8872FDb848Cab696092d",
    link: "0x404460C6A5EdE2D891e8297795264fDe62ADBB75",
    token: null, // deployed by scripts/01_deploy_token.js
  },
  sepolia: {
    chainId: 11155111,
    role: "home",
    remote: "bscTestnet",
    chainSelector: "16015286601757825753",
    router: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59",
    rmnProxy: "0xba3f6251de62dED61Ff98590cB2fDf6871FbB991",
    tokenAdminRegistry: "0x95F29FEE11c5C55d26cCcf1DB6772DE953B37B82",
    registryModuleOwnerCustom: "0xa3c796d480638d7476792230da1E2ADa86e031b0",
    link: "0x779877A7B0D9E8603169DdbD7836e478b4624789",
    token: null, // EthereumDacToken replica, deployed by scripts/01_deploy_token.js
  },
  bscTestnet: {
    chainId: 97,
    role: "remote",
    remote: "sepolia",
    chainSelector: "13264668187771770619",
    router: "0xE1053aE1857476f36A3C62580FF9b016E8EE8F6f",
    rmnProxy: "0xA8C0c11bf64AF62CDCA6f93D3769B88BdD7cb93D",
    tokenAdminRegistry: "0xF8f2A4466039Ac8adf9944fD67DBb3bb13888f2B",
    registryModuleOwnerCustom: "0x8Cd87FeAC14D69D770E67Bedf029e6fd3F33D0C7",
    link: "0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06",
    token: null, // deployed by scripts/01_deploy_token.js
  },
};
