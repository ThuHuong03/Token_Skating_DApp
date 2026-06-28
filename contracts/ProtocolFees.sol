// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract ProtocolFees {
    uint256 private constant FEE_DENOMINATOR = 10_000;
    uint256 public constant MAX_FEE_BPS = 2_000;

    uint256 public protocolFees;
    uint256 public claimFeeBps = 500;
    uint256 public emergencyWithdrawFeeBps = 1_000;

    event ProtocolFeeCollected(address indexed user, string actionType, uint256 feeAmount);
    event ProtocolFeesWithdrawn(address indexed admin, uint256 amount);
    event ClaimFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event EmergencyWithdrawFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    function _collectProtocolFee(
        address user,
        string memory actionType,
        uint256 amount,
        uint256 feeBps
    ) internal returns (uint256 fee, uint256 payout) {
        fee = _calculateFee(amount, feeBps);
        payout = amount - fee;
        protocolFees += fee;

        if (fee > 0) {
            emit ProtocolFeeCollected(user, actionType, fee);
        }
    }

    function _withdrawProtocolFeesBalance(uint256 amount) internal {
        require(amount > 0, "Amount must be greater than zero");
        require(protocolFees >= amount, "Insufficient protocol fees");

        protocolFees -= amount;
    }

    function _setClaimFeeBps(uint256 newFeeBps) internal {
        require(newFeeBps <= MAX_FEE_BPS, "Fee too high");

        emit ClaimFeeUpdated(claimFeeBps, newFeeBps);
        claimFeeBps = newFeeBps;
    }

    function _setEmergencyWithdrawFeeBps(uint256 newFeeBps) internal {
        require(newFeeBps <= MAX_FEE_BPS, "Fee too high");

        emit EmergencyWithdrawFeeUpdated(emergencyWithdrawFeeBps, newFeeBps);
        emergencyWithdrawFeeBps = newFeeBps;
    }

    function _calculateFee(uint256 amount, uint256 feeBps) internal pure returns (uint256) {
        return (amount * feeBps) / FEE_DENOMINATOR;
    }
}
