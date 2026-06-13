const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const USDC = (n) => ethers.parseUnits(String(n), 6);

describe("Float — FloatPool + FloatCore", function () {
  let investor, seller, buyer, stranger;
  let mockUSDC, pool, core;

  beforeEach(async function () {
    [, investor, seller, buyer, stranger] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);

    await mockUSDC.mint(investor.address, USDC(100_000));
    await mockUSDC.mint(buyer.address, USDC(100_000));

    const FloatPool = await ethers.getContractFactory("FloatPool");
    pool = await FloatPool.deploy(await mockUSDC.getAddress());

    const FloatCore = await ethers.getContractFactory("FloatCore");
    core = await FloatCore.deploy(await mockUSDC.getAddress(), await pool.getAddress());

    await pool.setAuthorizedCore(await core.getAddress());
    await mockUSDC.connect(investor).approve(await pool.getAddress(), USDC(100_000));
    await mockUSDC.connect(buyer).approve(await core.getAddress(), USDC(100_000));
  });

  it("T-01: First deposit mints shares 1:1", async function () {
    await pool.connect(investor).deposit(USDC(1000));
    expect(await pool.shares(investor.address)).to.equal(USDC(1000));
    expect(await pool.totalShares()).to.equal(USDC(1000));
    expect(await pool.totalAssets()).to.equal(USDC(1000));
  });

  it("T-02: Second deposit after fee accrual gets diluted shares", async function () {
    await pool.connect(investor).deposit(USDC(1000));
    await mockUSDC.mint(await pool.getAddress(), USDC(100));

    await mockUSDC.mint(stranger.address, USDC(1000));
    await mockUSDC.connect(stranger).approve(await pool.getAddress(), USDC(1000));
    await pool.connect(stranger).deposit(USDC(1000));

    const strangerShares = await pool.shares(stranger.address);
    expect(strangerShares).to.be.lessThan(USDC(1000));
    expect(strangerShares).to.be.closeTo(BigInt("909090909"), BigInt("1000"));
  });

  it("T-03: New seller (score=50, rate=8500) receives 85% advance", async function () {
    await pool.connect(investor).deposit(USDC(10_000));
    const dueDate = (await time.latest()) + 30 * 24 * 3600;
    const before = await mockUSDC.balanceOf(seller.address);

    await core.connect(seller).createInvoice(buyer.address, USDC(1000), dueDate);

    expect(await mockUSDC.balanceOf(seller.address) - before).to.equal(USDC(850));
  });

  it("T-04: payInvoice — pool receives full amount, paidCount increments", async function () {
    await pool.connect(investor).deposit(USDC(10_000));
    const dueDate = (await time.latest()) + 30 * 24 * 3600;
    await core.connect(seller).createInvoice(buyer.address, USDC(1000), dueDate);

    const poolBefore = await pool.totalAssets();
    await core.connect(buyer).payInvoice(0);

    expect(await pool.totalAssets() - poolBefore).to.equal(USDC(1000));
    expect(await core.paidCount(seller.address)).to.equal(1);
    expect(await core.creditScore(seller.address)).to.equal(100);
  });

  it("T-05: payInvoice — wrong buyer reverts NotBuyer", async function () {
    await pool.connect(investor).deposit(USDC(10_000));
    const dueDate = (await time.latest()) + 30 * 24 * 3600;
    await core.connect(seller).createInvoice(buyer.address, USDC(500), dueDate);

    await mockUSDC.mint(stranger.address, USDC(1000));
    await mockUSDC.connect(stranger).approve(await core.getAddress(), USDC(1000));

    await expect(core.connect(stranger).payInvoice(0))
      .to.be.revertedWithCustomError(core, "NotBuyer");
  });

  it("T-06: payInvoice twice reverts InvoiceAlreadySettled", async function () {
    await pool.connect(investor).deposit(USDC(10_000));
    const dueDate = (await time.latest()) + 30 * 24 * 3600;
    await core.connect(seller).createInvoice(buyer.address, USDC(500), dueDate);
    await core.connect(buyer).payInvoice(0);

    await expect(core.connect(buyer).payInvoice(0))
      .to.be.revertedWithCustomError(core, "InvoiceAlreadySettled");
  });

  it("T-07: markDefault before grace period reverts GracePeriodNotExpired", async function () {
    await pool.connect(investor).deposit(USDC(10_000));
    const dueDate = (await time.latest()) + 30 * 24 * 3600;
    await core.connect(seller).createInvoice(buyer.address, USDC(500), dueDate);

    await expect(core.connect(stranger).markDefault(0))
      .to.be.revertedWithCustomError(core, "GracePeriodNotExpired");
  });

  it("T-08: markDefault after dueDate + 7 days → DEFAULTED event", async function () {
    await pool.connect(investor).deposit(USDC(10_000));
    const dueDate = (await time.latest()) + 30 * 24 * 3600;
    await core.connect(seller).createInvoice(buyer.address, USDC(500), dueDate);

    await time.increase(30 * 24 * 3600 + 7 * 24 * 3600 + 1);

    await expect(core.connect(stranger).markDefault(0))
      .to.emit(core, "InvoiceDefaulted")
      .withArgs(0, seller.address);

    const inv = await core.getInvoice(0);
    expect(inv.status).to.equal(2); // DEFAULTED
  });

  it("T-09: createInvoice pool too small reverts InsufficientPoolLiquidity", async function () {
    await pool.connect(investor).deposit(USDC(10));
    const dueDate = (await time.latest()) + 30 * 24 * 3600;

    await expect(
      core.connect(seller).createInvoice(buyer.address, USDC(1000), dueDate)
    ).to.be.revertedWithCustomError(core, "InsufficientPoolLiquidity");
  });

  it("T-10: withdraw more shares than owned reverts InsufficientShares", async function () {
    await pool.connect(investor).deposit(USDC(1000));
    await expect(pool.connect(investor).withdraw(USDC(2000)))
      .to.be.revertedWithCustomError(pool, "InsufficientShares");
  });

  it("T-11: advanceFunds by non-core reverts Unauthorized", async function () {
    await pool.connect(investor).deposit(USDC(1000));
    await expect(pool.connect(stranger).advanceFunds(stranger.address, USDC(100)))
      .to.be.revertedWithCustomError(pool, "Unauthorized");
  });

  it("T-12: New seller — score=50, advanceRateBps=8500", async function () {
    expect(await core.creditScore(seller.address)).to.equal(50);
    expect(await core.advanceRateBps(seller.address)).to.equal(8500);
  });

  it("T-13: 5 paid invoices → score=100 → rate=9500 bps (Excellent)", async function () {
    await pool.connect(investor).deposit(USDC(50_000));
    const dueDate = (await time.latest()) + 30 * 24 * 3600;

    for (let i = 0; i < 5; i++) {
      await core.connect(seller).createInvoice(buyer.address, USDC(100), dueDate);
      await core.connect(buyer).payInvoice(i);
    }
    expect(await core.advanceRateBps(seller.address)).to.equal(9500);
  });

  it("T-14: Full cycle — investor earns yield ($1000 → $1150)", async function () {
    await pool.connect(investor).deposit(USDC(1000));
    const investorShares = await pool.shares(investor.address);

    const dueDate = (await time.latest()) + 30 * 24 * 3600;
    await core.connect(seller).createInvoice(buyer.address, USDC(1000), dueDate);
    await core.connect(buyer).payInvoice(0);

    const before = await mockUSDC.balanceOf(investor.address);
    await pool.connect(investor).withdraw(investorShares);
    const after = await mockUSDC.balanceOf(investor.address);

    // Deposited $1000, pool sent $850 advance, got back $1000 → pool = $1150
    expect(after - before).to.equal(USDC(1150));
  });
});
