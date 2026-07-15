// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title Dac Token (DACT) — BNB Chain representation
/// @notice Cross-chain representation of the Dac Token deployed on Ethereum mainnet at
/// 0x0d9e0916eA60D5439F1535BEA4cB83b25780Eb36. Supply on this chain is minted and burned
/// exclusively by the CCIP BurnMintTokenPool: tokens are locked on Ethereum and minted
/// here, burned here and released on Ethereum. Implements the mint/burn interface
/// expected by CCIP token pools (IBurnMintERC20) plus getCCIPAdmin() for self-serve
/// registration in the CCIP TokenAdminRegistry.
contract DacToken is ERC20, ERC20Burnable, ERC20Permit, AccessControl {
    error MaxSupplyExceeded(uint256 supplyAfterMint);

    event CCIPAdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    /// @notice Mirrors the fixed total supply on Ethereum mainnet. Since every token
    /// minted here is backed by a token locked in the Ethereum pool, supply on this
    /// chain can never legitimately exceed it.
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18;

    address private s_ccipAdmin;

    constructor(address admin) ERC20("Dac Token", "DACT") ERC20Permit("Dac Token") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        s_ccipAdmin = admin;
    }

    /// @notice Mints tokens to `account`. Only callable by the CCIP token pool.
    function mint(address account, uint256 amount) external onlyRole(MINTER_ROLE) {
        uint256 supplyAfterMint = totalSupply() + amount;
        if (supplyAfterMint > MAX_SUPPLY) revert MaxSupplyExceeded(supplyAfterMint);
        _mint(account, amount);
    }

    /// @notice Burns tokens from the caller. Only callable by the CCIP token pool.
    function burn(uint256 amount) public override onlyRole(BURNER_ROLE) {
        super.burn(amount);
    }

    /// @notice IBurnMintERC20 variant: burns from `account` using the caller's allowance.
    function burn(address account, uint256 amount) public {
        burnFrom(account, amount);
    }

    /// @notice Burns tokens from `account` using the caller's allowance.
    function burnFrom(address account, uint256 amount) public override onlyRole(BURNER_ROLE) {
        super.burnFrom(account, amount);
    }

    /// @notice Grants both mint and burn roles to `burnAndMinter` (the token pool).
    /// @dev Calls grantRole, which enforces that the caller holds DEFAULT_ADMIN_ROLE.
    function grantMintAndBurnRoles(address burnAndMinter) external {
        grantRole(MINTER_ROLE, burnAndMinter);
        grantRole(BURNER_ROLE, burnAndMinter);
    }

    /// @notice The address allowed to register this token in the CCIP TokenAdminRegistry.
    function getCCIPAdmin() external view returns (address) {
        return s_ccipAdmin;
    }

    function setCCIPAdmin(address newAdmin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address previousAdmin = s_ccipAdmin;
        s_ccipAdmin = newAdmin;
        emit CCIPAdminTransferred(previousAdmin, newAdmin);
    }
}
