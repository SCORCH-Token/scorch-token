import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("SCORCH Token", function () {
  // Fixture to deploy the token and provide accounts
  async function deployTokenFixture() {
    const [admin, minter, user1, user2] = await ethers.getSigners();

    const SCORCH = await ethers.getContractFactory("SCORCH");
    const token = await SCORCH.deploy(admin.address);

    return { token, admin, minter, user1, user2 };
  }

  describe("Deployment", function () {
    it("Should set the right name and symbol", async function () {
      const { token } = await loadFixture(deployTokenFixture);

      expect(await token.name()).to.equal("SCORCH");
      expect(await token.symbol()).to.equal("SCORCH");
    });

    it("Should assign the default admin role to the initialAdmin", async function () {
      const { token, admin } = await loadFixture(deployTokenFixture);

      const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
      expect(await token.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("Should revert if initialAdmin is the zero address", async function () {
      const SCORCH = await ethers.getContractFactory("SCORCH");

      try {
        await SCORCH.deploy(ethers.ZeroAddress);
        expect.fail("Transaction should have failed");
      } catch (error: any) {
        expect(error.message).to.include(
          "SCORCH: Initial admin cannot be the zero address"
        );
      }
    });
  });

  describe("Admin Functions", function () {
    it("Should allow admin to add a minter", async function () {
      const { token, admin, minter } = await loadFixture(deployTokenFixture);

      await token.connect(admin).addMinter(minter.address);

      expect(await token.isMinter(minter.address)).to.be.true;
    });

    it("Should allow admin to remove a minter", async function () {
      const { token, admin, minter } = await loadFixture(deployTokenFixture);

      await token.connect(admin).addMinter(minter.address);
      expect(await token.isMinter(minter.address)).to.be.true;

      await token.connect(admin).removeMinter(minter.address);
      expect(await token.isMinter(minter.address)).to.be.false;
    });

    it("Should not allow non-admin to add a minter", async function () {
      const { token, user1, user2 } = await loadFixture(deployTokenFixture);

      try {
        await token.connect(user1).addMinter(user2.address);
        expect.fail("Transaction should have failed");
      } catch (error: any) {
        expect(error.message).to.include("SCORCH: Caller is not an admin");
      }
    });

    it("Should not allow non-admin to remove a minter", async function () {
      const { token, admin, minter, user1 } = await loadFixture(
        deployTokenFixture
      );

      await token.connect(admin).addMinter(minter.address);

      try {
        await token.connect(user1).removeMinter(minter.address);
        expect.fail("Transaction should have failed");
      } catch (error: any) {
        expect(error.message).to.include("SCORCH: Caller is not an admin");
      }
    });
  });

  describe("Minting", function () {
    it("Should allow minter to mint tokens", async function () {
      const { token, admin, minter, user1 } = await loadFixture(
        deployTokenFixture
      );

      await token.connect(admin).addMinter(minter.address);

      const mintAmount = ethers.parseEther("1000");
      await token.connect(minter).mint(user1.address, mintAmount);

      expect(await token.balanceOf(user1.address)).to.equal(mintAmount);
    });

    it("Should not allow non-minters to mint tokens", async function () {
      const { token, user1, user2 } = await loadFixture(deployTokenFixture);

      const mintAmount = ethers.parseEther("1000");

      try {
        await token.connect(user1).mint(user2.address, mintAmount);
        expect.fail("Transaction should have failed");
      } catch (error: any) {
        expect(error.message).to.include("SCORCH: Caller is not a minter");
      }
    });

    it("Should not allow minting beyond max supply", async function () {
      const { token, admin, minter } = await loadFixture(deployTokenFixture);

      await token.connect(admin).addMinter(minter.address);

      const MAX_SUPPLY = ethers.parseEther("15000000000");

      try {
        await token
          .connect(minter)
          .mint(minter.address, MAX_SUPPLY + BigInt(1));
        expect.fail("Transaction should have failed");
      } catch (error: any) {
        expect(error.message).to.include(
          "SCORCH: Minting would exceed max supply"
        );
      }
    });
  });

  describe("Transfers with Burn Tax", function () {
    it("Should apply tax: event shows formulaic 1%, balances/supply reflect actual burn", async function () {
      const { token, admin, minter, user1, user2 } = await loadFixture(
        deployTokenFixture
      );

      // Setup: mint tokens to user1
      await token.connect(admin).addMinter(minter.address);
      const mintAmount = ethers.parseEther("1000");
      await token.connect(minter).mint(user1.address, mintAmount);

      // Transfer tokens from user1 to user2
      const transferAmount = ethers.parseEther("100");

      // Calculate expected values
      const expectedTaxAmount = (transferAmount * BigInt(1)) / BigInt(100); // 1% of transfer amount


      // Check states before transfer
      const initialSupply = await token.totalSupply();
      const initialUser1Balance = await token.balanceOf(user1.address);
      const initialUser2Balance = await token.balanceOf(user2.address);

      // Execute transfer
      const tx = await token
        .connect(user1)
        .transfer(user2.address, transferAmount);
      const receipt = await tx.wait();

      // Check states after transfer
      const finalSupply = await token.totalSupply();
      const finalUser1Balance = await token.balanceOf(user1.address);
      const finalUser2Balance = await token.balanceOf(user2.address);

      const actualBurnAmount = initialSupply - finalSupply;

      // Log values for clarity
      console.log("--- Tax Verification Details ---");
      console.log("Transfer Amount:", ethers.formatEther(transferAmount));
      console.log("Expected Tax Amount (1%):", ethers.formatEther(expectedTaxAmount));
      console.log("Sender Final Balance:", ethers.formatEther(finalUser1Balance));
      console.log("Recipient Final Balance:", ethers.formatEther(finalUser2Balance));
      console.log("Actual Burn Amount:", ethers.formatEther(actualBurnAmount));
      console.log("----------------------------------------");

      // Verification 1: Check the emitted TokensBurnedWithTax event
      let eventFound = false;
      if (receipt && receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const parsedLog = token.interface.parseLog(log);
            if (parsedLog && parsedLog.name === "TokensBurnedWithTax") {
              eventFound = true;
              expect(parsedLog.args.from).to.equal(user1.address);
              expect(parsedLog.args.to).to.equal(user2.address);
              expect(parsedLog.args.valueTransferred).to.equal(transferAmount);
              expect(parsedLog.args.taxAmountBurned).to.equal(expectedTaxAmount);
              break;
            }
          } catch (e) {
            /* Ignore logs not parseable by this interface */
          }
        }
      }
      expect(eventFound).to.be.true;

      // Verification 2: Check total supply decreased by exactly 1% of transfer amount
      expect(actualBurnAmount).to.equal(expectedTaxAmount);

      // Verification 3: Check sender's balance decreased by transfer amount + tax
      expect(finalUser1Balance).to.equal(initialUser1Balance - transferAmount - expectedTaxAmount);

      // Verification 4: Check recipient received full transfer amount
      expect(finalUser2Balance).to.equal(initialUser2Balance + transferAmount);
    });

    it("Should emit TokensBurnedWithTax event on transfers", async function () {
      const { token, admin, minter, user1, user2 } = await loadFixture(
        deployTokenFixture
      );

      // Setup: mint tokens to user1
      await token.connect(admin).addMinter(minter.address);
      const mintAmount = ethers.parseEther("1000");
      await token.connect(minter).mint(user1.address, mintAmount);

      // Transfer tokens
      const transferAmount = ethers.parseEther("100");

      // Execute transfer and check for event using transaction receipt
      const tx = await token
        .connect(user1)
        .transfer(user2.address, transferAmount);
      const receipt = await tx.wait();

      // Check if the event was emitted
      const events = receipt?.logs.filter(
        (log: any) => log.fragment?.name === "TokensBurnedWithTax"
      );

      expect(events?.length).to.be.at.least(
        1,
        "TokensBurnedWithTax event not emitted"
      );
    });

    it("Should not apply burn tax on minting operations", async function () {
      const { token, admin, minter, user1 } = await loadFixture(
        deployTokenFixture
      );

      await token.connect(admin).addMinter(minter.address);

      const mintAmount = ethers.parseEther("1000");
      await token.connect(minter).mint(user1.address, mintAmount);

      // Verify no tax was applied (user received full amount)
      expect(await token.balanceOf(user1.address)).to.equal(mintAmount);
    });

    it("Should not transfer if sender has insufficient balance for transfer", async function () {
      const { token, admin, minter, user1, user2 } = await loadFixture(
        deployTokenFixture
      );

      // Setup: mint tokens to user1
      await token.connect(admin).addMinter(minter.address);
      const mintAmount = ethers.parseEther("100");
      await token.connect(minter).mint(user1.address, mintAmount);

      // Try to transfer more than available
      const transferAmount = mintAmount + BigInt(1); // Try to transfer more than balance

      try {
        await token.connect(user1).transfer(user2.address, transferAmount);
        expect.fail("Transaction should have failed");
      } catch (error: any) {
        expect(error.message).to.include(
          "SCORCH: Balance too low for transfer"
        );
      }
    });
  });
});
