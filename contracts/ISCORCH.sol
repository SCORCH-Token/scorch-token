// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ISCORCH
 * @dev Interface for the SCORCH token contract.
 * It exposes the minting functionality required by the Presale, Salaries, and Airdrop contracts.
 */
interface ISCORCH is IERC20 {
    function mint(address to, uint256 amount) external;
}
