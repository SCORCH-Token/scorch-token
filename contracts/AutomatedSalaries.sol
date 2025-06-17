// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./SafeMath.sol";
import "./ISCORCH.sol";


/**
 * @title AutomatedSalaries
 * @author Scorch Team
 * @notice This contract handles automated, tiered monthly salary distributions.
 * It is designed to be called by a keeper service (like Gelato) or a trusted backend.
 * It uses a gradual minting model, where the SCORCH token contract has granted
 * this contract the MINTER_ROLE.
 *
 * It relies on OpenZeppelin for security (Ownable, ReentrancyGuard) and standards.
 * The owner should be a Multi-Sig wallet.
 */
contract AutomatedSalaries is Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    // ============== STATE VARIABLES ==============
    ISCORCH public immutable scorchToken;

    struct Tier {
        uint256 salaryAmount; // Monthly salary in SCORCH (with 18 decimals)
        bool isActive;
    }

    struct Contributor {
        uint8 tierId;
        bool isActive;
    }

    mapping(uint8 => Tier) public tiers;
    mapping(address => Contributor) public contributors;
    mapping(address => uint256) public lastPaymentTimestamp;

    uint256 public constant PAYMENT_INTERVAL = 30 days;

    // ============== EVENTS ==============
    event TierAdded(uint8 indexed tierId, uint256 salaryAmount);
    event TierUpdated(uint8 indexed tierId, uint256 newSalaryAmount, bool isActive);
    event ContributorAdded(address indexed contributor, uint8 indexed tierId);
    event ContributorUpdated(address indexed contributor, uint8 newTierId, bool isActive);
    event SalaryDistributed(address indexed contributor, uint256 amount);


    // ============== CONSTRUCTOR ==============
    constructor(address _scorchToken) Ownable(msg.sender) {
        require(_scorchToken != address(0), "Salaries: Zero address for token");
        scorchToken = ISCORCH(_scorchToken);
    }


    // ============== ADMIN FUNCTIONS ==============
    function addTier(uint8 _tierId, uint256 _salary) external onlyOwner {
        require(!tiers[_tierId].isActive, "Salaries: Tier already exists");
        tiers[_tierId] = Tier({ salaryAmount: _salary, isActive: true });
        emit TierAdded(_tierId, _salary);
    }

    function updateTier(uint8 _tierId, uint256 _newSalary, bool _isActive) external onlyOwner {
        require(tiers[_tierId].isActive, "Salaries: Tier does not exist");
        tiers[_tierId] = Tier({ salaryAmount: _newSalary, isActive: _isActive });
        emit TierUpdated(_tierId, _newSalary, _isActive);
    }

    function addContributor(address _contributor, uint8 _tierId) external onlyOwner {
        require(_contributor != address(0), "Salaries: Zero address for contributor");
        require(tiers[_tierId].isActive, "Salaries: Tier is not active");
        contributors[_contributor] = Contributor({ tierId: _tierId, isActive: true });
        emit ContributorAdded(_contributor, _tierId);
    }

    function updateContributor(address _contributor, uint8 _newTierId, bool _isActive) external onlyOwner {
        require(contributors[_contributor].tierId != 0, "Salaries: Contributor does not exist");
        if (_newTierId != 0) {
            require(tiers[_newTierId].isActive, "Salaries: New tier is not active");
            contributors[_contributor].tierId = _newTierId;
        }
        contributors[_contributor].isActive = _isActive;
        emit ContributorUpdated(_contributor, _newTierId, _isActive);
    }


    // ============== PUBLIC DISTRIBUTION FUNCTIONS ==============
    function distributeSalary(address _contributor) external nonReentrant {
        _distribute(_contributor);
    }

    function distributeSalariesBatch(address[] calldata _contributors) external nonReentrant {
        for(uint i = 0; i < _contributors.length; i++) {
            _distribute(_contributors[i]);
        }
    }


    // ============== INTERNAL FUNCTIONS ==============
    function _distribute(address _contributor) internal {
        Contributor storage c = contributors[_contributor];
        require(c.isActive, "Salaries: Contributor is not active");
        require(block.timestamp >= lastPaymentTimestamp[_contributor] + PAYMENT_INTERVAL, "Salaries: Payment interval not reached");

        Tier storage t = tiers[c.tierId];
        require(t.isActive, "Salaries: Contributor's tier is not active");

        uint256 paymentAmount = t.salaryAmount;
        require(paymentAmount > 0, "Salaries: Payment amount is zero");

        lastPaymentTimestamp[_contributor] = block.timestamp;
        scorchToken.mint(_contributor, paymentAmount);

        emit SalaryDistributed(_contributor, paymentAmount);
    }
}
