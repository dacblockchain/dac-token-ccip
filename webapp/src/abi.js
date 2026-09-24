// Minimal human-readable ABIs. Custom errors are included so ethers can decode
// reverts that bubble up from the router, on-ramp, fee quoter and token pool.

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const MESSAGE = "(bytes receiver, bytes data, (address token, uint256 amount)[] tokenAmounts, address feeToken, bytes extraArgs)";

const CCIP_ERRORS = [
  "error InsufficientFeeTokenAmount()",
  "error InvalidMsgValue()",
  "error UnsupportedDestinationChain(uint64 destChainSelector)",
  "error CannotSendZeroTokens()",
  "error CursedByRMN()",
  "error SenderNotAllowed(address sender)",
  "error UnsupportedToken(address token)",
  "error DestinationChainNotEnabled(uint64 destChainSelector)",
  "error TokenNotSupported(address token)",
  "error StaleGasPrice(uint64 destChainSelector, uint256 threshold, uint256 timePassed)",
  "error MessageFeeTooHigh(uint256 msgFeeJuels, uint256 maxFeeJuelsPerMsg)",
  "error ChainNotAllowed(uint64 remoteChainSelector)",
  "error TokenMaxCapacityExceeded(uint256 capacity, uint256 requested, address tokenAddress)",
  "error TokenRateLimitReached(uint256 minWaitInSeconds, uint256 available, address tokenAddress)",
  "error InsufficientLiquidity()",
];

export const ROUTER_ABI = [
  `function getFee(uint64 destinationChainSelector, ${MESSAGE} message) view returns (uint256)`,
  `function ccipSend(uint64 destinationChainSelector, ${MESSAGE} message) payable returns (bytes32)`,
  ...CCIP_ERRORS,
];

const BUCKET = "(uint128 tokens, uint32 lastUpdated, bool isEnabled, uint128 capacity, uint128 rate)";

export const POOL_ABI = [
  `function getCurrentOutboundRateLimiterState(uint64 remoteChainSelector) view returns (${BUCKET})`,
  `function getCurrentInboundRateLimiterState(uint64 remoteChainSelector) view returns (${BUCKET})`,
];

// Emitted by the 1.6 OnRamp; used to read the CCIP message id from the receipt.
export const ONRAMP_ABI = [
  "event CCIPMessageSent(uint64 indexed destChainSelector, uint64 indexed sequenceNumber, ((bytes32 messageId, uint64 sourceChainSelector, uint64 destChainSelector, uint64 sequenceNumber, uint64 nonce) header, address sender, bytes data, bytes receiver, bytes extraArgs, address feeToken, uint256 feeTokenAmount, uint256 feeValueJuels, (address sourcePoolAddress, bytes destTokenAddress, bytes extraData, uint256 amount, bytes destExecData)[] tokenAmounts) message)",
];
