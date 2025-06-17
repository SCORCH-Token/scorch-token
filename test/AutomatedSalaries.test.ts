import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("AutomatedSalaries Contract", function () {
  // Fixture to deploy the token and salaries contract
  async function deploySalariesFixture() {
    const [admin, minter, contributor1, contributor2] = await ethers.getSigners();

    const SCORCH = await ethers.getContractFactory("SCORCH");
    const token = await SCORCH.deploy(admin.address);
    await token.connect(admin).addMinter(minter.address);

    const AutomatedSalaries = await ethers.getContractFactory("AutomatedSalaries");
    const salaries = await AutomatedSalaries.deploy(token.target);

    // Grant MINTER_ROLE to the AutomatedSalaries contract
    await token.connect(admin).addMinter(salaries.target);

    return { token, salaries, admin, minter, contributor1, contributor2 };
  }

  describe("Deployment", function () {
    it("Should set the correct token address", async function () {
      const { token, salaries } = await loadFixture(deploySalariesFixture);
      expect(await salaries.scorchToken()).to.equal(token.target);
    });

    it("Should revert if token address is zero", async function () {
      const AutomatedSalaries = await ethers.getContractFactory("AutomatedSalaries");
      await expect(AutomatedSalaries.deploy(ethers.ZeroAddress))
        .to.be.revertedWith("Salaries: Zero address for token");
    });
  });

  describe("Tier Management", function () {
    it("Should allow admin to add a tier", async function () {
      const { salaries, admin } = await loadFixture(deploySalariesFixture);

      const tierId = 1;
      const salary = ethers.parseEther("1000");

      await salaries.connect(admin).addTier(tierId, salary);

      const tier = await salaries.tiers(tierId);
      expect(tier.salaryAmount).to.equal(salary);
      expect(tier.isActive).to.be.true;
    });

    it("Should revert if tier already exists", async function () {
      const { salaries, admin } = await loadFixture(deploySalariesFixture);

      const tierId = 1;
      const salary = ethers.parseEther("1000");

      await salaries.connect(admin).addTier(tierId, salary);

      await expect(salaries.connect(admin).addTier(tierId, salary))
        .to.be.revertedWith("Salaries: Tier already exists");
    });

    it("Should allow admin to update a tier", async function () {
      const { salaries, admin } = await loadFixture(deploySalariesFixture);

      const tierId = 1;
      const initialSalary = ethers.parseEther("1000");
      const newSalary = ethers.parseEther("2000");

      await salaries.connect(admin).addTier(tierId, initialSalary);
      await salaries.connect(admin).updateTier(tierId, newSalary, true);

      const tier = await salaries.tiers(tierId);
      expect(tier.salaryAmount).to.equal(newSalary);
      expect(tier.isActive).to.be.true;
    });

    it("Should revert if updating non-existent tier", async function () {
      const { salaries, admin } = await loadFixture(deploySalariesFixture);

      const tierId = 1;
      const salary = ethers.parseEther("1000");

      await expect(salaries.connect(admin).updateTier(tierId, salary, true))
        .to.be.revertedWith("Salaries: Tier does not exist");
    });
  });

  describe("Contributor Management", function () {
    it("Should allow admin to add a contributor", async function () {
      const { salaries, admin, contributor1 } = await loadFixture(deploySalariesFixture);

      const tierId = 1;
      const salary = ethers.parseEther("1000");

      await salaries.connect(admin).addTier(tierId, salary);
      await salaries.connect(admin).addContributor(contributor1.address, tierId);

      const contributor = await salaries.contributors(contributor1.address);
      expect(contributor.tierId).to.equal(tierId);
      expect(contributor.isActive).to.be.true;
    });

    it("Should revert if adding contributor to non-existent tier", async function () {
      const { salaries, admin, contributor1 } = await loadFixture(deploySalariesFixture);

      const tierId = 1;

      await expect(salaries.connect(admin).addContributor(contributor1.address, tierId))
        .to.be.revertedWith("Salaries: Tier is not active");
    });

    it("Should allow admin to update a contributor", async function () {
      const { salaries, admin, contributor1 } = await loadFixture(deploySalariesFixture);

      const tierId1 = 1;
      const tierId2 = 2;
      const salary = ethers.parseEther("1000");

      await salaries.connect(admin).addTier(tierId1, salary);
      await salaries.connect(admin).addTier(tierId2, salary);
      await salaries.connect(admin).addContributor(contributor1.address, tierId1);
      await salaries.connect(admin).updateContributor(contributor1.address, tierId2, true);

      const contributor = await salaries.contributors(contributor1.address);
      expect(contributor.tierId).to.equal(tierId2);
      expect(contributor.isActive).to.be.true;
    });

    it("Should revert if updating non-existent contributor", async function () {
      const { salaries, admin, contributor1 } = await loadFixture(deploySalariesFixture);

      await expect(salaries.connect(admin).updateContributor(contributor1.address, 1, true))
        .to.be.revertedWith("Salaries: Contributor does not exist");
    });
  });

  describe("Salary Distribution", function () {
    it("Should distribute salary to a single contributor", async function () {
      const { token, salaries, admin, contributor1 } = await loadFixture(deploySalariesFixture);

      const tierId = 1;
      const salary = ethers.parseEther("1000");

      await salaries.connect(admin).addTier(tierId, salary);
      await salaries.connect(admin).addContributor(contributor1.address, tierId);
      await salaries.connect(admin).distributeSalary(contributor1.address);

      expect(await token.balanceOf(contributor1.address)).to.equal(salary);
    });

    it("Should distribute salaries to multiple contributors", async function () {
      const { token, salaries, admin, contributor1, contributor2 } = await loadFixture(deploySalariesFixture);

      const tierId = 1;
      const salary = ethers.parseEther("1000");

      await salaries.connect(admin).addTier(tierId, salary);
      await salaries.connect(admin).addContributor(contributor1.address, tierId);
      await salaries.connect(admin).addContributor(contributor2.address, tierId);

      const contributors = [contributor1.address, contributor2.address];
      await salaries.connect(admin).distributeSalariesBatch(contributors);

      expect(await token.balanceOf(contributor1.address)).to.equal(salary);
      expect(await token.balanceOf(contributor2.address)).to.equal(salary);
    });

    it("Should not allow distribution before payment interval", async function () {
      const { salaries, admin, contributor1 } = await loadFixture(deploySalariesFixture);

      const tierId = 1;
      const salary = ethers.parseEther("1000");

      await salaries.connect(admin).addTier(tierId, salary);
      await salaries.connect(admin).addContributor(contributor1.address, tierId);
      await salaries.connect(admin).distributeSalary(contributor1.address);

      await expect(salaries.connect(admin).distributeSalary(contributor1.address))
        .to.be.revertedWith("Salaries: Payment interval not reached");
    });

    it("Should allow distribution after payment interval", async function () {
      const { token, salaries, admin, contributor1 } = await loadFixture(deploySalariesFixture);

      const tierId = 1;
      const salary = ethers.parseEther("1000");

      await salaries.connect(admin).addTier(tierId, salary);
      await salaries.connect(admin).addContributor(contributor1.address, tierId);
      await salaries.connect(admin).distributeSalary(contributor1.address);

      // Advance time by 30 days
      await time.increase(30 * 24 * 60 * 60);

      await salaries.connect(admin).distributeSalary(contributor1.address);
      expect(await token.balanceOf(contributor1.address)).to.equal(salary * BigInt(2));
    });

    it("Should not distribute salary to inactive contributor", async function () {
      const { salaries, admin, contributor1 } = await loadFixture(deploySalariesFixture);

      const tierId = 1;
      const salary = ethers.parseEther("1000");

      await salaries.connect(admin).addTier(tierId, salary);
      await salaries.connect(admin).addContributor(contributor1.address, tierId);
      await salaries.connect(admin).updateContributor(contributor1.address, tierId, false);

      await expect(salaries.connect(admin).distributeSalary(contributor1.address))
        .to.be.revertedWith("Salaries: Contributor is not active");
    });

    it("Should not distribute salary if tier is inactive", async function () {
      const { salaries, admin, contributor1 } = await loadFixture(deploySalariesFixture);

      const tierId = 1;
      const salary = ethers.parseEther("1000");

      await salaries.connect(admin).addTier(tierId, salary);
      await salaries.connect(admin).addContributor(contributor1.address, tierId);
      await salaries.connect(admin).updateTier(tierId, salary, false);

      await expect(salaries.connect(admin).distributeSalary(contributor1.address))
        .to.be.revertedWith("Salaries: Contributor's tier is not active");
    });
  });
});
