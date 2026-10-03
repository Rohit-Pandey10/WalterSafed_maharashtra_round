const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("HeirloomVault Protocol", function () {
  let HeirloomVault;
  let vault;
  let owner;
  let beneficiary;
  let guardian1;
  let guardian2;
  let guardian3;
  let stranger;

  const sampleIpfsHash = "QmTest123456789abcdefghijklmnopqrstuvwxyzHeirloom";
  const interval = 180; // 3 minutes for test
  const threshold = 2;

  beforeEach(async function () {
    [owner, beneficiary, guardian1, guardian2, guardian3, stranger] =
      await ethers.getSigners();

    HeirloomVault = await ethers.getContractFactory("HeirloomVault");
    vault = await HeirloomVault.deploy();
    await vault.waitForDeployment();
  });

  describe("1. Vault Creation", function () {
    it("should successfully create a vault with correct initial state and emit VaultCreated", async function () {
      const guardians = [guardian1.address, guardian2.address, guardian3.address];

      await expect(
        vault
          .connect(owner)
          .createVault(
            beneficiary.address,
            sampleIpfsHash,
            interval,
            guardians,
            threshold
          )
      )
        .to.emit(vault, "VaultCreated")
        .withArgs(
          1,
          owner.address,
          beneficiary.address,
          sampleIpfsHash,
          interval,
          guardians,
          threshold
        );

      const v = await vault.getVault(1);
      expect(v.id).to.equal(1);
      expect(v.owner).to.equal(owner.address);
      expect(v.beneficiary).to.equal(beneficiary.address);
      expect(v.ipfsHash).to.equal(sampleIpfsHash);
      expect(v.heartbeatInterval).to.equal(interval);
      expect(v.guardianThreshold).to.equal(threshold);
      expect(v.approvalsCount).to.equal(0);
      expect(v.status).to.equal(0); // VaultStatus.Active

      const retrievedGuardians = await vault.getGuardians(1);
      expect(retrievedGuardians).to.deep.equal(guardians);
      expect(await vault.isGuardian(1, guardian1.address)).to.be.true;
      expect(await vault.isGuardian(1, stranger.address)).to.be.false;
    });

    it("should revert if beneficiary is zero address or owner itself", async function () {
      const guardians = [guardian1.address, guardian2.address];

      await expect(
        vault.connect(owner).createVault(ethers.ZeroAddress, sampleIpfsHash, interval, guardians, 1)
      ).to.be.revertedWithCustomError(vault, "InvalidBeneficiary");

      await expect(
        vault.connect(owner).createVault(owner.address, sampleIpfsHash, interval, guardians, 1)
      ).to.be.revertedWithCustomError(vault, "InvalidBeneficiary");
    });

    it("should revert if ipfsHash is empty or interval is 0", async function () {
      const guardians = [guardian1.address];

      await expect(
        vault.connect(owner).createVault(beneficiary.address, "", interval, guardians, 1)
      ).to.be.revertedWithCustomError(vault, "EmptyIpfsHash");

      await expect(
        vault.connect(owner).createVault(beneficiary.address, sampleIpfsHash, 0, guardians, 1)
      ).to.be.revertedWithCustomError(vault, "InvalidHeartbeatInterval");
    });

    it("should revert if guardians are empty, invalid, duplicated, or threshold is invalid", async function () {
      await expect(
        vault.connect(owner).createVault(beneficiary.address, sampleIpfsHash, interval, [], 1)
      ).to.be.revertedWithCustomError(vault, "InvalidGuardians");

      await expect(
        vault.connect(owner).createVault(beneficiary.address, sampleIpfsHash, interval, [guardian1.address], 0)
      ).to.be.revertedWithCustomError(vault, "InvalidThreshold");

      await expect(
        vault.connect(owner).createVault(beneficiary.address, sampleIpfsHash, interval, [guardian1.address], 2)
      ).to.be.revertedWithCustomError(vault, "InvalidThreshold");

      await expect(
        vault.connect(owner).createVault(
          beneficiary.address,
          sampleIpfsHash,
          interval,
          [guardian1.address, guardian1.address],
          1
        )
      ).to.be.revertedWithCustomError(vault, "InvalidGuardians");
    });
  });

  describe("2. Heartbeat Loop and Recovery", function () {
    beforeEach(async function () {
      const guardians = [guardian1.address, guardian2.address, guardian3.address];
      await vault
        .connect(owner)
        .createVault(beneficiary.address, sampleIpfsHash, interval, guardians, threshold);
    });

    it("should allow owner to call heartbeat and update lastHeartbeat", async function () {
      const vBefore = await vault.getVault(1);
      await time.increase(60);

      await expect(vault.connect(owner).heartbeat(1))
        .to.emit(vault, "Heartbeat");

      const vAfter = await vault.getVault(1);
      expect(vAfter.lastHeartbeat).to.be.greaterThan(vBefore.lastHeartbeat);
    });

    it("should reject heartbeat call from non-owner", async function () {
      await expect(
        vault.connect(stranger).heartbeat(1)
      ).to.be.revertedWithCustomError(vault, "NotOwner");
    });

    it("should allow owner to recover vault from InGracePeriod back to Active", async function () {
      await time.increase(interval + 1);
      await vault.connect(stranger).triggerInactivity(1);

      let v = await vault.getVault(1);
      expect(v.status).to.equal(1); // InGracePeriod

      await expect(vault.connect(owner).heartbeat(1))
        .to.emit(vault, "Heartbeat");

      v = await vault.getVault(1);
      expect(v.status).to.equal(0); // Active
    });
  });

  describe("3. Inactivity Trigger (Time-Travel)", function () {
    beforeEach(async function () {
      const guardians = [guardian1.address, guardian2.address];
      await vault
        .connect(owner)
        .createVault(beneficiary.address, sampleIpfsHash, interval, guardians, 2);
    });

    it("should revert if triggerInactivity is called before interval expires", async function () {
      await time.increase(interval - 10);
      await expect(
        vault.connect(stranger).triggerInactivity(1)
      ).to.be.revertedWithCustomError(vault, "InactivityConditionNotMet");
    });

    it("should transition vault to InGracePeriod once interval passes", async function () {
      await time.increase(interval + 1);
      await expect(vault.connect(stranger).triggerInactivity(1))
        .to.emit(vault, "InactivityTriggered");

      const v = await vault.getVault(1);
      expect(v.status).to.equal(1); // InGracePeriod
    });
  });

  describe("4. Guardian Attestation & Threshold", function () {
    beforeEach(async function () {
      const guardians = [guardian1.address, guardian2.address, guardian3.address];
      await vault
        .connect(owner)
        .createVault(beneficiary.address, sampleIpfsHash, interval, guardians, threshold);

      await time.increase(interval + 1);
      await vault.connect(stranger).triggerInactivity(1);
    });

    it("should revert attestation if called by non-guardian", async function () {
      await expect(
        vault.connect(stranger).attestVault(1)
      ).to.be.revertedWithCustomError(vault, "NotGuardian");
    });

    it("should record attestation and update status to Approved once threshold reached", async function () {
      // Guardian 1 attests
      await expect(vault.connect(guardian1).attestVault(1))
        .to.emit(vault, "GuardianAttested")
        .withArgs(1, guardian1.address, 1);

      expect(await vault.hasApproved(1, guardian1.address)).to.be.true;

      let v = await vault.getVault(1);
      expect(v.approvalsCount).to.equal(1);
      expect(v.status).to.equal(1); // Still InGracePeriod

      // Duplicate attestation should revert
      await expect(
        vault.connect(guardian1).attestVault(1)
      ).to.be.revertedWithCustomError(vault, "AlreadyApproved");

      // Guardian 2 attests (threshold = 2 reached)
      await expect(vault.connect(guardian2).attestVault(1))
        .to.emit(vault, "VaultApproved");

      v = await vault.getVault(1);
      expect(v.approvalsCount).to.equal(2);
      expect(v.status).to.equal(2); // Approved
    });
  });

  describe("5. Beneficiary Claim & Access Protection", function () {
    beforeEach(async function () {
      const guardians = [guardian1.address, guardian2.address];
      await vault
        .connect(owner)
        .createVault(beneficiary.address, sampleIpfsHash, interval, guardians, 2);
    });

    it("should revert claim if vault is not Approved", async function () {
      await expect(
        vault.connect(beneficiary).claimVault(1)
      ).to.be.revertedWithCustomError(vault, "InvalidVaultStatus");
    });

    it("should revert claim if caller is not the beneficiary", async function () {
      await time.increase(interval + 1);
      await vault.connect(stranger).triggerInactivity(1);
      await vault.connect(guardian1).attestVault(1);
      await vault.connect(guardian2).attestVault(1);

      await expect(
        vault.connect(stranger).claimVault(1)
      ).to.be.revertedWithCustomError(vault, "NotBeneficiary");
    });

    it("should allow beneficiary to claim approved vault and set status to Claimed", async function () {
      await time.increase(interval + 1);
      await vault.connect(stranger).triggerInactivity(1);
      await vault.connect(guardian1).attestVault(1);
      await vault.connect(guardian2).attestVault(1);

      await expect(vault.connect(beneficiary).claimVault(1))
        .to.emit(vault, "VaultClaimed");

      const v = await vault.getVault(1);
      expect(v.status).to.equal(3); // Claimed
    });
  });

  describe("6. Vault Cancellation", function () {
    beforeEach(async function () {
      const guardians = [guardian1.address, guardian2.address];
      await vault
        .connect(owner)
        .createVault(beneficiary.address, sampleIpfsHash, interval, guardians, 2);
    });

    it("should allow owner to cancel vault in Active state and emit VaultCancelled", async function () {
      await expect(vault.connect(owner).cancelVault(1))
        .to.emit(vault, "VaultCancelled")
        .withArgs(1, owner.address, (val) => val > 0);

      const v = await vault.getVault(1);
      expect(v.status).to.equal(4); // Cancelled
    });

    it("should allow owner to cancel vault in InGracePeriod state", async function () {
      await time.increase(interval + 1);
      await vault.connect(stranger).triggerInactivity(1);

      let v = await vault.getVault(1);
      expect(v.status).to.equal(1); // InGracePeriod

      await expect(vault.connect(owner).cancelVault(1))
        .to.emit(vault, "VaultCancelled");

      v = await vault.getVault(1);
      expect(v.status).to.equal(4); // Cancelled
    });

    it("should revert if non-owner attempts to cancel", async function () {
      await expect(
        vault.connect(stranger).cancelVault(1)
      ).to.be.revertedWithCustomError(vault, "NotOwner");

      await expect(
        vault.connect(beneficiary).cancelVault(1)
      ).to.be.revertedWithCustomError(vault, "NotOwner");
    });

    it("should prevent guardians from attesting or beneficiaries from claiming a cancelled vault", async function () {
      // Cancel the vault
      await vault.connect(owner).cancelVault(1);

      // Guardians cannot attest
      await expect(
        vault.connect(guardian1).attestVault(1)
      ).to.be.revertedWithCustomError(vault, "InvalidVaultStatus");

      // Beneficiary cannot claim
      await expect(
        vault.connect(beneficiary).claimVault(1)
      ).to.be.revertedWithCustomError(vault, "InvalidVaultStatus");

      // Owner cannot cancel again
      await expect(
        vault.connect(owner).cancelVault(1)
      ).to.be.revertedWithCustomError(vault, "InvalidVaultStatus");

      // Owner cannot heartbeat
      await expect(
        vault.connect(owner).heartbeat(1)
      ).to.be.revertedWithCustomError(vault, "InvalidVaultStatus");
    });
  });
});

