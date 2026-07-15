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

## Testnet deployment (Sepolia ↔ BSC Testnet)

The full sequence was rehearsed on 2026-07-15 and verified in both directions.
Addresses are recorded in `deployments/sepolia.json` / `deployments/bscTestnet.json`:

| Contract | Sepolia | BSC Testnet |
| --- | --- | --- |
| DACT token | [`0x9D1C…Ad2A`](https://sepolia.etherscan.io/address/0x9D1C28CC64409E15d7c0b80De4D0a7692095Ad2A) (canonical replica) | [`0x9D1C…Ad2A`](https://testnet.bscscan.com/address/0x9D1C28CC64409E15d7c0b80De4D0a7692095Ad2A) (burn/mint) |
| Token pool | [`0xdE61…99B7`](https://sepolia.etherscan.io/address/0xdE61BAE56E79306B0b42Bf3297F3c138347099B7) (LockRelease) | [`0xdE61…99B7`](https://testnet.bscscan.com/address/0xdE61BAE56E79306B0b42Bf3297F3c138347099B7) (BurnMint) |

Round-trip bridge test (100 DACT, default rate limits):

- **Sepolia → BSC Testnet** (lock + mint, delivered in ~14 min — CCIP waits for
  Ethereum finality): [CCIP message](https://ccip.chain.link/msg/0x4e4810247905eea661835ce22603fcafb441465786c65696daf566544842eaf8)
- **BSC Testnet → Sepolia** (burn + release, delivered in ~1 min): [CCIP message](https://ccip.chain.link/msg/0xf30106e7f4da771faef88748cbb25197f944a377f4ffe37cafa9f02b29862ffb)

Both legs settled exactly: pool balance and BSC total supply returned to zero
after the round trip.

### Using the testnet bridge

With a funded testnet key in `.env` (Sepolia ETH / tBNB for gas — fees are paid
in native by default), bridge with:

```bash
# Sepolia -> BSC Testnet
AMOUNT=100 RECEIVER=0x... npx hardhat run scripts/06_bridge_tokens.js --network sepolia

# BSC Testnet -> Sepolia
AMOUNT=100 RECEIVER=0x... npx hardhat run scripts/06_bridge_tokens.js --network bscTestnet
```

The script approves the router, quotes `getFee`, sends via `ccipSend`, and prints
a `https://ccip.chain.link/msg/<messageId>` link to track delivery. The sender
needs testnet DACT: on Sepolia the replica's 1B supply was minted to the rehearsal
deployer, so either bridge from that account or have it transfer you some first.

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
