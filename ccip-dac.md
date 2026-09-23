I fixed the blocker in [config/networks.js](config/networks.js): the Ethereum entry is now named `mainnet` to match Hardhat, and BSC's `remote` points at it. All 17 tests pass. Here is the full launch sequence, based on what the scripts do and what I checked on chain.

## What I confirmed on chain
- **Chainlink contracts:** the router, the emergency-pause proxy (RMN), the token registry and the registration module all have code on both mainnets. The Ethereum ↔ BSC lane is supported, and the pause is not active.
- **DACT on Ethereum:** `owner()` is `0x1A5C…0E11`, a regular wallet (EOA) holding 0.11 ETH, which is enough for its two steps. DACT isn't registered with CCIP yet.
- **Deployer `0x88bA…DE13`:** holds **0 ETH and 0.002 BNB**. It needs funding before you start.

## 0. Before you start
1. **Create a Safe multisig on each chain.** At the end, all admin rights move to it. This matters because:
   - The Ethereum pool's owner can appoint a "rebalancer" that can withdraw every locked DACT.
   - The BSC token's admin can let any address mint up to 1B unbacked DACT.
   - A single hot key must not hold either power.
2. **Choose rate limits.** The default is 100,000 DACT per hour, applied in both directions. Set `RATE_LIMIT_CAPACITY` (and `RATE_LIMIT_RATE` if you want a different refill speed) in `.env` to match real demand. Chainlink recommends setting the incoming limit a little above the other side's outgoing limit. The script uses one value for both, so if you want that margin, tell me and I'll add a separate setting.
3. **Set your own RPC endpoints.** Put `MAINNET_RPC_URL` and `BSC_RPC_URL` in `.env` (Alchemy, Infura or similar). The default Ethereum endpoint returned errors when I tried it.
4. **Fund the deployer** with about 0.02 ETH and about 0.02 BNB. Gas is cheap right now (about 0.37 gwei on Ethereum), so that leaves plenty of margin.
5. **Handle the owner key with care.** Steps 3 and 4 on Ethereum must be signed by the token owner's key. Don't write it into `.env`. Enter it at the prompt instead, so it stays out of files and shell history:
   ```bash
   read -rs OWNER_KEY   # paste the key; nothing is echoed
   ```
   dotenv doesn't overwrite variables that are already set, so `DEPLOYER_PRIVATE_KEY=$OWNER_KEY npx hardhat …` uses the owner key for that one command only.

## 1. BSC: deploy the token and pool (deployer key)
```bash
npx hardhat run scripts/01_deploy_token.js --network bsc
npx hardhat run scripts/02_deploy_pool.js --network bsc
npx hardhat run scripts/03_claim_admin.js --network bsc
npx hardhat run scripts/04_accept_admin_and_set_pool.js --network bsc
```
Leave `TOKEN_ADMIN` empty. The deployer has to be the token's admin for steps 03 and 04 to work, and you move admin to the Safe in step 5.

## 2. Ethereum: deploy the pool and register it
```bash
npx hardhat run scripts/02_deploy_pool.js --network mainnet                                          # deployer
DEPLOYER_PRIVATE_KEY=$OWNER_KEY npx hardhat run scripts/03_claim_admin.js --network mainnet           # token owner
DEPLOYER_PRIVATE_KEY=$OWNER_KEY npx hardhat run scripts/04_accept_admin_and_set_pool.js --network mainnet  # token owner
```
Skip step 01 here, because the real token already exists.

## 3. Connect the two pools (deployer key; it owns both pools)
```bash
npx hardhat run scripts/05_apply_chain_updates.js --network bsc
npx hardhat run scripts/05_apply_chain_updates.js --network mainnet
```
Commit `deployments/mainnet.json` and `deployments/bsc.json` afterwards.

## 4. Verify the contracts and test with a small amount
- **Verify the BSC token:**
  ```bash
  npx hardhat verify --network bsc <bscToken> <deployerAddress>
  ```
- **Verify each pool:** the empty allowlist argument doesn't parse on the command line, so use an arguments file. Create `args.js` containing `module.exports = ["<token>", 18, [], "<rmnProxy>", "<router>"]`, then run:
  ```bash
  npx hardhat verify --network <net> --constructor-args args.js <pool>
  ```
- **Test with a small amount:**
  - Using a wallet that holds DACT, send about 10 DACT from Ethereum to BSC with `06_bridge_tokens.js --network mainnet`.
  - Wait roughly 15–20 minutes, then send it back with `--network bsc`.
  - Confirm the Ethereum pool's balance and BSC's total supply both return to 0.

## 5. Hand everything over to the Safes
There's no script for this yet:

| Contract | Current holder calls | Safe then calls |
| --- | --- | --- |
| Both pools | `transferOwnership(safe)` (deployer) | `acceptOwnership()` |
| TokenAdminRegistry, BSC | `transferAdminRole(token, safe)` (deployer) | `acceptAdminRole(token)` |
| TokenAdminRegistry, Ethereum | `transferAdminRole(token, safe)` (token owner) | `acceptAdminRole(token)` |
| BSC DacToken | `grantRole(DEFAULT_ADMIN_ROLE, safe)`, `setCCIPAdmin(safe)`, then `renounceRole(DEFAULT_ADMIN_ROLE, deployer)` | nothing |

On the BSC token, renounce last. If you renounce before granting the Safe admin, nobody can ever manage the token again.

## 6. After launch
- Publish the official BSC DACT address.
- Submit DACT to Chainlink so it appears in the CCIP Directory and on Transporter.
- Set up trading on BSC (for example a DEX liquidity pool).
- Point the bridge widget from earlier at mainnet.

I can write a `07_transfer_ownership.js` script for step 5, so the handover is scripted instead of done by hand. The rename isn't committed yet.
