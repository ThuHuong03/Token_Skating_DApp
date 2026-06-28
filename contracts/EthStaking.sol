// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ProtocolFees} from "./ProtocolFees.sol";

contract EthStaking is Ownable, Pausable, ReentrancyGuard, ProtocolFees {
    uint256 private constant REWARD_PRECISION = 1e18;

    uint256 public totalStaked;
    uint256 public rewardPool;
    uint256 public rewardRate;
    uint256 public lockPeriod;

    struct StakeAccount {
        uint256 balance;
        uint256 rewardStored;
        uint256 lastUpdateTime;
        uint256 stakeStartTime;
    }

    mapping(address => StakeAccount) private accounts;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event EmergencyWithdrawn(address indexed user, uint256 amount);
    event RewardPoolFunded(address indexed admin, uint256 amount);
    event UnusedRewardsWithdrawn(address indexed admin, uint256 amount);
    event RewardRateUpdated(uint256 oldRate, uint256 newRate);
    event LockPeriodUpdated(uint256 oldLockPeriod, uint256 newLockPeriod);

    constructor(uint256 initialRewardRate, uint256 initialLockPeriod) Ownable(msg.sender) {
        rewardRate = initialRewardRate;
        lockPeriod = initialLockPeriod;
    }

    receive() external payable {
        revert("Use fundRewardPool");
    }

    modifier updateReward(address user) {
        if (user != address(0)) {
            StakeAccount storage account = accounts[user];
            account.rewardStored = earned(user);
            account.lastUpdateTime = block.timestamp;
        }
        _;
    }

    function stake() external payable whenNotPaused nonReentrant updateReward(msg.sender) {
        require(msg.value > 0, "Amount must be greater than zero");

        StakeAccount storage account = accounts[msg.sender];
        if (account.balance == 0) {
            account.stakeStartTime = block.timestamp;
        }

        account.balance += msg.value;
        totalStaked += msg.value;

        emit Staked(msg.sender, msg.value);
    }

    function unstake(uint256 amount) external whenNotPaused nonReentrant updateReward(msg.sender) {
        StakeAccount storage account = accounts[msg.sender];

        require(amount > 0, "Amount must be greater than zero");
        require(account.balance >= amount, "Insufficient staked balance");
        require(block.timestamp >= account.stakeStartTime + lockPeriod, "Stake is still locked");

        account.balance -= amount;
        totalStaked -= amount;

        if (account.balance == 0) {
            account.stakeStartTime = 0;
        }

        (bool sent,) = msg.sender.call{value: amount}("");
        require(sent, "ETH transfer failed");

        emit Unstaked(msg.sender, amount);
    }

    function claimReward(uint256 amount) external whenNotPaused nonReentrant updateReward(msg.sender) {
        StakeAccount storage account = accounts[msg.sender];

        require(block.timestamp >= account.stakeStartTime + lockPeriod, "Reward is still locked");
        require(amount > 0, "No reward to claim");
        require(account.rewardStored >= amount, "Claim amount exceeds reward");
        require(rewardPool >= amount, "Insufficient reward pool");

        (, uint256 payout) = _collectProtocolFee(msg.sender, "claim", amount, claimFeeBps);

        account.rewardStored -= amount;
        rewardPool -= amount;

        (bool sent,) = msg.sender.call{value: payout}("");
        require(sent, "ETH transfer failed");

        emit RewardClaimed(msg.sender, payout);
    }

    function emergencyWithdraw() external nonReentrant updateReward(msg.sender) {
        StakeAccount storage account = accounts[msg.sender];
        uint256 amount = account.balance;

        require(amount > 0, "No staked balance");

        account.balance = 0;
        account.rewardStored = 0;
        account.lastUpdateTime = block.timestamp;
        account.stakeStartTime = 0;
        totalStaked -= amount;

        (, uint256 payout) = _collectProtocolFee(
            msg.sender,
            "emergencyWithdraw",
            amount,
            emergencyWithdrawFeeBps
        );

        (bool sent,) = msg.sender.call{value: payout}("");
        require(sent, "ETH transfer failed");

        emit EmergencyWithdrawn(msg.sender, payout);
    }

    function fundRewardPool() external payable onlyOwner {
        require(msg.value > 0, "Amount must be greater than zero");

        rewardPool += msg.value;

        emit RewardPoolFunded(msg.sender, msg.value);
    }

    function withdrawUnusedRewards(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Amount must be greater than zero");
        require(rewardPool >= amount, "Insufficient reward pool");

        rewardPool -= amount;

        (bool sent,) = msg.sender.call{value: amount}("");
        require(sent, "ETH transfer failed");

        emit UnusedRewardsWithdrawn(msg.sender, amount);
    }

    function withdrawProtocolFees(uint256 amount) external onlyOwner nonReentrant {
        _withdrawProtocolFeesBalance(amount);

        (bool sent,) = msg.sender.call{value: amount}("");
        require(sent, "ETH transfer failed");

        emit ProtocolFeesWithdrawn(msg.sender, amount);
    }

    function setRewardRate(uint256 newRate) external onlyOwner {
        emit RewardRateUpdated(rewardRate, newRate);
        rewardRate = newRate;
    }

    function setLockPeriod(uint256 newLockPeriod) external onlyOwner {
        emit LockPeriodUpdated(lockPeriod, newLockPeriod);
        lockPeriod = newLockPeriod;
    }

    function setClaimFeeBps(uint256 newFeeBps) external onlyOwner {
        _setClaimFeeBps(newFeeBps);
    }

    function setEmergencyWithdrawFeeBps(uint256 newFeeBps) external onlyOwner {
        _setEmergencyWithdrawFeeBps(newFeeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function earned(address user) public view returns (uint256) {
        StakeAccount memory account = accounts[user];

        if (account.balance == 0) {
            return account.rewardStored;
        }

        uint256 elapsed = block.timestamp - account.lastUpdateTime;
        uint256 pending = (account.balance * rewardRate * elapsed) / REWARD_PRECISION;

        return account.rewardStored + pending;
    }

    function getStakeInfo(
        address user
    )
        external
        view
        returns (
            uint256 stakedBalance,
            uint256 pendingReward,
            uint256 stakeStartTime,
            uint256 unlockTime,
            uint256 lastUpdateTime
        )
    {
        StakeAccount memory account = accounts[user];

        stakedBalance = account.balance;
        pendingReward = earned(user);
        stakeStartTime = account.stakeStartTime;
        unlockTime = account.stakeStartTime == 0 ? 0 : account.stakeStartTime + lockPeriod;
        lastUpdateTime = account.lastUpdateTime;
    }

}
