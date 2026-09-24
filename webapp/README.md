# DACT Bridge web app

A local web page for bridging DACT between Ethereum and BNB Chain with MetaMask.
It uses the same CCIP router calls as [`../scripts/06_bridge_tokens.js`](../scripts/06_bridge_tokens.js):
`approve` on the token, then `getFee` and `ccipSend` on the router, paying the fee in ETH or BNB.

## Run

```bash
cd webapp
npm install
npm run dev        # http://localhost:5173
```

Open the page in a browser with the MetaMask extension installed.

## Use

1. Connect MetaMask. Pick **Mainnet** or **Testnet** (Sepolia ↔ BSC Testnet) at the top.
2. Choose the direction with the ↓↑ button, then enter an amount.
3. The button walks you through each step. It asks MetaMask to switch to (or add) the source
   chain, then asks for an **Approve** transaction and then a **Bridge** transaction.
4. The Transfer card tracks delivery. It links to the source transaction and to the CCIP
   Explorer, and marks the transfer delivered once the receiver's DACT balance on the
   destination chain goes up by the bridged amount. It keeps tracking if you reload the page.

Before you send, the page shows the CCIP fee, the rate-limit capacity currently available
(the smaller of the source pool's outbound and the destination pool's inbound limits), and your gas balance.
It disables the Bridge button if the amount exceeds your balance or the capacity.

## Configuration

Addresses live in [`src/config.js`](src/config.js) and mirror `../config/networks.js` and
`../deployments/`. Read calls go to public RPCs. To use your own, copy `.env.example` to
`.env.local` and set the `VITE_*_RPC_URL` values. Every `VITE_*` variable is bundled into the page,
so never put keys there. The app never reads the repository's root `.env`.
