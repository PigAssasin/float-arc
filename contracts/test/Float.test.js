const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const USDC = (n) => ethers.parseUnits(String(n), 6);
const DAY = 24 * 3600;

const Status = {
  PENDING_APPROVAL: 0,
  PENDING_COLLATERAL: 1,
  FUNDED: 2,
  PAID: 3,
  DEFAULTED: 4,
  CANCELLED: 5,
};

// v6 numbers for a New seller + VERIFIED New buyer, 30-day invoice, face F:
//   advance 80%, stake 5%, light collateral 25%, fee 3% (New buyer, 1 period)
//   net disbursed = advance - stake = 75%; residual = face - advance - fee = 17%
//   fee split: protocol 10%, insurance 15%, LP 75%
describe("Float v6 — economic recalibration", function () {
  let owner, investor, seller, buyer, stranger;
  let usdc, pool, core;

  async function assertPoolInvariant() {
    const bal = await usdc.balanceOf(await pool.getAddress());
    const inv = await pool.investorAssets();
    const collateral = await pool.totalLockedCollateral();
    const stake = await pool.sellerStakeTotal();
    const insurance = await pool.insuranceReserve();
    expect(inv + collateral + stake + insurance).to.equal(bal);
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

    // Verify the main buyer so existing flows use light tier collateral.
    await core.connect(owner).setVerified(buyer.address, true);
    // Treasury for protocol fee = a separate account so we can measure it.
    await core.connect(owner).setTreasury(stranger.address);

    await usdc.mint(stranger.address, USDC(1_000_000));
    await usdc.connect(stranger).approve(await core.getAddress(), ethers.MaxUint256);
  });

  async function fundInvoice(face, dueOffsetDays = 30) {
    const due = (await time.latest()) + dueOffsetDays * DAY;
    await core.connect(seller).createInvoice(buyer.address, face, due);
    const id = (await core.invoiceCount()) - 1n;
    await core.connect(buyer).approveInvoice(id);
    await core.connect(buyer).lockCollateral(id);
    return { id, due };
  }

  // ─── Lifecycle + settlement ──────────────────────────────────────────────────
  describe("Lifecycle + v6 settlement", function () {
    it("createInvoice prices advance/stake/collateral/fee per v6 tiers", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const due = (await time.latest()) + 30 * DAY;
      await core.connect(seller).createInvoice(buyer.address, USDC(1000), due);
      const inv = await core.getInvoice(0);
      expect(inv.advance).to.equal(USDC(800));    // New seller 80%
      expect(inv.stake).to.equal(USDC(50));       // New seller 5%
      expect(inv.collateral).to.equal(USDC(250)); // verified New buyer 25%
      expect(inv.fee).to.equal(USDC(30));         // New buyer 3% x 1 period
      await assertPoolInvariant();
    });

    it("lockCollateral disburses advance net of stake, sets FUNDED", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const before = await usdc.balanceOf(seller.address);
      const { id } = await fundInvoice(USDC(1000));
      expect((await core.getInvoice(id)).status).to.equal(Status.FUNDED);
      // net disbursed = advance 800 - stake 50 = 750
      expect((await usdc.balanceOf(seller.address)) - before).to.equal(USDC(750));
      await assertPoolInvariant();
    });

    it("payInvoice: seller true cost = fee; gets residual + stake back; collateral returns to buyer", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const sBefore = await usdc.balanceOf(seller.address);
      const bBefore = await usdc.balanceOf(buyer.address);
      const tBefore = await usdc.balanceOf(stranger.address); // treasury
      const { id, due } = await fundInvoice(USDC(1000));
      await time.increaseTo(due);
      await core.connect(buyer).payInvoice(id);

      // seller net over life = face - fee = 1000 - 30 = 970
      expect((await usdc.balanceOf(seller.address)) - sBefore).to.equal(USDC(970));
      // buyer paid face, got collateral back: net -1000
      expect((await usdc.balanceOf(buyer.address)) - bBefore).to.equal(-USDC(1000));
      // protocol cut = 10% of fee 30 = 3
      expect((await usdc.balanceOf(stranger.address)) - tBefore).to.equal(USDC(3));
      expect((await core.getInvoice(id)).status).to.equal(Status.PAID);
      await assertPoolInvariant();
    });

    it("LP earns exactly the 75% fee share over a full cycle", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const myShares = await pool.shares(investor.address);
      const { id, due } = await fundInvoice(USDC(1000));
      await time.increaseTo(due);
      await core.connect(buyer).payInvoice(id);
      const before = await usdc.balanceOf(investor.address);
      await pool.connect(investor).withdraw(myShares);
      const earned = (await usdc.balanceOf(investor.address)) - before;
      // LP share = 75% of fee 30 = 22.5 (closeTo for dead-share dust)
      expect(earned).to.be.closeTo(USDC(10_022.5), USDC(0.5));
      await assertPoolInvariant();
    });

    it("no early-repay discount in v6: buyer pays full face", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const { id } = await fundInvoice(USDC(1000), 60); // pay early (well before due)
      const [amountDue, discount] = await core.earlyRepayAmount(id);
      expect(amountDue).to.equal(USDC(1000));
      expect(discount).to.equal(0);
    });

    it("partial payments settle once at face; seller still nets face - fee", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const sBefore = await usdc.balanceOf(seller.address);
      const { id } = await fundInvoice(USDC(1000));
      await core.connect(buyer).payPartial(id, USDC(400));
      expect((await core.getInvoice(id)).status).to.equal(Status.FUNDED);
      await core.connect(buyer).payPartial(id, USDC(600));
      expect((await core.getInvoice(id)).status).to.equal(Status.PAID);
      expect((await usdc.balanceOf(seller.address)) - sBefore).to.equal(USDC(970));
      await assertPoolInvariant();
    });

    it("overpaying a partial reverts", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const { id } = await fundInvoice(USDC(1000));
      await expect(core.connect(buyer).payPartial(id, USDC(1100)))
        .to.be.revertedWithCustomError(core, "Overpayment");
    });
  });

  // ─── Tiers + score gates ──────────────────────────────────────────────────────
  describe("Tiers + score gates", function () {
    it("New (unproven) seller: advance 8000, stake 500", async function () {
      expect(await core.sellerAdvanceBps(seller.address)).to.equal(8000);
      expect(await core.sellerStakeBps(seller.address)).to.equal(500);
      expect(await core.sellerTier(seller.address)).to.equal(0);
    });

    it("a single 1/1 cannot reach Excellent (count gate)", async function () {
      await pool.connect(investor).deposit(USDC(100_000));
      const { id, due } = await fundInvoice(USDC(100));
      await time.increaseTo(due);
      await core.connect(buyer).payInvoice(id);
      // 1 paid, ratio 100 -> still New (needs >=2 for Fair)
      expect(await core.sellerTier(seller.address)).to.equal(0);
    });

    it("tiers climb with paid count: Fair at 2, Good at 5", async function () {
      await pool.connect(investor).deposit(USDC(100_000));
      const cycle = async () => {
        const { id, due } = await fundInvoice(USDC(100));
        await time.increaseTo(due);
        await core.connect(buyer).payInvoice(id);
      };
      await cycle(); await cycle();
      expect(await core.sellerTier(seller.address)).to.equal(1); // Fair >=2
      await cycle(); await cycle(); await cycle();
      expect(await core.sellerTier(seller.address)).to.equal(2); // Good >=5
      expect(await core.sellerAdvanceBps(seller.address)).to.equal(8800);
    });

    it("buyer fee rate falls as buyer tier rises", async function () {
      expect(await core.buyerFeeBpsPer30d(buyer.address)).to.equal(300); // New
      expect(await core.feeBpsForTerm(buyer.address, 30 * DAY)).to.equal(300);
      expect(await core.feeBpsForTerm(buyer.address, 45 * DAY)).to.equal(600); // 2 periods
    });

    it("fee is capped at 8%", async function () {
      // New buyer 3%/30d; 120 days = 4 periods = 12% -> capped to 8%
      expect(await core.feeBpsForTerm(buyer.address, 120 * DAY)).to.equal(800);
    });
  });

  // ─── Default ───────────────────────────────────────────────────────────────────
  describe("Default", function () {
    it("markDefault before grace reverts", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const { id, due } = await fundInvoice(USDC(1000));
      await time.increaseTo(due + 1);
      await expect(core.connect(owner).markDefault(id))
        .to.be.revertedWithCustomError(core, "GracePeriodNotExpired");
    });

    it("default slashes collateral + stake; LP loss = advance - collateral - stake", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const lpBefore = await pool.investorAssets();
      const { id, due } = await fundInvoice(USDC(1000));
      await time.increaseTo(due + 7 * DAY + 1);
      await core.connect(owner).markDefault(id);
      expect((await core.getInvoice(id)).status).to.equal(Status.DEFAULTED);
      // advance 800 - collateral 250 - stake 50 = 500 LP loss (no insurance yet)
      expect(lpBefore - (await pool.investorAssets())).to.equal(USDC(500));
      await assertPoolInvariant();
    });
  });

  // ─── v5 strict collateral (still ON) ────────────────────────────────────────────
  describe("Strict collateral (v5, carried)", function () {
    it("UNVERIFIED buyer fully collateralized: collateral + stake >= advance", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const due = (await time.latest()) + 30 * DAY;
      await core.connect(seller).createInvoice(stranger.address, USDC(1000), due);
      const inv = await core.getInvoice(0);
      // advance 800, stake 50 -> floor collateral = 750
      expect(inv.advance).to.equal(USDC(800));
      expect(inv.collateral).to.equal(USDC(750));
      expect(inv.collateral + inv.stake).to.be.greaterThanOrEqual(inv.advance);
    });

    it("strict ON by default; verified buyer keeps light 25%", async function () {
      expect(await core.strictCollateralEnabled()).to.equal(true);
      await pool.connect(investor).deposit(USDC(10_000));
      const due = (await time.latest()) + 30 * DAY;
      await core.connect(seller).createInvoice(buyer.address, USDC(1000), due);
      expect((await core.getInvoice(0)).collateral).to.equal(USDC(250));
    });
  });

  // ─── Caps + verification ────────────────────────────────────────────────────────
  describe("Caps + verification", function () {
    it("per-seller exposure cap blocks at lock", async function () {
      await pool.connect(investor).deposit(USDC(100_000));
      await core.connect(owner).setMaxOutstandingPerSeller(USDC(900));
      await fundInvoice(USDC(1000)); // advance 800
      const due = (await time.latest()) + 30 * DAY;
      await core.connect(seller).createInvoice(buyer.address, USDC(1000), due);
      const id2 = (await core.invoiceCount()) - 1n;
      await core.connect(buyer).approveInvoice(id2);
      await expect(core.connect(buyer).lockCollateral(id2))
        .to.be.revertedWithCustomError(core, "ExposureCapExceeded");
    });

    it("per-buyer exposure cap blocks at lock", async function () {
      await pool.connect(investor).deposit(USDC(100_000));
      await core.connect(owner).setMaxOutstandingPerBuyer(USDC(900));
      await fundInvoice(USDC(1000));
      const due = (await time.latest()) + 30 * DAY;
      await core.connect(seller).createInvoice(buyer.address, USDC(1000), due);
      const id2 = (await core.invoiceCount()) - 1n;
      await core.connect(buyer).approveInvoice(id2);
      await expect(core.connect(buyer).lockCollateral(id2))
        .to.be.revertedWithCustomError(core, "BuyerExposureCapExceeded");
    });

    it("verification gate off by default; blocks when on", async function () {
      expect(await core.verificationRequired()).to.equal(false);
      await pool.connect(investor).deposit(USDC(10_000));
      await core.connect(owner).setVerificationRequired(true);
      const due = (await time.latest()) + 30 * DAY;
      await expect(core.connect(seller).createInvoice(buyer.address, USDC(1000), due))
        .to.be.revertedWithCustomError(core, "NotVerified");
    });
  });

  // ─── Pool mechanics (carried) ───────────────────────────────────────────────────
  describe("Pool", function () {
    it("first deposit mints shares 1:1 minus dead shares", async function () {
      await pool.connect(investor).deposit(USDC(1000));
      const dead = await pool.DEAD_SHARES();
      expect(await pool.balanceOf(investor.address)).to.equal(USDC(1000) - dead);
    });

    it("first deposit below minimum reverts", async function () {
      await expect(pool.connect(investor).deposit(USDC(0.5)))
        .to.be.revertedWithCustomError(pool, "BelowMinFirstDeposit");
    });

    it("dead shares + min deposit neutralize the inflation attack", async function () {
      await usdc.connect(stranger).approve(await pool.getAddress(), ethers.MaxUint256);
      await pool.connect(stranger).deposit(USDC(1));
      await usdc.connect(stranger).transfer(await pool.getAddress(), USDC(10_000));
      await pool.connect(investor).deposit(USDC(10_000));
      const v = await pool.balanceOf(investor.address);
      expect(v).to.be.greaterThan(0);
      const value = (v * (await pool.shareValue())) / (10n ** 18n);
      expect(value).to.be.closeTo(USDC(10_000), USDC(50));
    });

    it("payTo by non-core reverts Unauthorized", async function () {
      await pool.connect(investor).deposit(USDC(1000));
      await expect(pool.connect(stranger).payTo(stranger.address, USDC(10)))
        .to.be.revertedWithCustomError(pool, "Unauthorized");
    });

    it("insurance accrues 15% of fee, bounded by 10% of investor assets", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const { id, due } = await fundInvoice(USDC(1000));
      await time.increaseTo(due);
      await core.connect(buyer).payInvoice(id);
      // insurance = 15% of fee 30 = 4.5
      expect(await pool.insuranceReserve()).to.equal(USDC(4.5));
      await assertPoolInvariant();
    });
  });

  // ─── Timeouts (carried) ─────────────────────────────────────────────────────────
  describe("Timeouts", function () {
    it("collateral timeout clock starts at approval", async function () {
      await pool.connect(investor).deposit(USDC(10_000));
      const due = (await time.latest()) + 60 * DAY;
      await core.connect(seller).createInvoice(buyer.address, USDC(1000), due);
      const id = (await core.invoiceCount()) - 1n;
      await time.increase(60 * 3600);
      await core.connect(buyer).approveInvoice(id);
      await expect(core.connect(stranger).cancelCollateralTimeout(id))
        .to.be.revertedWithCustomError(core, "CollateralTimeoutNotReached");
      await time.increase(48 * 3600 + 1);
      await expect(core.connect(stranger).cancelCollateralTimeout(id)).to.not.be.reverted;
      expect((await core.getInvoice(id)).status).to.equal(Status.CANCELLED);
    });
  });
});
