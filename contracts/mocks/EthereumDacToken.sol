// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Replica of the Dac Token deployed on Ethereum mainnet
/// (0x0d9e0916eA60D5439F1535BEA4cB83b25780Eb36). Used in tests and for testnet
/// rehearsals of the lock/release side of the bridge.
contract EthereumDacToken is ERC20, ERC20Permit, Ownable {
    constructor(address recipient, address initialOwner)
        ERC20("Dac Token", "DACT")
        ERC20Permit("Dac Token")
        Ownable(initialOwner)
    {
        _mint(recipient, 1000000000 * 10 ** decimals());
    }
}
