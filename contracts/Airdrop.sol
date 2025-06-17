// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./SafeMath.sol";
import "./ISCORCH.sol";


/**
 * @title Airdrop
 * @author Scorch Team
 * @notice This contract provides a flexible system for airdropping SCORCH tokens.
 * It supports batch distributions for efficiency and can be used for various reward
 * programs, such as rewarding early presale participants or specific community members.
 * It requires the MINTER_ROLE on the SCORCH token contract.
 *
 * It relies on OpenZeppelin for security (Ownable, ReentrancyGuard) and standards.
 * The owner should be a Multi-Sig wallet.
 */
contract Airdrop is Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    ISCORCH public immutable scorchToken;

    mapping(uint256 => mapping(address => bool)) public isAirdropped;

    // ============== EVENTS ==============
    event AirdropDistributed(address[] recipients, uint256[] amounts);
    event AirdropStatusReset(uint256 indexed campaignId, address[] recipients);


    // ============== CONSTRUCTOR ==============
    constructor(address _scorchToken) Ownable(msg.sender) {
        require(_scorchToken != address(0), "Airdrop: Zero address for token");
        scorchToken = ISCORCH(_scorchToken);
    }


    // ============== PUBLIC AIRDROP FUNCTIONS ==============
    function airdropBatch(address[] calldata _recipients, uint256[] calldata _amounts) external onlyOwner nonReentrant {
        require(_recipients.length == _amounts.length, "Airdrop: Array lengths must match");

        for (uint i = 0; i < _recipients.length; i++) {
            require(_recipients[i] != address(0), "Airdrop: Cannot airdrop to zero address");
            if (_amounts[i] > 0) {
                scorchToken.mint(_recipients[i], _amounts[i]);
            }
        }

        emit AirdropDistributed(_recipients, _amounts);
    }

    function airdropFromSnapshot(uint256 _campaignId, address[] calldata _recipients, uint256 _amount) external onlyOwner nonReentrant {
        require(_amount > 0, "Airdrop: Amount must be greater than zero");
        uint256[] memory amounts = new uint256[](_recipients.length);

        for (uint i = 0; i < _recipients.length; i++) {
            require(!isAirdropped[_campaignId][_recipients[i]], "Airdrop: Recipient already claimed");
            isAirdropped[_campaignId][_recipients[i]] = true;
            scorchToken.mint(_recipients[i], _amount);
            amounts[i] = _amount;
        }

        emit AirdropDistributed(_recipients, amounts);
    }


    // ============== ADMIN FUNCTIONS ==============
    function resetAirdropStatus(uint256 _campaignId, address[] calldata _recipients) external onlyOwner {
        for (uint i = 0; i < _recipients.length; i++) {
            isAirdropped[_campaignId][_recipients[i]] = false;
        }
        emit AirdropStatusReset(_campaignId, _recipients);
    }

    function withdrawStuckTokens(address _tokenAddress) external onlyOwner {
        require(_tokenAddress != address(scorchToken), "Airdrop: Cannot withdraw SCORCH token");
        IERC20 token = IERC20(_tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "Airdrop: No tokens to withdraw");
        token.transfer(owner(), balance);
    }
}
