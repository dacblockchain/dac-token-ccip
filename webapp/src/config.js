// Chain and contract addresses for the bridge UI.
// Mirrors ../config/networks.js and ../deployments/*.json; keep them in sync.
//
// RPC URLs are used only for read calls (balances, fee quotes, rate limits).
// Transactions are always signed and sent through MetaMask. Override the public
// defaults with VITE_*_RPC_URL in webapp/.env.local.
const env = import.meta.env;

const POOL = "0xdE61BAE56E79306B0b42Bf3297F3c138347099B7";

export const ENVIRONMENTS = {
  mainnet: {
    label: "Mainnet",
    chains: [
      {
        key: "mainnet",
        name: "Ethereum",
        chainId: 1,
        chainSelector: 5009297550715157269n,
        router: "0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D",
        token: "0x0d9e0916eA60D5439F1535BEA4cB83b25780Eb36",
        pool: POOL,
        nativeSymbol: "ETH",
        rpc: env.VITE_MAINNET_RPC_URL || "https://ethereum-rpc.publicnode.com",
        explorer: "https://etherscan.io",
        delivery: "15–20 minutes (waits for Ethereum finality)",
        addParams: null, // built into MetaMask
      },
      {
        key: "bsc",
        name: "BNB Chain",
        chainId: 56,
        chainSelector: 11344663589394136015n,
        router: "0x34B03Cb9086d7D758AC55af71584F81A598759FE",
        token: "0x9D1C28CC64409E15d7c0b80De4D0a7692095Ad2A",
        pool: POOL,
        nativeSymbol: "BNB",
        rpc: env.VITE_BSC_RPC_URL || "https://bsc-rpc.publicnode.com",
        explorer: "https://bscscan.com",
        delivery: "1–2 minutes",
        addParams: {
          chainName: "BNB Smart Chain",
          nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
          rpcUrls: ["https://bsc-dataseed.bnbchain.org"],
          blockExplorerUrls: ["https://bscscan.com"],
        },
      },
    ],
  },
  testnet: {
    label: "Testnet",
    chains: [
      {
        key: "sepolia",
        name: "Sepolia",
        chainId: 11155111,
        chainSelector: 16015286601757825753n,
        router: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59",
        token: "0x9D1C28CC64409E15d7c0b80De4D0a7692095Ad2A",
        pool: POOL,
        nativeSymbol: "ETH",
        rpc: env.VITE_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
        explorer: "https://sepolia.etherscan.io",
        delivery: "about 20 minutes",
        addParams: null,
      },
      {
        key: "bscTestnet",
        name: "BSC Testnet",
        chainId: 97,
        chainSelector: 13264668187771770619n,
        router: "0xE1053aE1857476f36A3C62580FF9b016E8EE8F6f",
        token: "0x9D1C28CC64409E15d7c0b80De4D0a7692095Ad2A",
        pool: POOL,
        nativeSymbol: "tBNB",
        rpc: env.VITE_BSC_TESTNET_RPC_URL || "https://bsc-testnet-rpc.publicnode.com",
        explorer: "https://testnet.bscscan.com",
        delivery: "a few minutes",
        addParams: {
          chainName: "BNB Smart Chain Testnet",
          nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
          rpcUrls: ["https://bsc-testnet-rpc.publicnode.com"],
          blockExplorerUrls: ["https://testnet.bscscan.com"],
        },
      },
    ],
  },
};

export const TOKEN_DECIMALS = 18;
export const TOKEN_SYMBOL = "DACT";
export const CCIP_EXPLORER = "https://ccip.chain.link";
