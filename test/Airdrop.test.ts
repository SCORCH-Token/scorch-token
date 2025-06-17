import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Airdrop Contract", function () {
  // Fixture to deploy the token and airdrop contract
  async function deployAirdropFixture() {
    const [admin, minter, user1, user2, user3] = await ethers.getSigners();

    const SCORCH = await ethers.getContractFactory("SCORCH");
    const token = await SCORCH.deploy(admin.address);
    await token.connect(admin).addMinter(minter.address);

    const Airdrop = await ethers.getContractFactory("Airdrop");
    const airdrop = await Airdrop.deploy(token.target);

    // Grant MINTER_ROLE to the Airdrop contract
    await token.connect(admin).addMinter(airdrop.target);
    // Debug: log and assert
    // eslint-disable-next-line no-console
    console.log("Airdrop contract address:", airdrop.target);
    expect(await token.isMinter(airdrop.target)).to.be.true;

    return { token, airdrop, admin, minter, user1, user2, user3 };
  }

  describe("Deployment", function () {
    it("Should set the correct token address", async function () {
      const { token, airdrop } = await loadFixture(deployAirdropFixture);
      expect(await airdrop.scorchToken()).to.equal(token.target);
    });

    it("Should revert if token address is zero", async function () {
      const Airdrop = await ethers.getContractFactory("Airdrop");
      await expect(Airdrop.deploy(ethers.ZeroAddress))
        .to.be.revertedWith("Airdrop: Zero address for token");
    });
  });

  describe("Airdrop Functions", function () {
    it("Should successfully airdrop tokens in batch", async function () {
      const { token, airdrop, admin, user1, user2 } = await loadFixture(deployAirdropFixture);

      const recipients = [user1.address, user2.address];
      const amounts = [
        ethers.parseEther("100"),
        ethers.parseEther("200")
      ];

      await airdrop.connect(admin).airdropBatch(recipients, amounts);

      expect(await token.balanceOf(user1.address)).to.equal(amounts[0]);
      expect(await token.balanceOf(user2.address)).to.equal(amounts[1]);
    });

    it("Should revert if array lengths don't match", async function () {
      const { airdrop, admin, user1 } = await loadFixture(deployAirdropFixture);

      const recipients = [user1.address];
      const amounts = [
        ethers.parseEther("100"),
        ethers.parseEther("200")
      ];

      await expect(airdrop.connect(admin).airdropBatch(recipients, amounts))
        .to.be.revertedWith("Airdrop: Array lengths must match");
    });

    it("Should revert if trying to airdrop to zero address", async function () {
      const { airdrop, admin } = await loadFixture(deployAirdropFixture);

      const recipients = [ethers.ZeroAddress];
      const amounts = [ethers.parseEther("100")];

      await expect(airdrop.connect(admin).airdropBatch(recipients, amounts))
        .to.be.revertedWith("Airdrop: Cannot airdrop to zero address");
    });
  });

  describe("Snapshot Airdrop Functions", function () {
    it("Should successfully airdrop from snapshot", async function () {
      const { token, airdrop, admin, user1, user2 } = await loadFixture(deployAirdropFixture);

      const recipients = [user1.address, user2.address];
      const amount = ethers.parseEther("100");
      const campaignId = 1;

      await airdrop.connect(admin).airdropFromSnapshot(campaignId, recipients, amount);

      expect(await token.balanceOf(user1.address)).to.equal(amount);
      expect(await token.balanceOf(user2.address)).to.equal(amount);
      expect(await airdrop.isAirdropped(campaignId, user1.address)).to.be.true;
      expect(await airdrop.isAirdropped(campaignId, user2.address)).to.be.true;
    });

    it("Should revert if amount is zero", async function () {
      const { airdrop, admin, user1 } = await loadFixture(deployAirdropFixture);

      const recipients = [user1.address];
      const amount = 0;
      const campaignId = 1;

      await expect(airdrop.connect(admin).airdropFromSnapshot(campaignId, recipients, amount))
        .to.be.revertedWith("Airdrop: Amount must be greater than zero");
    });

    it("Should revert if recipient already claimed", async function () {
      const { airdrop, admin, user1 } = await loadFixture(deployAirdropFixture);

      const recipients = [user1.address];
      const amount = ethers.parseEther("100");
      const campaignId = 1;

      await airdrop.connect(admin).airdropFromSnapshot(campaignId, recipients, amount);

      await expect(airdrop.connect(admin).airdropFromSnapshot(campaignId, recipients, amount))
        .to.be.revertedWith("Airdrop: Recipient already claimed");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow admin to reset airdrop status", async function () {
      const { airdrop, admin, user1 } = await loadFixture(deployAirdropFixture);

      const recipients = [user1.address];
      const amount = ethers.parseEther("100");
      const campaignId = 1;

      await airdrop.connect(admin).airdropFromSnapshot(campaignId, recipients, amount);
      expect(await airdrop.isAirdropped(campaignId, user1.address)).to.be.true;

      await airdrop.connect(admin).resetAirdropStatus(campaignId, recipients);
      expect(await airdrop.isAirdropped(campaignId, user1.address)).to.be.false;
    });

    it("Should allow admin to withdraw stuck tokens", async function () {
      const { token, airdrop, admin, minter } = await loadFixture(deployAirdropFixture);

      // Deploy a mock ERC20 token
      const MockToken = await ethers.getContractFactory("MockERC20");
      const mockToken = await MockToken.deploy("Mock", "MOCK");
      await mockToken.mint(airdrop.target, ethers.parseEther("1000"));

      const initialBalance = await mockToken.balanceOf(admin.address);
      await airdrop.connect(admin).withdrawStuckTokens(mockToken.target);
      const finalBalance = await mockToken.balanceOf(admin.address);

      expect(finalBalance - initialBalance).to.equal(ethers.parseEther("1000"));
    });

    it("Should revert when trying to withdraw SCORCH tokens", async function () {
      const { token, airdrop, admin } = await loadFixture(deployAirdropFixture);

      await expect(airdrop.connect(admin).withdrawStuckTokens(token.target))
        .to.be.revertedWith("Airdrop: Cannot withdraw SCORCH token");
    });
  });
});
