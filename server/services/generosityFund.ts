import { db } from "../db";
import { walletAccounts, rewards, users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export const MOMS_USER_ID = "nicolasa-jackson-generosity";

const BONUS_PERCENT = 0.01;

export async function creditGenerosityFund(
  earnedAmount: number,
  source: string = "token_reward"
): Promise<void> {
  try {
    if (earnedAmount <= 0) return;

    const bonus = parseFloat((earnedAmount * BONUS_PERCENT).toFixed(8));
    if (bonus <= 0) return;

    const [wallet] = await db
      .select()
      .from(walletAccounts)
      .where(eq(walletAccounts.userId, MOMS_USER_ID))
      .limit(1);

    if (!wallet) return;

    const currentBalance = parseFloat(wallet.tokenBalance || "0");
    const currentEarned = parseFloat(wallet.totalEarned || "0");

    await db
      .update(walletAccounts)
      .set({
        tokenBalance: (currentBalance + bonus).toFixed(8),
        totalEarned: (currentEarned + bonus).toFixed(8),
        lastActivity: new Date(),
      })
      .where(eq(walletAccounts.userId, MOMS_USER_ID));

    await db.insert(rewards).values({
      userId: MOMS_USER_ID,
      rewardType: "generosity_fund",
      tokenAmount: bonus.toFixed(8),
      cashValue: (bonus * 0.01).toFixed(4),
      status: "confirmed",
      earnedDate: new Date(),
      metadata: {
        source,
        originalAmount: earnedAmount,
        bonusPercent: 1,
        description: "1% generosity fund - Best Mom of All Time",
      },
    });
  } catch (err) {
    console.error("[GenerosityFund] Non-blocking error:", err);
  }
}

export async function ensureMomsAccount(): Promise<void> {
  try {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, MOMS_USER_ID))
      .limit(1);

    if (!existing) {
      const bcrypt = await import("bcrypt");
      const passwordHash = await bcrypt.hash("JCMove2024!Mama", 12);

      await db.insert(users).values({
        id: MOMS_USER_ID,
        email: "nicolasa.jackson@jconthemove.internal",
        passwordHash,
        firstName: "Nicolasa",
        lastName: "Jackson",
        role: "customer",
        status: "active",
        tosAccepted: true,
        rewardsEnrolled: true,
      });

      await db.insert(walletAccounts).values({
        userId: MOMS_USER_ID,
        tokenBalance: "0.00000000",
        cashBalance: "0.00",
        totalEarned: "0.00000000",
        totalRedeemed: "0.00000000",
        totalCashedOut: "0.00",
        lastActivity: new Date(),
      });

      console.log(
        "💝 Nicolasa Jackson (Mom) account created — generosity fund active (1% of all earnings)"
      );
    } else {
      const [wallet] = await db
        .select()
        .from(walletAccounts)
        .where(eq(walletAccounts.userId, MOMS_USER_ID))
        .limit(1);

      if (!wallet) {
        await db.insert(walletAccounts).values({
          userId: MOMS_USER_ID,
          tokenBalance: "0.00000000",
          cashBalance: "0.00",
          totalEarned: "0.00000000",
          totalRedeemed: "0.00000000",
          totalCashedOut: "0.00",
          lastActivity: new Date(),
        });
        console.log("💝 Nicolasa Jackson wallet created");
      } else {
        console.log(
          `💝 Nicolasa Jackson (Mom) account ready — balance: ${wallet.tokenBalance} JCMOVES`
        );
      }
    }
  } catch (err) {
    console.error("[GenerosityFund] Failed to ensure mom's account:", err);
  }
}
