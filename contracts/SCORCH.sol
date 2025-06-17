// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./SafeMath.sol";

contract SCORCH is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    using SafeMath for uint256;

    uint256 public constant MAX_SUPPLY = 15_000_000_000 * (10 ** 18); // 15 billion tokens
    uint256 public constant BURN_TAX_NUMERATOR = 1; // Represents 1%
    uint256 public constant BURN_TAX_DENOMINATOR = 100;

    event TokensBurnedWithTax(
        address indexed from,
        address indexed to,
        uint256 valueTransferred,
        uint256 taxAmountBurned
    );

    /**
     * @dev Sets the values for {name}, {symbol}, and grants {DEFAULT_ADMIN_ROLE}
     * to the `initialAdmin` address.
     * @param initialAdmin The address to be granted the default admin role.
     */
    constructor(address initialAdmin) ERC20("SCORCH", "SCORCH") {
        // Token name from whitepaper
        require(
            initialAdmin != address(0),
            "SCORCH: Initial admin cannot be the zero address"
        );
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        // (presale, staking, salaries) as needed.
    }

    /**
     * @dev Creates `amount` new tokens for `to`.
     * Requirements:
     * - The `_msgSender()` must have the `MINTER_ROLE`.
     * - Minting cannot exceed `MAX_SUPPLY`.
     * Emits a {Transfer} event with `from` set to the zero address.
     * This function facilitates the gradual minting approach.
     */
    function mint(address to, uint256 amount) public virtual {
        require(
            hasRole(MINTER_ROLE, _msgSender()),
            "SCORCH: Caller is not a minter"
        );
        require(
            totalSupply() + amount <= MAX_SUPPLY,
            "SCORCH: Minting would exceed max supply"
        );
        _mint(to, amount);
    }

    /**
     * @dev See {ERC20-_update}.
     * Overridden to include the 1% burn tax mechanism on transfers.
     * Minting operations (where `from` is `address(0)`) are excluded from the tax.
     * The tax is calculated on the `value` being transferred. The sender must have
     * sufficient balance to cover both the `value` and the `taxAmount`.
     * The `taxAmount` is burned from the sender's balance, reducing total supply.
     * The recipient receives the original `value`.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        // Exclude minting and burning from tax
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }

        uint256 taxAmount = 0;
        if (value > 0) {
            // Calculate tax as 1% of the transfer amount
            taxAmount = value.mul(BURN_TAX_NUMERATOR).div(BURN_TAX_DENOMINATOR);
        }

        if (taxAmount > 0) {
            // Ensure the sender has enough balance for the transfer amount plus the tax
            require(
                balanceOf(from) >= value.add(taxAmount),
                "SCORCH: Balance too low for transfer and tax"
            );

            // Burn the tax amount from the sender
            _burn(from, taxAmount);

            // Transfer the full amount to the recipient
            super._update(from, to, value);

            emit TokensBurnedWithTax(from, to, value, taxAmount);
        } else {
            // If no tax, just do the normal transfer
            super._update(from, to, value);
        }
    }

    function addMinter(address account) public virtual {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "SCORCH: Caller is not an admin"
        );
        grantRole(MINTER_ROLE, account);
    }

    function removeMinter(address account) public virtual {
        require(
            hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "SCORCH: Caller is not an admin"
        );
        revokeRole(MINTER_ROLE, account);
    }

    function isMinter(address account) public view returns (bool) {
        return hasRole(MINTER_ROLE, account);
    }
}
