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
      expect(inv.advance).to.equal(USDC(750)); // new (unproven) seller = 75%
      expect(inv.stake).to.equal(USDC(100));   // new seller = 10%
      expect(inv.collateral).to.equal(USDC(250)); // cover = 100% - 75% = 25%
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

      // net = advance(750) - stake(100) = 650
      expect(await usdc.balanceOf(seller.address) - sellerBefore).to.equal(USDC(650));
      expect((await core.getInvoice(id)).status).to.equal(Status.FUNDED);
      expect(await pool.totalLockedCollateral()).to.equal(USDC(250));
      expect(await pool.sellerStakeTotal()).to.equal(USDC(100));
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

      // seller: +650 net advance, +100 stake back = +750 total
      expect(await usdc.balanceOf(seller.address) - sellerBefore).to.equal(USDC(750));
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

  // ─── Partial repayment / installments ───────────────────────────────────────

  describe("Partial repayment", function () {
    it("settles after cumulative installments reach face value (once)", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const sellerBefore = await usdc.balanceOf(seller.address);
      const { id, due } = await fundInvoice(USDC(1000));

      await core.connect(buyer).payPartial(id, USDC(400));
      expect((await core.getInvoice(id)).amountPaid).to.equal(USDC(400));
      expect((await core.getInvoice(id)).status).to.equal(Status.FUNDED);

      await core.connect(buyer).payPartial(id, USDC(300));
      expect((await core.getInvoice(id)).status).to.equal(Status.FUNDED);

      // Final installment settles it.
      await expect(core.connect(buyer).payPartial(id, USDC(300)))
        .to.emit(core, "InvoicePaid");

      const inv = await core.getInvoice(id);
      expect(inv.status).to.equal(Status.PAID);
      expect(inv.amountPaid).to.equal(USDC(1000));
      // seller got net advance 650 + stake 100 back = 750; scored once
      expect(await usdc.balanceOf(seller.address) - sellerBefore).to.equal(USDC(750));
      expect(await core.sellerPaidCount(seller.address)).to.equal(1);
      expect(await pool.insuranceReserve()).to.equal(USDC(10)); // funded once
      await assertPoolInvariant();
      void due;
    });

    it("overpaying a partial reverts", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const { id } = await fundInvoice(USDC(1000));
      await core.connect(buyer).payPartial(id, USDC(600));
      await expect(core.connect(buyer).payPartial(id, USDC(500)))
        .to.be.revertedWithCustomError(core, "Overpayment");
    });

    it("payInvoice after a partial pays only the discounted remainder", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const { id } = await fundInvoice(USDC(1000));
      await core.connect(buyer).payPartial(id, USDC(600));

      const [amountDue, discount] = await core.earlyRepayAmount(id);
      expect(discount).to.be.greaterThan(0);           // remainder paid early
      expect(amountDue).to.equal(USDC(400) - discount); // discount on the 400 remainder

      const buyerBefore = await usdc.balanceOf(buyer.address);
      await core.connect(buyer).payInvoice(id);
      // pays discounted remainder, then collateral refunds → net = amountDue - collateral
      const collateral = (await core.getInvoice(id)).collateral;
      expect(buyerBefore - await usdc.balanceOf(buyer.address)).to.equal(amountDue - collateral);
      expect((await core.getInvoice(id)).status).to.equal(Status.PAID);
      await assertPoolInvariant();
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
      // recovered collateral(250)+stake(100); loss = 750 - 350 = 400
      expect(assetsBefore - await pool.investorAssets()).to.equal(USDC(400));
      await assertPoolInvariant();
    });
  });

  // ─── Tiers (CURRENT v3 behavior — documents bug #3, updated in Phase 2) ──────

  describe("Credit tiers", function () {
    it("unproven seller starts in New tier: advance 7500 bps, stake 1000 bps", async function () {
      expect(await core.sellerAdvanceBps(seller.address)).to.equal(7500);
      expect(await core.sellerStakeBps(seller.address)).to.equal(1000);
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
    const DEAD = "0x000000000000000000000000000000000000dEaD";

    it("first deposit mints shares 1:1 minus locked dead shares", async function () {
      await pool.connect(investor).deposit(USDC(1000));
      const dead = await pool.DEAD_SHARES();
      expect(await pool.balanceOf(investor.address)).to.equal(USDC(1000) - dead);
      expect(await pool.totalSupply()).to.equal(USDC(1000));
      expect(await pool.balanceOf(DEAD)).to.equal(dead);
      // backward-compatible aliases still work
      expect(await pool.shares(investor.address)).to.equal(USDC(1000) - dead);
      expect(await pool.totalShares()).to.equal(USDC(1000));
    });

    it("first deposit below the minimum reverts", async function () {
      await expect(pool.connect(investor).deposit(USDC(0.5)))
        .to.be.revertedWithCustomError(pool, "BelowMinFirstDeposit");
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
      // pool advanced 750, got back 1000 face, minus 10 to insurance reserve
      // investor assets = 10_000 + (1000 - 750) - 10 = 10_240
      // (dead shares keep a dust amount permanently locked → closeTo)
      expect(earned).to.be.closeTo(USDC(10_240), 2000n);
    });

    it("fLP is a transferable ERC20: recipient can withdraw transferred shares", async function () {
      expect(await pool.decimals()).to.equal(6);
      expect(await pool.symbol()).to.equal("fLP");

      await pool.connect(investor).deposit(USDC(10_000));
      const half = (await pool.balanceOf(investor.address)) / 2n;
      await pool.connect(investor).transfer(stranger.address, half);
      expect(await pool.balanceOf(stranger.address)).to.equal(half);

      const before = await usdc.balanceOf(stranger.address);
      await pool.connect(stranger).withdraw(half);
      expect(await usdc.balanceOf(stranger.address)).to.be.greaterThan(before);
      expect(await pool.balanceOf(stranger.address)).to.equal(0);
    });

    it("dead shares + min deposit neutralize the inflation/donation attack", async function () {
      // Attacker first-deposits the minimum, then donates a large amount directly.
      await usdc.mint(stranger.address, USDC(100_000));
      await usdc.connect(stranger).approve(await pool.getAddress(), ethers.MaxUint256);
      await pool.connect(stranger).deposit(USDC(1)); // attacker, min first deposit
      await usdc.connect(stranger).transfer(await pool.getAddress(), USDC(10_000)); // donation

      // Victim deposits a normal amount and must still receive fairly-priced, non-zero shares.
      await pool.connect(investor).deposit(USDC(10_000));
      const victimShares = await pool.balanceOf(investor.address);
      expect(victimShares).to.be.greaterThan(0);

      // Victim's shares are worth ~what they put in (not stolen by the attacker).
      const value = (victimShares * await pool.shareValue()) / (10n ** 18n);
      expect(value).to.be.closeTo(USDC(10_000), USDC(50));
    });
  });

  // ─── SECURITY: self-dealing exploit (neutralized/bounded in Phase 2) ─────────

  describe("SECURITY — self-dealing", function () {
    it("self-dealing default still extracts value when no caps are set (testnet default)", async function () {
      // Attacker controls both `seller` (A) and `buyer` (B). With caps off (testnet
      // default) the structural loss persists — bounded only by the exposure cap below.
      await pool.connect(investor).deposit(USDC(10_000));
      const lpBefore = await pool.investorAssets(); // 10_000

      const combinedBefore =
        (await usdc.balanceOf(seller.address)) + (await usdc.balanceOf(buyer.address));

      const { id, due } = await fundInvoice(USDC(1000));
      await time.increaseTo(due + 7 * DAY + 1);
      await core.connect(stranger).markDefault(id);

      const combinedAfter =
        (await usdc.balanceOf(seller.address)) + (await usdc.balanceOf(buyer.address));

      // Attacker net gain == LP net loss == advance - collateral - stake = 400
      expect(combinedAfter - combinedBefore).to.equal(USDC(400));
      expect(lpBefore - await pool.investorAssets()).to.equal(USDC(400));
      await assertPoolInvariant();
    });

    it("exposure cap bounds the blast radius of a single seller", async function () {
      await pool.connect(investor).deposit(USDC(100_000));
      // Cap a seller at 1000 USDC of outstanding advance.
      await core.connect(owner).setMaxOutstandingPerSeller(USDC(1000));

      // First invoice (advance 750) funds fine.
      await fundInvoice(USDC(1000));
      // Second concurrent invoice would push outstanding to 1500 > 1000 → blocked at lock.
      const due = (await time.latest()) + 30 * DAY;
      await core.connect(seller).createInvoice(buyer.address, USDC(1000), due);
      const id2 = (await core.invoiceCount()) - 1n;
      await core.connect(buyer).approveInvoice(id2);
      await expect(core.connect(buyer).lockCollateral(id2))
        .to.be.revertedWithCustomError(core, "ExposureCapExceeded");

      // Outstanding frees up after repayment, then a new invoice can fund again.
      await core.connect(buyer).payInvoice(0);
      expect(await core.outstandingAdvance(seller.address)).to.equal(0);
    });
  });

  // ─── Anti-Sybil config (OFF by default; opt-in for production) ───────────────

  describe("Verification gate (off by default)", function () {
    it("is disabled by default — unverified parties transact freely", async function () {
      expect(await core.verificationRequired()).to.equal(false);
      await pool.connect(investor).deposit(USDC(10_000));
      await expect(fundInvoice(USDC(1000))).to.not.be.reverted;
    });

    it("when enabled, unverified seller/buyer are blocked until verified", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      await core.connect(owner).setVerificationRequired(true);

      const due = (await time.latest()) + 30 * DAY;
      await expect(core.connect(seller).createInvoice(buyer.address, USDC(1000), due))
        .to.be.revertedWithCustomError(core, "NotVerified");

      await core.connect(owner).setVerified(seller.address, true);
      await core.connect(owner).setVerified(buyer.address, true);
      await expect(core.connect(seller).createInvoice(buyer.address, USDC(1000), due))
        .to.not.be.reverted;
    });

    it("setVerified by a random account reverts NotAttestor", async function () {
      await expect(core.connect(stranger).setVerified(stranger.address, true))
        .to.be.revertedWithCustomError(core, "NotAttestor");
    });
  });

  // ─── Misc fixes ──────────────────────────────────────────────────────────────

  describe("Misc fixes", function () {
    it("insurance accrues 1% of face and stays bounded by 10% of investor assets", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const { id, due } = await fundInvoice(USDC(1000));
      await time.increaseTo(due);
      await core.connect(buyer).payInvoice(id);

      expect(await pool.insuranceReserve()).to.equal(USDC(10)); // exactly 1% of face, under cap
      const assets = await pool.investorAssets();
      expect(await pool.insuranceReserve()).to.be.lessThanOrEqual((assets * 1000n) / 10000n);
      await assertPoolInvariant();
    });

    it("insurance does not grow once it exceeds the 10% cap (no unbounded lock)", async function () {
      await pool.connect(investor).deposit(USDC(100_000));
      // Accrue reserve = 1% of 10_000 = 100.
      {
        const { id, due } = await fundInvoice(USDC(10_000));
        await time.increaseTo(due);
        await core.connect(buyer).payInvoice(id);
      }
      expect(await pool.insuranceReserve()).to.equal(USDC(100));

      // Drain most LP capital so the 100 reserve is now well above 10% of remaining assets.
      const myShares = await pool.shares(investor.address);
      await pool.connect(investor).withdraw((myShares * 999n) / 1000n);
      expect(await pool.investorAssets()).to.be.lessThan(USDC(1000)); // target < 100

      // A further paid invoice must NOT grow the reserve (clamp branch).
      const { id, due } = await fundInvoice(USDC(20));
      await time.increaseTo(due);
      await core.connect(buyer).payInvoice(id);
      expect(await pool.insuranceReserve()).to.equal(USDC(100)); // unchanged → fee became LP yield
      await assertPoolInvariant();
    });

    it("re-checks the 20% size cap at lockCollateral if the pool shrank", async function () {
      // Two investors. Create an invoice while liquidity is high, then drain liquidity
      // so the advance now exceeds 20% of what remains, and assert lock reverts.
      await pool.connect(investor).deposit(USDC(10_000));
      const due = (await time.latest()) + 30 * DAY;
      await core.connect(seller).createInvoice(buyer.address, USDC(1000), due); // advance 750
      const id = (await core.invoiceCount()) - 1n;
      await core.connect(buyer).approveInvoice(id);

      // Investor withdraws most liquidity → 750 now > 20% of remaining.
      const myShares = await pool.shares(investor.address);
      await pool.connect(investor).withdraw((myShares * 8n) / 10n); // leave ~2000
      await expect(core.connect(buyer).lockCollateral(id))
        .to.be.revertedWithCustomError(core, "InvoiceTooLarge");
    });

    it("collateral timeout clock starts at approval, not creation", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const due = (await time.latest()) + 60 * DAY;
      await core.connect(seller).createInvoice(buyer.address, USDC(1000), due);
      const id = (await core.invoiceCount()) - 1n;

      // Approve late (after the old createdAt-based window would have nearly elapsed).
      await time.increase(60 * 3600); // 60h after creation
      await core.connect(buyer).approveInvoice(id);

      // Immediately after approval the collateral window is NOT yet cancelable.
      await expect(core.connect(stranger).cancelCollateralTimeout(id))
        .to.be.revertedWithCustomError(core, "CollateralTimeoutNotReached");

      // After the full COLLATERAL_TIMEOUT from approval, it is cancelable.
      await time.increase(48 * 3600 + 1);
      await expect(core.connect(stranger).cancelCollateralTimeout(id)).to.not.be.reverted;
      expect((await core.getInvoice(id)).status).to.equal(Status.CANCELLED);
    });
  });
});
