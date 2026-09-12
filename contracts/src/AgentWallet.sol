// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// @title AgentWallet
/// @notice A permissioned wallet the buyer (a company) gives to its AI agent.
///         The owner sets a spending policy; the agent can only pay within it.
///         This is what lets an autonomous agent buy proofs without holding the company's keys.
contract AgentWallet {
    address public immutable owner;
    address public agent;
    IERC20 public immutable token;

    uint256 public dailyLimit;      // max token units per rolling 24h window
    uint256 public perPaymentLimit; // max token units per single payment
    uint256 public spentToday;
    uint64 public windowStart;
    mapping(address => bool) public allowedPayee;

    event PolicySet(uint256 dailyLimit, uint256 perPaymentLimit);
    event PayeeAllowed(address payee, bool allowed);
    event AgentPaid(address indexed payee, uint256 amount, bytes32 indexed resource);
    event AgentChanged(address agent);

    error NotOwner();
    error NotAgent();
    error PayeeNotAllowed();
    error OverPerPaymentLimit();
    error OverDailyLimit();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(address _agent, IERC20 _token, uint256 _dailyLimit, uint256 _perPaymentLimit) {
        owner = msg.sender;
        agent = _agent;
        token = _token;
        dailyLimit = _dailyLimit;
        perPaymentLimit = _perPaymentLimit;
        windowStart = uint64(block.timestamp);
        emit PolicySet(_dailyLimit, _perPaymentLimit);
    }

    function setPolicy(uint256 _dailyLimit, uint256 _perPaymentLimit) external onlyOwner {
        dailyLimit = _dailyLimit;
        perPaymentLimit = _perPaymentLimit;
        emit PolicySet(_dailyLimit, _perPaymentLimit);
    }

    function setPayee(address payee, bool allowed) external onlyOwner {
        allowedPayee[payee] = allowed;
        emit PayeeAllowed(payee, allowed);
    }

    function setAgent(address _agent) external onlyOwner {
        agent = _agent;
        emit AgentChanged(_agent);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        require(token.transfer(to, amount), "transfer");
    }

    /// @notice Agent pays `payee` for `resource` (e.g. keccak of the proof URL). Enforces policy.
    function pay(address payee, uint256 amount, bytes32 resource) external {
        if (msg.sender != agent) revert NotAgent();
        if (!allowedPayee[payee]) revert PayeeNotAllowed();
        if (amount > perPaymentLimit) revert OverPerPaymentLimit();
        if (block.timestamp >= windowStart + 1 days) {
            windowStart = uint64(block.timestamp);
            spentToday = 0;
        }
        if (spentToday + amount > dailyLimit) revert OverDailyLimit();
        spentToday += amount;
        require(token.transfer(payee, amount), "transfer");
        emit AgentPaid(payee, amount, resource);
    }

    function remainingToday() external view returns (uint256) {
        if (block.timestamp >= windowStart + 1 days) return dailyLimit;
        return dailyLimit - spentToday;
    }
}
