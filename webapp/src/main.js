import {
  AbiCoder,
  BrowserProvider,
  Contract,
  Interface,
  JsonRpcProvider,
  ZeroAddress,
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
} from "ethers";
import { CCIP_EXPLORER, ENVIRONMENTS, TOKEN_DECIMALS, TOKEN_SYMBOL } from "./config.js";
import { ERC20_ABI, ONRAMP_ABI, POOL_ABI, ROUTER_ABI } from "./abi.js";

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 20_000;
const DELIVERY_POLL_MS = 15_000;
// Placeholder receiver for fee quotes before a wallet is connected. The fee
// quoter rejects addresses in the precompile range, so it cannot be zero.
const QUOTE_RECEIVER = "0x000000000000000000000000000000000000dEaD";

// ---------- preferences (per-browser conveniences only) ----------

function loadPref(key, fallback) {
  try {
    return localStorage.getItem(`dact-bridge:${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}
function savePref(key, value) {
  try {
    if (value == null) localStorage.removeItem(`dact-bridge:${key}`);
    else localStorage.setItem(`dact-bridge:${key}`, value);
  } catch {
    /* storage unavailable: ignore */
  }
}

// ---------- state ----------

const state = {
  envKey: ENVIRONMENTS[loadPref("env", "mainnet")] ? loadPref("env", "mainnet") : "mainnet",
  reversed: loadPref("reversed", "0") === "1",
  wallet: null, // MetaMask EIP-1193 provider
  account: null,
  chainId: null,
  srcBalance: null,
  dstBalance: null,
  nativeBalance: null,
  allowance: null,
  available: undefined, // bigint, null = no rate limit, undefined = unknown
  fee: null,
  feeError: null,
  receiverIsContract: false,
  busy: null, // label of the running action
  error: null,
  tracking: null,
};

function route() {
  const [home, remote] = ENVIRONMENTS[state.envKey].chains;
  return state.reversed ? { src: remote, dst: home } : { src: home, dst: remote };
}

function chainByKey(key) {
  for (const env of Object.values(ENVIRONMENTS)) {
    const chain = env.chains.find((c) => c.key === key);
    if (chain) return chain;
  }
  return null;
}

const readers = {};
function reader(chain) {
  readers[chain.key] ??= new JsonRpcProvider(chain.rpc, chain.chainId, { staticNetwork: true });
  return readers[chain.key];
}

// ---------- formatting & parsing ----------

function fmt(value, dp = 4) {
  if (value == null) return "—";
  const [int, frac = ""] = formatUnits(value, TOKEN_DECIMALS).split(".");
  const shown = frac.slice(0, dp).replace(/0+$/, "");
  const intStr = BigInt(int).toLocaleString("en-US");
  if (!shown && dp > 0 && value > 0n && BigInt(int) === 0n) return `<0.${"0".repeat(dp - 1)}1`;
  return shown ? `${intStr}.${shown}` : intStr;
}

function short(addr) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function parseAmount(text) {
  const s = text.trim();
  if (!s || !/^\d*\.?\d*$/.test(s) || s === ".") return null;
  try {
    return parseUnits(s, TOKEN_DECIMALS);
  } catch {
    return null; // too many decimals
  }
}

function amount() {
  return parseAmount($("amount").value);
}

function customReceiver() {
  return $("receiver-box").open ? $("receiver").value.trim() : "";
}

// Returns the checksummed receiver, or null if the custom one is invalid.
function receiver() {
  const custom = customReceiver();
  if (custom) return isAddress(custom) ? getAddress(custom) : null;
  return state.account;
}

function buildMessage(to, value, token) {
  return {
    receiver: AbiCoder.defaultAbiCoder().encode(["address"], [to]),
    data: "0x",
    tokenAmounts: [{ token, amount: value }],
    feeToken: ZeroAddress, // pay the CCIP fee in the native coin
    extraArgs: "0x", // defaults; a token-only transfer needs no execution gas on destination
  };
}

// ---------- MetaMask ----------

function discoverMetaMask() {
  return new Promise((resolve) => {
    let found = null;
    const onAnnounce = (event) => {
      const { info, provider } = event.detail || {};
      if (info?.rdns?.startsWith("io.metamask")) found ??= provider;
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve(found || (window.ethereum?.isMetaMask ? window.ethereum : null));
    }, 400);
  });
}

async function connect() {
  const accounts = await state.wallet.request({ method: "eth_requestAccounts" });
  setAccount(accounts[0]);
}

function setAccount(account) {
  state.account = account ? getAddress(account) : null;
  state.srcBalance = state.dstBalance = state.nativeBalance = state.allowance = null;
  render();
  refresh();
  quoteFee();
}

async function ensureChain(chain) {
  if (state.chainId === chain.chainId) return;
  const chainId = `0x${chain.chainId.toString(16)}`;
  try {
    await state.wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (err) {
    const code = err?.code ?? err?.data?.originalError?.code;
    if (code !== 4902 || !chain.addParams) throw err;
    await state.wallet.request({ method: "wallet_addEthereumChain", params: [{ chainId, ...chain.addParams }] });
  }
  state.chainId = Number(await state.wallet.request({ method: "eth_chainId" }));
  if (state.chainId !== chain.chainId) throw new Error(`MetaMask is not on ${chain.name}.`);
}

async function signerFor(chain) {
  await ensureChain(chain);
  const provider = new BrowserProvider(state.wallet);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== chain.chainId) throw new Error(`MetaMask is not on ${chain.name}.`);
  return provider.getSigner(state.account);
}

async function watchAsset(chain) {
  await ensureChain(chain);
  await state.wallet.request({
    method: "wallet_watchAsset",
    params: { type: "ERC20", options: { address: chain.token, symbol: TOKEN_SYMBOL, decimals: TOKEN_DECIMALS } },
  });
}

// ---------- chain reads ----------

function enabledMin(...buckets) {
  const limits = buckets.filter((b) => b.isEnabled).map((b) => b.tokens);
  if (limits.length === 0) return null;
  return limits.reduce((a, b) => (a < b ? a : b));
}

let refreshGen = 0;
async function refresh() {
  const gen = ++refreshGen;
  const { src, dst } = route();
  const account = state.account;
  const srcToken = new Contract(src.token, ERC20_ABI, reader(src));
  const dstToken = new Contract(dst.token, ERC20_ABI, reader(dst));
  const srcPool = new Contract(src.pool, POOL_ABI, reader(src));
  const dstPool = new Contract(dst.pool, POOL_ABI, reader(dst));

  const [available, srcBalance, dstBalance, nativeBalance, allowance] = await Promise.allSettled([
    Promise.all([
      srcPool.getCurrentOutboundRateLimiterState(dst.chainSelector),
      dstPool.getCurrentInboundRateLimiterState(src.chainSelector),
    ]).then(([outbound, inbound]) => enabledMin(outbound, inbound)),
    account ? srcToken.balanceOf(account) : null,
    account ? dstToken.balanceOf(account) : null,
    account ? reader(src).getBalance(account) : null,
    account ? srcToken.allowance(account, src.router) : null,
  ]);
  if (gen !== refreshGen) return; // route or account changed meanwhile

  const value = (r, prev) => (r.status === "fulfilled" ? r.value : prev);
  state.available = value(available, state.available);
  state.srcBalance = value(srcBalance, state.srcBalance);
  state.dstBalance = value(dstBalance, state.dstBalance);
  state.nativeBalance = value(nativeBalance, state.nativeBalance);
  state.allowance = value(allowance, state.allowance);
  render();
}

let quoteTimer = null;
let quoteGen = 0;
function quoteFee() {
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(async () => {
    const gen = ++quoteGen;
    const { src, dst } = route();
    const to = receiver() || state.account || QUOTE_RECEIVER;
    const value = amount() || parseUnits("1", TOKEN_DECIMALS);
    const router = new Contract(src.router, ROUTER_ABI, reader(src));
    try {
      const fee = await router.getFee(dst.chainSelector, buildMessage(to, value, src.token));
      if (gen !== quoteGen) return;
      state.fee = fee;
      state.feeError = null;
    } catch (err) {
      if (gen !== quoteGen) return;
      state.fee = null;
      state.feeError = explain(err);
    }
    render();
  }, 300);
}

let receiverGen = 0;
async function checkReceiver() {
  const gen = ++receiverGen;
  const to = customReceiver() && receiver();
  state.receiverIsContract = false;
  if (to) {
    try {
      const code = await reader(route().dst).getCode(to);
      if (gen === receiverGen) state.receiverIsContract = code !== "0x";
    } catch {
      /* best-effort warning only */
    }
  }
  render();
}

// ---------- actions ----------

function explain(err) {
  const code = err?.code ?? err?.info?.error?.code;
  if (code === "ACTION_REJECTED" || code === 4001) return "Request rejected in MetaMask.";
  const revert = err?.revert;
  if (revert) {
    switch (revert.name) {
      case "TokenRateLimitReached":
        return `Bridge capacity reached: ${fmt(revert.args[1])} DACT available now. Send less or retry in about ${revert.args[0]} s.`;
      case "TokenMaxCapacityExceeded":
        return `Amount exceeds the bridge capacity of ${fmt(revert.args[0])} DACT per transfer.`;
      case "CursedByRMN":
        return "CCIP has temporarily paused this lane (Risk Management Network). Try again later.";
      case "InsufficientFeeTokenAmount":
        return "The CCIP fee changed. Try again.";
      default:
        return `Transaction would fail: ${revert.name}(${revert.args.join(", ")})`;
    }
  }
  if (code === "INSUFFICIENT_FUNDS") return "Not enough native coin to pay for gas and the CCIP fee.";
  return err?.shortMessage || err?.message || String(err);
}

async function run(label, fn) {
  state.busy = label;
  state.error = null;
  render();
  try {
    await fn();
  } catch (err) {
    console.error(err);
    state.error = explain(err);
  } finally {
    state.busy = null;
    render();
    refresh();
  }
}

async function approve() {
  const { src } = route();
  const value = amount();
  await run("Confirm the approval in MetaMask…", async () => {
    const signer = await signerFor(src);
    const token = new Contract(src.token, ERC20_ABI, signer);
    const tx = await token.approve(src.router, value);
    state.busy = "Waiting for the approval to confirm…";
    render();
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error("Approval transaction failed.");
    state.allowance = value;
  });
}

async function bridge() {
  const { src, dst } = route();
  const value = amount();
  const to = receiver();
  await run("Confirm the bridge transfer in MetaMask…", async () => {
    const signer = await signerFor(src);
    const router = new Contract(src.router, ROUTER_ABI, signer);
    const message = buildMessage(to, value, src.token);
    // Quote right before sending: any msg.value above the fee is kept by CCIP.
    const fee = await router.getFee(dst.chainSelector, message);
    const before = await new Contract(dst.token, ERC20_ABI, reader(dst)).balanceOf(to);

    const tx = await router.ccipSend(dst.chainSelector, message, { value: fee });
    startTracking({
      envKey: state.envKey,
      src: src.key,
      dst: dst.key,
      amount: value.toString(),
      receiver: to,
      before: before.toString(),
      hash: tx.hash,
      messageId: null,
      phase: "sent",
      startedAt: Date.now(),
    });
    $("amount").value = "";

    state.busy = "Waiting for the source transaction to confirm…";
    render();
    const receipt = await tx.wait();
    if (receipt.status !== 1) {
      updateTracking({ phase: "failed" });
      throw new Error("Bridge transaction failed on the source chain.");
    }
    updateTracking({ phase: "inflight", messageId: messageIdFrom(receipt) });
  });
}

const onRampIface = new Interface(ONRAMP_ABI);
function messageIdFrom(receipt) {
  for (const log of receipt.logs) {
    try {
      const parsed = onRampIface.parseLog(log);
      if (parsed?.name === "CCIPMessageSent") return parsed.args.message.header.messageId;
    } catch {
      /* not an on-ramp log */
    }
  }
  return null;
}

// ---------- delivery tracking ----------

let deliveryTimer = null;

function startTracking(t) {
  state.tracking = t;
  saveTracking();
  pollDelivery();
}

function updateTracking(patch) {
  if (!state.tracking) return;
  Object.assign(state.tracking, patch);
  saveTracking();
  render();
  pollDelivery();
}

function saveTracking() {
  savePref("tracking", state.tracking ? JSON.stringify(state.tracking) : null);
}

function restoreTracking() {
  try {
    const t = JSON.parse(loadPref("tracking", "null"));
    if (t && chainByKey(t.src) && chainByKey(t.dst)) state.tracking = t;
  } catch {
    /* ignore corrupt value */
  }
}

// Delivery is detected by the receiver's balance on the destination chain
// growing by the bridged amount. The CCIP Explorer link is the authoritative status.
function pollDelivery() {
  clearTimeout(deliveryTimer);
  const t = state.tracking;
  if (!t || t.phase === "delivered" || t.phase === "failed") return;
  deliveryTimer = setTimeout(async () => {
    const current = state.tracking;
    if (current !== t) return;
    try {
      if (t.phase === "sent") {
        // Page was reloaded before the source receipt arrived.
        const receipt = await reader(chainByKey(t.src)).getTransactionReceipt(t.hash);
        if (receipt) {
          if (receipt.status !== 1) return updateTracking({ phase: "failed" });
          return updateTracking({ phase: "inflight", messageId: messageIdFrom(receipt) });
        }
      } else {
        const dst = chainByKey(t.dst);
        const balance = await new Contract(dst.token, ERC20_ABI, reader(dst)).balanceOf(t.receiver);
        if (balance >= BigInt(t.before) + BigInt(t.amount)) {
          updateTracking({ phase: "delivered", deliveredAt: Date.now() });
          refresh();
          return;
        }
      }
    } catch (err) {
      console.warn("delivery poll failed", err);
    }
    pollDelivery();
  }, t.phase === "sent" ? 4000 : DELIVERY_POLL_MS);
}

// ---------- rendering ----------

function logo(el, chain) {
  const bnb = chain.key.startsWith("bsc");
  el.className = `chain-logo ${bnb ? "bnb" : "eth"}`;
  el.textContent = bnb ? "B" : "E";
}

function setAction(label, handler, hint = "") {
  const btn = $("action-btn");
  btn.textContent = label;
  btn.disabled = !handler;
  btn.onclick = handler;
  $("action-hint").textContent = hint;
}

function render() {
  const { src, dst } = route();
  const env = ENVIRONMENTS[state.envKey];
  const value = amount();
  const to = receiver();

  document.querySelectorAll("[data-env]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.env === state.envKey)));
  $("testnet-banner").hidden = state.envKey !== "testnet";

  const walletBtn = $("wallet-btn");
  if (!state.wallet) walletBtn.textContent = "Install MetaMask";
  else if (!state.account) walletBtn.textContent = "Connect MetaMask";
  else {
    const current = env.chains.find((c) => c.chainId === state.chainId);
    walletBtn.innerHTML = `<span class="dot-ok"></span>${short(state.account)}${current ? ` · ${current.name}` : ""}`;
  }

  logo($("src-logo"), src);
  logo($("dst-logo"), dst);
  $("src-name").textContent = src.name;
  $("dst-name").textContent = dst.name;
  $("src-balance").textContent = state.account ? `${fmt(state.srcBalance)} ${TOKEN_SYMBOL}` : "—";
  $("src-balance").disabled = state.srcBalance == null;
  $("dst-balance").textContent = state.account ? `${fmt(state.dstBalance)} ${TOKEN_SYMBOL}` : "—";
  $("receive-amount").textContent = value ? fmt(value, 6) : "0.0";
  $("flip-btn").disabled = !!state.busy;
  $("amount").disabled = !!state.busy;

  const receiverInput = $("receiver");
  receiverInput.setAttribute("aria-invalid", String(!!customReceiver() && !to));
  $("receiver-contract").hidden = !state.receiverIsContract;

  $("fee").textContent = state.fee != null ? `≈ ${fmt(state.fee, 6)} ${src.nativeSymbol}` : state.feeError ? "unavailable" : "…";
  $("fee").title = state.feeError || "";
  $("capacity").textContent =
    state.available === undefined ? "…" : state.available === null ? "no limit" : `${fmt(state.available, 0)} ${TOKEN_SYMBOL}`;
  $("delivery").textContent = src.delivery;
  $("native-balance").textContent = state.account ? `${fmt(state.nativeBalance, 5)} ${src.nativeSymbol}` : "—";

  const err = $("error");
  err.hidden = !state.error;
  err.textContent = state.error || "";

  // Primary action: the first unmet requirement decides what the button does.
  if (state.busy) setAction(state.busy, null);
  else if (!state.wallet) setAction("Install MetaMask", () => window.open("https://metamask.io/download/", "_blank"), "MetaMask was not detected in this browser.");
  else if (!state.account) setAction("Connect MetaMask", () => run("Connecting…", connect));
  else if (!value) setAction("Enter an amount", null);
  else if (state.srcBalance != null && value > state.srcBalance) setAction(`Insufficient ${TOKEN_SYMBOL} balance`, null);
  else if (state.available != null && value > state.available)
    setAction("Exceeds available bridge capacity", null, "Capacity refills continuously. Send less or retry later.");
  else if (!to) setAction("Invalid receiver address", null);
  else if (state.chainId !== src.chainId)
    setAction(`Switch MetaMask to ${src.name}`, () => run("Switching network…", () => ensureChain(src)));
  else if (state.fee != null && state.nativeBalance != null && state.nativeBalance < state.fee)
    setAction(`Not enough ${src.nativeSymbol} for the CCIP fee`, null);
  else if (state.allowance == null) setAction("Loading…", null);
  else if (state.allowance < value)
    setAction(`Approve ${fmt(value, 6)} ${TOKEN_SYMBOL}`, approve, "Step 1 of 2: allow the CCIP router to move your DACT.");
  else setAction(`Bridge to ${dst.name}`, bridge, `Sends the transfer. The CCIP fee is paid in ${src.nativeSymbol}.`);

  renderTracker();
}

function renderTracker() {
  const t = state.tracking;
  $("tracker").hidden = !t;
  if (!t) return;
  const src = chainByKey(t.src);
  const dst = chainByKey(t.dst);
  const order = ["sent", "inflight", "delivered"];
  const idx = order.indexOf(t.phase);

  $("tracker-summary").textContent = `${fmt(BigInt(t.amount), 6)} ${TOKEN_SYMBOL} · ${src.name} → ${dst.name} · to ${short(t.receiver)}`;

  const steps = [
    ["step-sent", 0],
    ["step-ccip", 1],
    ["step-done", 2],
  ];
  for (const [id, i] of steps) {
    const li = $(id);
    li.className = t.phase === "failed" ? (i === 0 ? "failed" : "") : i < idx || t.phase === "delivered" ? "done" : i === idx ? "active" : "";
  }
  $("step-sent-detail").innerHTML = `<a href="${src.explorer}/tx/${t.hash}" target="_blank" rel="noopener">${short(t.hash)} ↗</a>${
    t.phase === "failed" ? " · failed" : ""
  }`;
  $("step-ccip-detail").textContent = t.messageId ? `Message ${short(t.messageId)} · usually ${src.delivery}` : `Usually ${src.delivery}`;
  $("step-done-detail").textContent =
    t.phase === "delivered" ? `Arrived on ${dst.name}` : "Tokens arrive automatically; nothing to claim.";

  const link = $("track-link");
  link.href = t.messageId ? `${CCIP_EXPLORER}/msg/${t.messageId}` : `${CCIP_EXPLORER}/tx/${t.hash}`;
  $("watch-asset-btn").textContent = `Add ${TOKEN_SYMBOL} on ${dst.name} to MetaMask`;
  $("watch-asset-btn").hidden = !state.wallet;
}

function renderAddresses() {
  const html = ENVIRONMENTS[state.envKey].chains
    .map(
      (c) => `
      <div class="addr-chain"><span>${c.name}</span>${
        state.wallet ? `<button type="button" class="linklike" data-watch="${c.key}">Add to MetaMask</button>` : ""
      }</div>
      <div class="addr-row"><span>${TOKEN_SYMBOL} token</span><a href="${c.explorer}/token/${c.token}" target="_blank" rel="noopener">${short(c.token)}</a></div>
      <div class="addr-row"><span>Token pool</span><a href="${c.explorer}/address/${c.pool}" target="_blank" rel="noopener">${short(c.pool)}</a></div>
      <div class="addr-row"><span>CCIP router</span><a href="${c.explorer}/address/${c.router}" target="_blank" rel="noopener">${short(c.router)}</a></div>`,
    )
    .join("");
  $("address-list").innerHTML = html;
}

// ---------- wiring ----------

function onRouteChange() {
  state.srcBalance = state.dstBalance = state.nativeBalance = state.allowance = null;
  state.available = undefined;
  state.fee = null;
  state.feeError = null;
  state.error = null;
  render();
  renderAddresses();
  refresh();
  quoteFee();
  checkReceiver();
}

function bindEvents() {
  document.querySelectorAll("[data-env]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (state.busy || state.envKey === btn.dataset.env) return;
      state.envKey = btn.dataset.env;
      savePref("env", state.envKey);
      onRouteChange();
    }),
  );

  $("flip-btn").addEventListener("click", () => {
    state.reversed = !state.reversed;
    savePref("reversed", state.reversed ? "1" : "0");
    onRouteChange();
  });

  $("wallet-btn").addEventListener("click", () => {
    if (!state.wallet) window.open("https://metamask.io/download/", "_blank");
    else if (!state.account) run("Connecting…", connect);
  });

  $("amount").addEventListener("input", (e) => {
    // Accept a comma as decimal separator and drop anything else.
    const cleaned = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
    if (cleaned !== e.target.value) e.target.value = cleaned;
    state.error = null;
    render();
    quoteFee();
  });

  const setMax = () => {
    if (state.srcBalance == null) return;
    let max = state.srcBalance;
    if (state.available != null && state.available < max) max = state.available;
    $("amount").value = formatUnits(max, TOKEN_DECIMALS).replace(/\.0$/, "");
    render();
    quoteFee();
  };
  $("max-btn").addEventListener("click", setMax);
  $("src-balance").addEventListener("click", setMax);

  $("receiver").addEventListener("input", () => {
    render();
    quoteFee();
    checkReceiver();
  });
  $("receiver-box").addEventListener("toggle", () => {
    render();
    checkReceiver();
  });

  $("tracker-close").addEventListener("click", () => {
    clearTimeout(deliveryTimer);
    state.tracking = null;
    saveTracking();
    render();
  });
  $("watch-asset-btn").addEventListener("click", () => {
    const dst = chainByKey(state.tracking.dst);
    run("Adding token…", () => watchAsset(dst));
  });
  $("address-list").addEventListener("click", (e) => {
    const key = e.target.dataset?.watch;
    if (key) run("Adding token…", () => watchAsset(chainByKey(key)));
  });

  setInterval(() => {
    if (document.visibilityState === "visible" && !state.busy) {
      refresh();
      quoteFee();
    }
  }, REFRESH_MS);
}

async function init() {
  $("boot-error").remove();
  bindEvents();
  restoreTracking();
  render();
  renderAddresses();
  refresh();
  quoteFee();
  pollDelivery();

  state.wallet = await discoverMetaMask();
  if (!state.wallet) {
    render();
    renderAddresses();
    return;
  }
  state.wallet.on?.("accountsChanged", (accounts) => setAccount(accounts[0]));
  state.wallet.on?.("chainChanged", (chainId) => {
    state.chainId = Number(chainId);
    render();
  });
  state.chainId = Number(await state.wallet.request({ method: "eth_chainId" }));
  const accounts = await state.wallet.request({ method: "eth_accounts" }); // silent: no popup
  renderAddresses();
  setAccount(accounts[0]);
}

init();
