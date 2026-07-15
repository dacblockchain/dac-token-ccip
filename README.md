# DACT CCIP Bridge, Ethereum - BNB Chain

Bridges **Dac Token (DACT)** from Ethereum mainnet to BNB Smart Chain using
[Chainlink CCIP](https://docs.chain.link/ccip)'s self-serve **Cross-Chain Token (CCT)** standard.

## Architecture

The canonical DACT has a fixed 1B supply and no mint function, so the home chain
uses **lock/release** and the destination chain uses **burn/mint**:

![DACT bridge architecture](docs/architecture.svg)

- **Ethereum → BSC**: DACT locked in the Ethereum pool, equal amount minted on BSC.
- **BSC → Ethereum**: DACT burned on BSC, equal amount released from the Ethereum pool.
- The BSC token ([contracts/DacToken.sol](contracts/DacToken.sol)) mirrors the canonical
  metadata (name/symbol/decimals, ERC20Permit) and hard-caps supply at 1B. Mint/burn is
  restricted by AccessControl roles held only by the pool.
- Pools are Chainlink's audited `LockReleaseTokenPool` / `BurnMintTokenPool`
  (`@chainlink/contracts-ccip` 1.6.4), deployed as-is — this repo adds no custom pool logic.

## Layout

| Path | Purpose |
| --- | --- |
| `contracts/DacToken.sol` | Burn/mint DACT representation for BNB Chain |
| `contracts/CCIPImports.sol` | Pulls Chainlink pool/registry artifacts into the build |
| `contracts/mocks/` | Mainnet-token replica + router/RMN mocks (tests & testnet rehearsal) |
| `config/networks.js` | CCIP routers, chain selectors, registries per network |
| `scripts/01…06_*.js` | Step-by-step deployment, registration, and bridging |
| `test/` | Token unit tests + end-to-end pool mechanics tests |

## Setup

```bash
npm install        # postinstall symlinks the Foundry-style OZ aliases for Hardhat
npx hardhat test
```

Copy `.env.example` to `.env` and fill in RPC URLs, the deployer key, and an Etherscan v2 API key.

## Deployment

Run each script with `npx hardhat run scripts/<script> --network <network>`.
Deployed addresses are recorded in `deployments/<network>.json` (committed —
step 5 reads the *other* chain's file).

| # | Script | Ethereum (`--network mainnet`) | BNB Chain (`--network bsc`) |
| --- | --- | --- | --- |
| 1 | `01_deploy_token.js` | — (canonical token exists) | Deploy burn/mint DacToken |
| 2 | `02_deploy_pool.js` | Deploy LockReleaseTokenPool | Deploy BurnMintTokenPool |
| 3 | `03_claim_admin.js` | run as **token owner** (`0x1A5C…0E11`) | run as token's CCIP admin |
| 4 | `04_accept_admin_and_set_pool.js` | accept + setPool | accept + setPool + grant pool mint/burn |
| 5 | `05_apply_chain_updates.js` | wire to BSC pool + rate limits | wire to Ethereum pool + rate limits |
| 6 | `06_bridge_tokens.js` | `AMOUNT=… RECEIVER=…` bridge out | bridge back |

Steps 3–4 use CCIP's permissionless registration: `RegistryModuleOwnerCustom`
proves token ownership on-chain, then `TokenAdminRegistry` links token → pool.
No Chainlink approval is required for the standard flow.

**Rehearse on testnets first** with the same sequence on `--network sepolia` /
`--network bscTestnet` (step 1 on Sepolia deploys a replica of the canonical token).

### Rate limits

`05_apply_chain_updates.js` defaults to a **100,000 DACT bucket refilling over ~1 hour**
in each direction (`RATE_LIMIT_CAPACITY`, `RATE_LIMIT_RATE`, `RATE_LIMITS_ENABLED` to change).

### Verify contracts

```bash
npx hardhat verify --network bsc <token> <admin>
npx hardhat verify --network bsc <pool> <token> 18 [] <rmnProxy> <router>   # constructor args via file if needed
```

## Bridging as an end user

Users don't need this repo: once registered, DACT appears in any CCIP-enabled UI
(e.g. [Transporter](https://app.transporter.io)) and wallets can call
`ccipSend` on the router directly. `scripts/06_bridge_tokens.js` does exactly that:
approve the router, quote `getFee` (native gas or LINK), send, then track the
message at `https://ccip.chain.link/msg/<messageId>`.

## Testing

`test/Bridge.e2e.test.js` deploys both real Chainlink pools locally with minimal
router/RMN mocks and drives the exact `lockOrBurn`/`releaseOrMint` flows the CCIP
ramps execute, including negative cases (unauthorized ramps, spoofed source pool,
unconfigured chains, rate-limit breach).

```bash
npx hardhat test
```

## Security notes

- Rate limits bound the damage of any single incident;
- `config/networks.js` addresses were taken from Chainlink's published registry —
  re-verify against the [CCIP Directory](https://docs.chain.link/ccip/directory)
  before mainnet transactions.
