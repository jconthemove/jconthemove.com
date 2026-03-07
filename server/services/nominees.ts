import { pool } from "../db";
import { db } from "../db";
import { walletAccounts, rewards, users } from "@shared/schema";
import { eq } from "drizzle-orm";

export const GENEROSITY_FUND_ID = "platform-generosity-fund";
const NOMINEES_POOL_PERCENT = 0.01;
const GENEROSITY_FUND_PERCENT = 0.10;

export interface Nominee {
  id: number;
  name: string;
  description: string | null;
  wallet_user_id: string;
  is_active: boolean;
  added_by: string | null;
  created_at: string;
}

export async function ensureNomineesTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS nominees (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        wallet_user_id TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        added_by TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS generosity_fund_log (
        id SERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        original_amount NUMERIC NOT NULL,
        fund_amount NUMERIC NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await ensureGenerosityFundAccount();
    await seedFirstNominee();

    console.log("🤝 Nominees table ready");
  } catch (err) {
    console.error("[Nominees] Setup error:", err);
  }
}

async function ensureGenerosityFundAccount(): Promise<void> {
  try {
    const [existing] = await db.select().from(users).where(eq(users.id, GENEROSITY_FUND_ID)).limit(1);
    if (!existing) {
      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash("JCMovesGenerosity2026!", 12);
      await db.insert(users).values({
        id: GENEROSITY_FUND_ID,
        email: "generosity.fund@jconthemove.internal",
        passwordHash,
        firstName: "Generosity",
        lastName: "Fund",
        role: "customer",
        status: "active",
        tosAccepted: true,
        rewardsEnrolled: true,
      });
    }
    const [wallet] = await db.select().from(walletAccounts).where(eq(walletAccounts.userId, GENEROSITY_FUND_ID)).limit(1);
    if (!wallet) {
      await db.insert(walletAccounts).values({
        userId: GENEROSITY_FUND_ID,
        tokenBalance: "0.00000000",
        cashBalance: "0.00",
        totalEarned: "0.00000000",
        totalRedeemed: "0.00000000",
        totalCashedOut: "0.00",
        lastActivity: new Date(),
      });
      console.log("💚 Platform Generosity Fund account created");
    }
  } catch (err) {
    console.error("[Nominees] Generosity fund account error:", err);
  }
}

async function ensureNomineeAccount(walletUserId: string, name: string): Promise<void> {
  const [existing] = await db.select().from(users).where(eq(users.id, walletUserId)).limit(1);
  if (!existing) {
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.hash("JCMovesNominee2026!", 12);
    const nameParts = name.trim().split(" ");
    await db.insert(users).values({
      id: walletUserId,
      email: `${walletUserId}@jconthemove.internal`,
      passwordHash: hash,
      firstName: nameParts[0] || name,
      lastName: nameParts.slice(1).join(" ") || "",
      role: "customer",
      status: "active",
      tosAccepted: true,
      rewardsEnrolled: true,
    });
  }
  const [wallet] = await db.select().from(walletAccounts).where(eq(walletAccounts.userId, walletUserId)).limit(1);
  if (!wallet) {
    await db.insert(walletAccounts).values({
      userId: walletUserId,
      tokenBalance: "0.00000000",
      cashBalance: "0.00",
      totalEarned: "0.00000000",
      totalRedeemed: "0.00000000",
      totalCashedOut: "0.00",
      lastActivity: new Date(),
    });
  }
}

async function seedFirstNominee(): Promise<void> {
  try {
    const { rowCount } = await pool.query(`SELECT 1 FROM nominees LIMIT 1`);
    if (rowCount && rowCount > 0) return;

    const mewbournId = "nominee-mewbourn-mom";
    await ensureNomineeAccount(mewbournId, "Mewbourn Family");
    await pool.query(
      `INSERT INTO nominees (name, description, wallet_user_id, is_active, added_by) VALUES ($1, $2, $3, TRUE, $4)`,
      [
        "Mewbourn Family",
        "Nominated by Timothy Mewbourn — earning JCMOVES for life with love from the team",
        mewbournId,
        "JC ON THE MOVE",
      ]
    );
    console.log("🤝 Tim Mewbourn's family nominated as first recipient");
  } catch (err) {
    console.error("[Nominees] Seed error:", err);
  }
}

export async function getActiveNominees(): Promise<Nominee[]> {
  const { rows } = await pool.query(
    `SELECT id, name, description, wallet_user_id, is_active, added_by, created_at FROM nominees ORDER BY created_at ASC LIMIT 3`
  );
  return rows;
}

export async function addNominee(name: string, description: string, addedBy: string): Promise<Nominee> {
  const { rows: existing } = await pool.query(`SELECT COUNT(*) as cnt FROM nominees WHERE is_active = TRUE`);
  if (parseInt(existing[0].cnt) >= 3) {
    throw new Error("Maximum 3 active nominees allowed");
  }
  const walletUserId = `nominee-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;
  await ensureNomineeAccount(walletUserId, name);
  const { rows } = await pool.query(
    `INSERT INTO nominees (name, description, wallet_user_id, is_active, added_by) VALUES ($1, $2, $3, TRUE, $4) RETURNING *`,
    [name, description || null, walletUserId, addedBy]
  );
  return rows[0];
}

export async function toggleNominee(id: number, isActive: boolean): Promise<void> {
  await pool.query(`UPDATE nominees SET is_active = $1 WHERE id = $2`, [isActive, id]);
}

export async function creditNominees(originalAmount: number, source: string = "token_flow"): Promise<void> {
  try {
    if (originalAmount <= 0) return;
    const nominees = await getActiveNominees();
    const activeNominees = nominees.filter(n => n.is_active);
    if (activeNominees.length === 0) return;

    const poolTotal = parseFloat((originalAmount * NOMINEES_POOL_PERCENT).toFixed(8));
    if (poolTotal <= 0) return;
    const perNominee = parseFloat((poolTotal / activeNominees.length).toFixed(8));
    if (perNominee <= 0) return;

    for (const nominee of activeNominees) {
      const [wallet] = await db
        .select()
        .from(walletAccounts)
        .where(eq(walletAccounts.userId, nominee.wallet_user_id))
        .limit(1);
      if (!wallet) continue;

      const currentBalance = parseFloat(wallet.tokenBalance || "0");
      const currentEarned = parseFloat(wallet.totalEarned || "0");
      await db
        .update(walletAccounts)
        .set({
          tokenBalance: (currentBalance + perNominee).toFixed(8),
          totalEarned: (currentEarned + perNominee).toFixed(8),
          lastActivity: new Date(),
        })
        .where(eq(walletAccounts.userId, nominee.wallet_user_id));
    }
  } catch (err) {
    console.error("[Nominees] Credit error:", err);
  }
}

export async function creditPlatformGenerosityFund(originalAmount: number, source: string = "token_flow"): Promise<void> {
  try {
    if (originalAmount <= 0) return;
    const contribution = parseFloat((originalAmount * GENEROSITY_FUND_PERCENT).toFixed(8));
    if (contribution <= 0) return;

    const [wallet] = await db
      .select()
      .from(walletAccounts)
      .where(eq(walletAccounts.userId, GENEROSITY_FUND_ID))
      .limit(1);
    if (!wallet) return;

    const currentBalance = parseFloat(wallet.tokenBalance || "0");
    const currentEarned = parseFloat(wallet.totalEarned || "0");
    await db
      .update(walletAccounts)
      .set({
        tokenBalance: (currentBalance + contribution).toFixed(8),
        totalEarned: (currentEarned + contribution).toFixed(8),
        lastActivity: new Date(),
      })
      .where(eq(walletAccounts.userId, GENEROSITY_FUND_ID));

    await pool.query(
      `INSERT INTO generosity_fund_log (source, original_amount, fund_amount) VALUES ($1, $2, $3)`,
      [source, originalAmount, contribution]
    );
  } catch (err) {
    console.error("[GenerosityFund] Credit error:", err);
  }
}

export async function getGenerosityFundStats(): Promise<{ balance: number; totalCollected: number; totalDonated: number }> {
  try {
    const [wallet] = await db
      .select()
      .from(walletAccounts)
      .where(eq(walletAccounts.userId, GENEROSITY_FUND_ID))
      .limit(1);
    const { rows } = await pool.query(`SELECT COALESCE(SUM(fund_amount),0) as total FROM generosity_fund_log`);
    return {
      balance: parseFloat(wallet?.tokenBalance || "0"),
      totalCollected: parseFloat(rows[0]?.total || "0"),
      totalDonated: parseFloat(wallet?.totalRedeemed || "0"),
    };
  } catch {
    return { balance: 0, totalCollected: 0, totalDonated: 0 };
  }
}
