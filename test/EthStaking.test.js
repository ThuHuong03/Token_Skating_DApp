import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

describe("EthStaking", function () {
  const rewardPoolAmount = ethers.parseEther("100");
  const stakeAmount = ethers.parseEther("1");
  const rewardRate = ethers.parseUnits("0.0001", 18);
  const lockPeriod = 7 * 24 * 60 * 60;
  const claimFeeBps = 500n;
  const emergencyWithdrawFeeBps = 1000n;
  const feeDenominator = 10000n;

  async function deployFixture() {
    const [owner, user] = await ethers.getSigners();
    const staking = await ethers.deployContract("EthStaking", [rewardRate, lockPeriod]);

    await staking.fundRewardPool({ value: rewardPoolAmount });

    return { owner, user, staking };
  }

  async function expectRevert(promise, reason) {
    try {
      await promise;
      expect.fail("Expected transaction to revert");
    } catch (error) {
      if (reason) {
        expect(error.message).to.include(reason);
      }
    }
  }

  it("allows a user to stake native ETH", async function () {
    const { user, staking } = await deployFixture();

    await staking.connect(user).stake({ value: stakeAmount });

    const [stakedBalance] = await staking.getStakeInfo(user.address);
    expect(stakedBalance).to.equal(stakeAmount);
    expect(await staking.totalStaked()).to.equal(stakeAmount);
  });

  it("rejects zero amount stake", async function () {
    const { user, staking } = await deployFixture();

    await expectRevert(staking.connect(user).stake({ value: 0 }), "Amount must be greater than zero");
  });

  it("blocks normal unstake before the lock period ends", async function () {
    const { user, staking } = await deployFixture();

    await staking.connect(user).stake({ value: stakeAmount });

    await expectRevert(staking.connect(user).unstake(stakeAmount), "Stake is still locked");
  });

  it("allows unstake after the lock period ends", async function () {
    const { user, staking } = await deployFixture();

    await staking.connect(user).stake({ value: stakeAmount });
    await networkHelpers.time.increase(lockPeriod + 1);

    await staking.connect(user).unstake(stakeAmount);

    const [stakedBalance] = await staking.getStakeInfo(user.address);
    expect(stakedBalance).to.equal(0n);
    expect(await staking.totalStaked()).to.equal(0n);
  });

  it("accrues and pays rewards from the funded ETH reward pool", async function () {
    const { user, staking } = await deployFixture();

    await staking.connect(user).stake({ value: stakeAmount });
    await networkHelpers.time.increase(1000);

    const pendingReward = await staking.earned(user.address);
    expect(pendingReward).to.be.greaterThan(0n);

    const rewardPoolBefore = await staking.rewardPool();

    await networkHelpers.time.increase(lockPeriod + 1);
    const claimAmount = await staking.earned(user.address);
    const expectedFee = (claimAmount * claimFeeBps) / feeDenominator;
    await staking.connect(user).claimReward(claimAmount);

    const [, rewardAfterClaim] = await staking.getStakeInfo(user.address);
    expect(rewardAfterClaim).to.be.lessThan(claimAmount);
    expect(await staking.rewardPool()).to.be.lessThan(rewardPoolBefore);
    expect(await staking.protocolFees()).to.equal(expectedFee);
  });

  it("claims a fixed reward snapshot and leaves later rewards pending", async function () {
    const { user, staking } = await deployFixture();

    await staking.connect(user).stake({ value: stakeAmount });
    await networkHelpers.time.increase(lockPeriod + 1);

    const claimAmount = await staking.earned(user.address);
    await networkHelpers.time.increase(1000);
    await staking.connect(user).claimReward(claimAmount);

    const [, rewardAfterClaim] = await staking.getStakeInfo(user.address);
    expect(rewardAfterClaim).to.be.greaterThan(0n);
  });

  it("rejects reward claims when the reward pool is empty", async function () {
    const [, user] = await ethers.getSigners();
    const staking = await ethers.deployContract("EthStaking", [rewardRate, lockPeriod]);

    await staking.connect(user).stake({ value: stakeAmount });
    await networkHelpers.time.increase(1000);

    await networkHelpers.time.increase(lockPeriod + 1);
    const claimAmount = await staking.earned(user.address);
    await expectRevert(staking.connect(user).claimReward(claimAmount), "Insufficient reward pool");
  });

  it("blocks reward claims before the lock period ends", async function () {
    const { user, staking } = await deployFixture();

    await staking.connect(user).stake({ value: stakeAmount });
    await networkHelpers.time.increase(1000);

    const claimAmount = await staking.earned(user.address);
    await expectRevert(staking.connect(user).claimReward(claimAmount), "Reward is still locked");
  });

  it("allows emergency withdraw before lock period and clears pending rewards", async function () {
    const { user, staking } = await deployFixture();

    await staking.connect(user).stake({ value: stakeAmount });
    await networkHelpers.time.increase(1000);

    await staking.connect(user).emergencyWithdraw();

    const [stakedBalance, pendingReward] = await staking.getStakeInfo(user.address);
    expect(stakedBalance).to.equal(0n);
    expect(pendingReward).to.equal(0n);
    expect(await staking.protocolFees()).to.equal((stakeAmount * emergencyWithdrawFeeBps) / feeDenominator);
  });

  it("allows the owner to update and withdraw protocol fees", async function () {
    const { owner, user, staking } = await deployFixture();

    await staking.connect(owner).setClaimFeeBps(250);
    await staking.connect(owner).setEmergencyWithdrawFeeBps(500);

    expect(await staking.claimFeeBps()).to.equal(250n);
    expect(await staking.emergencyWithdrawFeeBps()).to.equal(500n);

    await staking.connect(user).stake({ value: stakeAmount });
    await staking.connect(user).emergencyWithdraw();

    const collectedFees = await staking.protocolFees();
    expect(collectedFees).to.be.greaterThan(0n);

    await staking.connect(owner).withdrawProtocolFees(collectedFees);
    expect(await staking.protocolFees()).to.equal(0n);
  });

  it("rejects protocol fees above the configured maximum", async function () {
    const { owner, staking } = await deployFixture();

    await expectRevert(staking.connect(owner).setClaimFeeBps(2001), "Fee too high");
    await expectRevert(staking.connect(owner).setEmergencyWithdrawFeeBps(2001), "Fee too high");
  });

  it("restricts admin functions to the owner", async function () {
    const { user, staking } = await deployFixture();

    await expectRevert(staking.connect(user).setRewardRate(1));
    await expectRevert(staking.connect(user).setLockPeriod(1));
    await expectRevert(staking.connect(user).setClaimFeeBps(1));
    await expectRevert(staking.connect(user).setEmergencyWithdrawFeeBps(1));
    await expectRevert(staking.connect(user).pause());
    await expectRevert(staking.connect(user).unpause());
    await expectRevert(staking.connect(user).fundRewardPool({ value: 1 }));
    await expectRevert(staking.connect(user).withdrawProtocolFees(1));
  });

  it("blocks normal user operations while paused", async function () {
    const { owner, user, staking } = await deployFixture();

    await staking.connect(owner).pause();

    await expectRevert(staking.connect(user).stake({ value: stakeAmount }));
    await expectRevert(staking.connect(user).claimReward(1));
    await expectRevert(staking.connect(user).unstake(stakeAmount));
  });

  it("rejects unstaking more than the user staked", async function () {
    const { user, staking } = await deployFixture();

    await staking.connect(user).stake({ value: stakeAmount });
    await networkHelpers.time.increase(lockPeriod + 1);

    await expectRevert(staking.connect(user).unstake(stakeAmount + 1n), "Insufficient staked balance");
  });
});
