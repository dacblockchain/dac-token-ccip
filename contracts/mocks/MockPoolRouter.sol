// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal stand-in for the CCIP Router, exposing only what TokenPool
/// consults for ramp authorization. Lets tests act as onRamp/offRamp directly.
contract MockPoolRouter {
    mapping(uint64 => address) internal s_onRamps;
    mapping(uint64 => mapping(address => bool)) internal s_offRamps;

    function setOnRamp(uint64 destChainSelector, address onRamp) external {
        s_onRamps[destChainSelector] = onRamp;
    }

    function setOffRamp(uint64 sourceChainSelector, address offRamp, bool enabled) external {
        s_offRamps[sourceChainSelector][offRamp] = enabled;
    }

    function getOnRamp(uint64 destChainSelector) external view returns (address) {
        return s_onRamps[destChainSelector];
    }

    function isOffRamp(uint64 sourceChainSelector, address offRamp) external view returns (bool) {
        return s_offRamps[sourceChainSelector][offRamp];
    }
}
