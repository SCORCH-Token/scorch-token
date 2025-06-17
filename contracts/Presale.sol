// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./SafeMath.sol";

interface IBridgeableERC20 {
    function withdrawStart(uint256 amount) external;
}

interface ISCORCH is IERC20 {
    function mint(address to, uint256 amount) external;
}

contract Presale is Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    ISCORCH public immutable scorchToken;
    IBridgeableERC20 public immutable bridgedShib;
    IERC20 public immutable usdcToken;
    address public immutable operationsWallet;

    struct Phase {
        uint256 price;
        uint256 tokensAvailable;
        uint256 sold;
    }
    Phase[] public phases;
    uint256 public currentPhase;

    struct VestingInfo { uint256 totalAmount; uint256 claimedAmount; }
    mapping(address => VestingInfo) public userVesting;
    uint256 public vestingStartTime;
    uint256 public constant VESTING_TOTAL = 365 days;
    uint256 public constant VESTING_CLIFF = 90 days;

    event TokensPurchased(address indexed user, uint256 scorchAmount, uint256 phase);
    event SHIBBurnInitiated(address indexed user, uint256 amountBurned, uint256 timestamp);
    event TokensClaimed(address indexed user, uint256 amount);
    event PresaleStarted(uint256 startTime);

    constructor(
        address _scorch,
        address _bridgedShib,
        address _usdc,
        address _opsWallet
    ) Ownable(msg.sender) {
        scorchToken = ISCORCH(_scorch);
        bridgedShib = IBridgeableERC20(_bridgedShib);
        usdcToken = IERC20(_usdc);
        operationsWallet = _opsWallet;

        phases.push(Phase({price: 1000, tokensAvailable: 500_000_000 ether, sold: 0}));
        phases.push(Phase({price: 2000, tokensAvailable: 400_000_000 ether, sold: 0}));
        phases.push(Phase({price: 3000, tokensAvailable: 300_000_000 ether, sold: 0}));
        phases.push(Phase({price: 4000, tokensAvailable: 250_000_000 ether, sold: 0}));
        phases.push(Phase({price: 5000, tokensAvailable: 200_000_000 ether, sold: 0}));
        phases.push(Phase({price: 6000, tokensAvailable: 150_000_000 ether, sold: 0}));
        phases.push(Phase({price: 7000, tokensAvailable: 100_000_000 ether, sold: 0}));
        phases.push(Phase({price: 8000, tokensAvailable: 50_000_000 ether, sold: 0}));
        phases.push(Phase({price: 9000, tokensAvailable: 30_000_000 ether, sold: 0}));
        phases.push(Phase({price: 10000, tokensAvailable: 20_000_000 ether, sold: 0}));
    }

    function buyWithShib(uint256 shibAmount) external nonReentrant {
        require(vestingStartTime > 0 && block.timestamp > vestingStartTime, "Presale not active");
        require(shibAmount > 0, "Amount must be >0");

        Phase storage phase = phases[currentPhase];
        uint256 scorchAmount = shibAmount.mul(1e18).div(phase.price);
        require(scorchAmount > 0 && phase.sold + scorchAmount <= phase.tokensAvailable, "Invalid amount");

        require(IERC20(address(bridgedShib)).allowance(msg.sender, address(this)) >= shibAmount, "Approve first");
        require(IERC20(address(bridgedShib)).balanceOf(msg.sender) >= shibAmount, "Insufficient SHIB");

        uint256 burnAmount = shibAmount.mul(995).div(1000);
        uint256 opsAmount = shibAmount.sub(burnAmount);

        // Transfer bridge-token to contract first
        IERC20(address(bridgedShib)).transferFrom(msg.sender, address(this), shibAmount);
        // Split funds
        if (opsAmount > 0) {
            IERC20(address(bridgedShib)).transfer(operationsWallet, opsAmount);
        }

        // Initiate bridge burn on L2
        bridgedShib.withdrawStart(burnAmount);
        emit SHIBBurnInitiated(msg.sender, burnAmount, block.timestamp);

        phase.sold = phase.sold.add(scorchAmount);
        userVesting[msg.sender].totalAmount = userVesting[msg.sender].totalAmount.add(scorchAmount);

        emit TokensPurchased(msg.sender, scorchAmount, currentPhase);
    }

    function claimVestedTokens() external nonReentrant {
        require(vestingStartTime > 0, "Not started");
        VestingInfo storage v = userVesting[msg.sender];
        uint256 available = getReleasableAmount(msg.sender);
        require(available > 0, "Nothing to claim");
        v.claimedAmount = v.claimedAmount.add(available);
        scorchToken.mint(msg.sender, available);
        emit TokensClaimed(msg.sender, available);
    }

    function getReleasableAmount(address user) public view returns (uint256) {
        VestingInfo storage v = userVesting[user];
        if (block.timestamp < vestingStartTime + VESTING_CLIFF) return 0;
        uint256 passed = block.timestamp.sub(vestingStartTime);
        if (passed >= VESTING_TOTAL) return v.totalAmount.sub(v.claimedAmount);
        return v.totalAmount.mul(passed).div(VESTING_TOTAL).sub(v.claimedAmount);
    }

    function startPresale() external onlyOwner {
        require(vestingStartTime == 0, "Already started");
        vestingStartTime = block.timestamp;
        emit PresaleStarted(block.timestamp);
    }

    function advancePhase() external onlyOwner {
        require(currentPhase < phases.length - 1, "Last phase");
        currentPhase++;
    }

    function withdrawStuckTokens(address token) external onlyOwner {
        require(
            token != address(bridgedShib) && token != address(usdcToken),
            "Can't withdraw core tokens"
        );
        IERC20(token).transfer(owner(), IERC20(token).balanceOf(address(this)));
    }
}
