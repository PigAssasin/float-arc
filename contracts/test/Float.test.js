const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const USDC = (n) => ethers.parseUnits(String(n), 6);
const DAY = 24 * 3600;

// Invoice status enum (must match FloatCore.sol)
const Status = {
  PENDING_APPROVAL: 0,
  PENDING_COLLATERAL: 1,
  FUNDED: 2,
  PAID: 3,
  DEFAULTED: 4,
  CANCELLED: 5,
};

describe("Float v3 — FloatPool + FloatCore", function () {
  let owner, investor, seller, buyer, stranger;
  let usdc, pool, core;

  // Pool invariant: investorAssets + reserved buckets == pool USDC balance.
  // (Holds as long as the pool is never under-reserved.)
  async function assertPoolInvariant() {
    const bal = await usdc.balanceOf(await pool.getAddress());
    const investor = await pool.investorAssets();
    const collateral = await pool.totalLockedCollateral();
    const stake = await pool.sellerStakeTotal();
    const insurance = await pool.insuranceReserve();
    expect(investor + collateral + stake + insurance).to.equal(bal);
  }

  beforeEach(async function () {
    [owner, investor, seller, buyer, stranger] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    await usdc.mint(investor.address, USDC(1_000_000));
    await usdc.mint(buyer.address, USDC(1_000_000));

    const FloatPool = await ethers.getContractFactory("FloatPool");
    pool = await FloatPool.deploy(await usdc.getAddress());

    const FloatCore = await ethers.getContractFactory("FloatCore");
    core = await FloatCore.deploy(await usdc.getAddress(), await pool.getAddress());

    await pool.setAuthorizedCore(await core.getAddress());
    await usdc.connect(investor).approve(await pool.getAddress(), ethers.MaxUint256);
    await usdc.connect(buyer).approve(await core.getAddress(), ethers.MaxUint256);
  });

  // Helper: take an invoice all the way to FUNDED. Returns invoice id.
  async function fundInvoice(face, dueOffsetDays = 30) {
    const due = (await time.latest()) + dueOffsetDays * DAY;
    await core.connect(seller).createInvoice(buyer.address, face, due);
    const id = (await core.invoiceCount()) - 1n;
    await core.connect(buyer).approveInvoice(id);
    await core.connect(buyer).lockCollateral(id);
    return { id, due };
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  describe("Lifecycle", function () {
    it("createInvoice creates PENDING_APPROVAL and moves no funds", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const due = (await time.latest()) + 30 * DAY;
      const sellerBefore = await usdc.balanceOf(seller.address);

      await core.connect(seller).createInvoice(buyer.address, USDC(1000), due);

      const inv = await core.getInvoice(0);
      expect(inv.status).to.equal(Status.PENDING_APPROVAL);
      expect(await usdc.balanceOf(seller.address)).to.equal(sellerBefore); // nothing disbursed
      expect(inv.advance).to.equal(USDC(800)); // new seller = 80%
      expect(inv.stake).to.equal(USDC(80));    // new seller = 8%
      expect(inv.collateral).to.equal(USDC(200)); // new buyer = 20%
      await assertPoolInvariant();
    });

    it("createInvoice to self reverts SelfInvoice", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const due = (await time.latest()) + 30 * DAY;
      await expect(core.connect(seller).createInvoice(seller.address, USDC(1000), due))
        .to.be.revertedWithCustomError(core, "SelfInvoice");
    });

    it("approveInvoice by non-buyer reverts NotBuyer; buyer moves to PENDING_COLLATERAL", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const due = (await time.latest()) + 30 * DAY;
      await core.connect(seller).createInvoice(buyer.address, USDC(1000), due);

      await expect(core.connect(stranger).approveInvoice(0))
        .to.be.revertedWithCustomError(core, "NotBuyer");

      await core.connect(buyer).approveInvoice(0);
      expect((await core.getInvoice(0)).status).to.equal(Status.PENDING_COLLATERAL);
    });

    it("lockCollateral disburses advance net of stake, sets FUNDED", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const sellerBefore = await usdc.balanceOf(seller.address);
      const { id } = await fundInvoice(USDC(1000));

      // net = advance(800) - stake(80) = 720
      expect(await usdc.balanceOf(seller.address) - sellerBefore).to.equal(USDC(720));
      expect((await core.getInvoice(id)).status).to.equal(Status.FUNDED);
      expect(await pool.totalLockedCollateral()).to.equal(USDC(200));
      expect(await pool.sellerStakeTotal()).to.equal(USDC(80));
      await assertPoolInvariant();
    });

    it("payInvoice (at due date) returns collateral + stake, funds insurance, updates scores", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const sellerBefore = await usdc.balanceOf(seller.address);
      const buyerBefore = await usdc.balanceOf(buyer.address);
      const { id, due } = await fundInvoice(USDC(1000));
      await time.increaseTo(due); // no early discount at/after due date

      await core.connect(buyer).payInvoice(id);

      const inv = await core.getInvoice(id);
      expect(inv.status).to.equal(Status.PAID);

      // seller: +720 net advance, +80 stake back = +800 total
      expect(await usdc.balanceOf(seller.address) - sellerBefore).to.equal(USDC(800));
      // buyer: paid 1000 face, collateral round-trips → net -1000
      expect(buyerBefore - await usdc.balanceOf(buyer.address)).to.equal(USDC(1000));
      // insurance: 1% of face
      expect(await pool.insuranceReserve()).to.equal(USDC(10));
      // scores
      expect(await core.sellerPaidCount(seller.address)).to.equal(1);
      expect(await core.buyerPaidCount(buyer.address)).to.equal(1);
      await assertPoolInvariant();
    });

    it("payInvoice twice reverts WrongStatus", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const { id, due } = await fundInvoice(USDC(1000));
      await time.increaseTo(due);
      await core.connect(buyer).payInvoice(id);
      await expect(core.connect(buyer).payInvoice(id))
        .to.be.revertedWithCustomError(core, "WrongStatus");
    });

    it("payInvoice by non-buyer reverts NotBuyer", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const { id } = await fundInvoice(USDC(1000));
      await usdc.connect(stranger).approve(await core.getAddress(), ethers.MaxUint256);
      await usdc.mint(stranger.address, USDC(10_000));
      await expect(core.connect(stranger).payInvoice(id))
        .to.be.revertedWithCustomError(core, "NotBuyer");
    });

    it("early payment applies a discount (buyer pays < face)", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const { id } = await fundInvoice(USDC(1000)); // pay immediately, far from due
      const [amountDue, discount] = await core.earlyRepayAmount(id);
      expect(discount).to.be.greaterThan(0);
      expect(amountDue).to.equal(USDC(1000) - discount);

      // buyerBefore is captured AFTER funding (collateral already paid in lockCollateral),
      // so net here = amountDue - collateral refunded.
      const collateral = (await core.getInvoice(id)).collateral;
      const buyerBefore = await usdc.balanceOf(buyer.address);
      await core.connect(buyer).payInvoice(id);
      expect(buyerBefore - await usdc.balanceOf(buyer.address)).to.equal(amountDue - collateral);
    });

    it("rejectInvoice cancels and decrements seller total count", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const due = (await time.latest()) + 30 * DAY;
      await core.connect(seller).createInvoice(buyer.address, USDC(1000), due);
      expect(await core.sellerTotalCount(seller.address)).to.equal(1);
      await core.connect(buyer).rejectInvoice(0);
      expect((await core.getInvoice(0)).status).to.equal(Status.CANCELLED);
      expect(await core.sellerTotalCount(seller.address)).to.equal(0);
    });
  });

  // ─── Default waterfall ───────────────────────────────────────────────────────

  describe("Default waterfall", function () {
    it("markDefault before grace reverts GracePeriodNotExpired", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const { id } = await fundInvoice(USDC(1000));
      await expect(core.connect(stranger).markDefault(id))
        .to.be.revertedWithCustomError(core, "GracePeriodNotExpired");
    });

    it("markDefault after grace: DEFAULTED, slashes collateral + stake, draws insurance", async function () {
      // Seed insurance first via a paid invoice so we can observe a draw.
      await pool.connect(investor).deposit(USDC(100_000));
      {
        const { id, due } = await fundInvoice(USDC(1000));
        await time.increaseTo(due);
        await core.connect(buyer).payInvoice(id); // +10 insurance
      }
      const insBefore = await pool.insuranceReserve();
      expect(insBefore).to.equal(USDC(10));

      const { id, due } = await fundInvoice(USDC(1000));
      // After one paid cycle both parties have score 100 → seller advance 88%,
      // buyer collateral = max(5%, 100%-88%) = 12%, stake 5%. Read actual values.
      const inv = await core.getInvoice(id);
      await time.increaseTo(due + 7 * DAY + 1);

      await expect(core.connect(stranger).markDefault(id))
        .to.emit(core, "InvoiceDefaulted")
        .withArgs(id, seller.address, inv.collateral, inv.stake);

      expect((await core.getInvoice(id)).status).to.equal(Status.DEFAULTED);
      // shortfall (advance - collateral - stake) >> 10, so insurance fully drained
      expect(await pool.insuranceReserve()).to.equal(0);
      await assertPoolInvariant();
    });

    it("default with no recourse leaves LP loss = advance - collateral - stake", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const assetsBefore = await pool.investorAssets(); // 10_000
      const { id, due } = await fundInvoice(USDC(1000));
      await time.increaseTo(due + 7 * DAY + 1);
      await core.connect(stranger).markDefault(id);
      // recovered collateral(200)+stake(80); loss = 800 - 280 = 520
      expect(assetsBefore - await pool.investorAssets()).to.equal(USDC(520));
      await assertPoolInvariant();
    });
  });

  // ─── Tiers (CURRENT v3 behavior — documents bug #3, updated in Phase 2) ──────

  describe("Credit tiers (v3 current behavior)", function () {
    it("new seller: score 50, advance 8000 bps, stake 800 bps", async function () {
      // NOTE: Phase 2 changes the expected advance to 7500 / stake 1000 for unproven sellers.
      expect(await core.sellerScore(seller.address)).to.equal(50);
      expect(await core.sellerAdvanceBps(seller.address)).to.equal(8000);
      expect(await core.sellerStakeBps(seller.address)).to.equal(800);
    });

    it("perfect history caps advance at 8800 bps (Excellent)", async function () {
      await pool.connect(investor).deposit(USDC(100_000));
      for (let i = 0; i < 3; i++) {
        const { id, due } = await fundInvoice(USDC(100));
        await time.increaseTo(due);
        await core.connect(buyer).payInvoice(id);
      }
      expect(await core.sellerScore(seller.address)).to.equal(100);
      expect(await core.sellerAdvanceBps(seller.address)).to.equal(8800);
      expect(await core.sellerStakeBps(seller.address)).to.equal(500);
    });
  });

  // ─── Pool share math ─────────────────────────────────────────────────────────

  describe("Pool shares", function () {
    it("first deposit mints shares 1:1", async function () {
      await pool.connect(investor).deposit(USDC(1000));
      expect(await pool.shares(investor.address)).to.equal(USDC(1000));
      expect(await pool.totalShares()).to.equal(USDC(1000));
    });

    it("second deposit after yield gets diluted shares", async function () {
      await pool.connect(investor).deposit(USDC(1000));
      await usdc.mint(await pool.getAddress(), USDC(100)); // simulate yield
      await usdc.mint(stranger.address, USDC(1000));
      await usdc.connect(stranger).approve(await pool.getAddress(), ethers.MaxUint256);
      await pool.connect(stranger).deposit(USDC(1000));
      // 1000 * 1000 / 1100 = 909.0909
      expect(await pool.shares(stranger.address)).to.be.closeTo(909090909n, 1000n);
    });

    it("withdraw more shares than owned reverts InsufficientShares", async function () {
      await pool.connect(investor).deposit(USDC(1000));
      await expect(pool.connect(investor).withdraw(USDC(2000)))
        .to.be.revertedWithCustomError(pool, "InsufficientShares");
    });

    it("advanceFunds by non-core reverts Unauthorized", async function () {
      await pool.connect(investor).deposit(USDC(1000));
      await expect(pool.connect(stranger).advanceFunds(stranger.address, USDC(100)))
        .to.be.revertedWithCustomError(pool, "Unauthorized");
    });

    it("full cycle: investor earns the float spread", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const myShares = await pool.shares(investor.address);
      const { id, due } = await fundInvoice(USDC(1000));
      await time.increaseTo(due);
      await core.connect(buyer).payInvoice(id);

      const before = await usdc.balanceOf(investor.address);
      await pool.connect(investor).withdraw(myShares);
      const earned = (await usdc.balanceOf(investor.address)) - before;
      // pool advanced 800, got back 1000 face, minus 10 to insurance reserve
      // investor assets = 10_000 + (1000 - 800) - 10 = 10_190
      expect(earned).to.equal(USDC(10_190));
    });
  });

  // ─── SECURITY: self-dealing exploit (neutralized/bounded in Phase 2) ─────────

  describe("SECURITY — self-dealing", function () {
    it("self-dealing default drains ~52% of face from LPs (PRE-FIX baseline)", async function () {
      // Attacker controls both `seller` (A) and `buyer` (B).
      await pool.connect(investor).deposit(USDC(10_000));
      const lpBefore = await pool.investorAssets(); // 10_000

      const combinedBefore =
        (await usdc.balanceOf(seller.address)) + (await usdc.balanceOf(buyer.address));

      const { id, due } = await fundInvoice(USDC(1000));
      await time.increaseTo(due + 7 * DAY + 1);
      await core.connect(stranger).markDefault(id);

      const combinedAfter =
        (await usdc.balanceOf(seller.address)) + (await usdc.balanceOf(buyer.address));

      // Attacker net gain == LP net loss == advance - collateral - stake = 520
      expect(combinedAfter - combinedBefore).to.equal(USDC(520));
      expect(lpBefore - await pool.investorAssets()).to.equal(USDC(520));
      await assertPoolInvariant();
    });
  });
});
