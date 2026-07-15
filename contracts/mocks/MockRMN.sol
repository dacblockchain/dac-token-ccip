// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Risk Management Network mock that never curses anything.
contract MockRMN {
    function isCursed() external pure returns (bool) {
        return false;
    }

    function isCursed(bytes16) external pure returns (bool) {
        return false;
    }
}
