import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLeadSchema, insertContactSchema, insertCashoutRequestSchema, insertShopItemSchema, insertReviewSchema } from "@shared/schema";
import { sendEmail, generateLeadNotificationEmail, generateContactNotificationEmail } from "./services/email";
import { setupAuth, isAuthenticated } from "./auth";
import bcrypt from "bcrypt";
// REMOVED: Daily check-in service replaced by unified mining system with streaks
// import { dailyCheckinService } from "./services/daily-checkin";
import { rewardsService } from "./services/rewards";
import { cryptoCashoutService } from "./services/crypto-cashout";
import { cryptoService } from "./services/crypto";
import { moonshotService, moonshotAccountTransferSchema } from "./services/moonshot";
import { treasuryService } from "./services/treasury";
import { gamificationService } from "./services/gamification";
import { faucetService } from "./services/faucet";
import { insertFundingDepositSchema, insertFaucetConfigSchema, insertFaucetWalletSchema } from "@shared/schema";
import { z } from "zod";
import { EncryptionService } from "./services/encryption";
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { db } from './db';
import { rewards, walletAccounts, walletPayouts, cashoutRequests, fundingDeposits, reserveTransactions, users, leads, swapRequests, treasurySwapRules } from '@shared/schema';
import { getFaucetPayService } from "./services/faucetpay";
import { getAdvertisingService } from "./services/advertising";
import { FAUCET_CONFIG } from "./constants";
import { walletService } from "./services/wallet";
import { solanaMonitor } from "./services/solana-monitor";
import { crewSuggestionService } from "./services/crew-suggestions";
import { ObjectStorageService } from "./objectStorage";
import { solanaTransferService } from "./services/solana-transfer";
import { jupiterSwapService, SUPPORTED_TOKENS } from "./services/jupiter-swap";
import { smsService } from "./services/sms";

export async function registerRoutes(app: Express): Promise<Server> {
  // Public health check endpoint for deployment monitoring (MUST be before auth setup)
  // This endpoint is used by Replit Autoscale Deployments to verify the service is healthy
  app.get("/health", (req, res) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: "jc-on-the-move"
    });
  });

  // DEV-ONLY: Direct test endpoint for notifications (remove in production)
  if (process.env.NODE_ENV === 'development') {
    app.post("/api/dev/test-notifications", async (req, res) => {
      try {
        const { testEmail, testSMS, targetEmail, targetPhone } = req.body;
        const results: any = { email: null, sms: null };

        // Test Email via SendGrid
        if (testEmail && targetEmail) {
          try {
            const companyEmail = process.env.COMPANY_EMAIL || "upmichiganstatemovers@gmail.com";
            await sendEmail({
              to: targetEmail,
              from: companyEmail,
              subject: "JC ON THE MOVE - Test Notification",
              text: "This is a test email notification from JC ON THE MOVE.",
              html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #2563eb;">🚚 JC ON THE MOVE - Test Notification</h2>
                <p>Email notifications are working correctly!</p>
                <p style="color: #666; font-size: 12px;">Sent at: ${new Date().toLocaleString()}</p>
              </div>`
            });
            results.email = { success: true, sentTo: targetEmail };
            console.log(`✅ Test email sent to ${targetEmail}`);
          } catch (emailError: any) {
            results.email = { success: false, error: emailError.message };
            console.error(`❌ Test email failed:`, emailError.message);
          }
        }

        // Test SMS via Twilio
        if (testSMS && targetPhone) {
          try {
            const smsResult = await smsService.sendSMS(targetPhone, 
              "🚚 JC ON THE MOVE Test: SMS notifications are working correctly!"
            );
            results.sms = { success: smsResult.success, sentTo: targetPhone, messageSid: smsResult.messageSid, error: smsResult.error };
            if (smsResult.success) {
              console.log(`✅ Test SMS sent to ${targetPhone}`);
            } else {
              console.error(`❌ Test SMS failed:`, smsResult.error);
            }
          } catch (smsError: any) {
            results.sms = { success: false, error: smsError.message };
            console.error(`❌ Test SMS failed:`, smsError.message);
          }
        }

        res.json({ success: true, results });
      } catch (error: any) {
        console.error("Test notification error:", error);
        res.status(500).json({ error: error.message });
      }
    });
  }

  // Public objects serving endpoint (from javascript_object_storage integration)
  // Serves files from object storage public directories
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Auth middleware with graceful error handling
  try {
    await setupAuth(app);
  } catch (error) {
    console.error('⚠️  Warning: Authentication setup failed during route registration:', error);
    console.error('⚠️  Server will continue without authentication features');
  }

  // Test notification endpoint for admins
  app.post("/api/admin/test-notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user || (user.role !== 'admin' && user.role !== 'business_owner')) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { testEmail, testSMS, targetEmail, targetPhone } = req.body;
      const results: any = { email: null, sms: null };

      // Test Email via SendGrid
      if (testEmail) {
        try {
          const emailTo = targetEmail || user.email;
          const emailResult = await sendEmail({
            to: emailTo,
            subject: "JC ON THE MOVE - Test Notification",
            text: "This is a test email notification from JC ON THE MOVE. If you received this, email notifications are working correctly!",
            html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2 style="color: #2563eb;">🚚 JC ON THE MOVE - Test Notification</h2>
              <p>This is a test email notification. If you received this, email notifications are working correctly!</p>
              <p style="color: #666; font-size: 12px;">Sent at: ${new Date().toLocaleString()}</p>
            </div>`
          });
          results.email = { success: true, sentTo: emailTo };
          console.log(`✅ Test email sent to ${emailTo}`);
        } catch (emailError: any) {
          results.email = { success: false, error: emailError.message };
          console.error(`❌ Test email failed:`, emailError.message);
        }
      }

      // Test SMS via Twilio
      if (testSMS) {
        try {
          const phoneTo = targetPhone || user.phoneNumber;
          if (!phoneTo) {
            results.sms = { success: false, error: "No phone number provided" };
          } else {
            const smsResult = await smsService.sendSMS(phoneTo, 
              "🚚 JC ON THE MOVE Test: This is a test SMS notification. If you received this, SMS notifications are working correctly!"
            );
            results.sms = { success: smsResult.success, sentTo: phoneTo, messageSid: smsResult.messageSid, error: smsResult.error };
            if (smsResult.success) {
              console.log(`✅ Test SMS sent to ${phoneTo}`);
            } else {
              console.error(`❌ Test SMS failed:`, smsResult.error);
            }
          }
        } catch (smsError: any) {
          results.sms = { success: false, error: smsError.message };
          console.error(`❌ Test SMS failed:`, smsError.message);
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error("Test notification error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Employee Email/Password Authentication Endpoints (Public - No auth required)
  
  // Employee Registration
  const employeeRegisterSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters").regex(/^(?=.*[A-Za-z])(?=.*\d)/, "Password must contain letters and numbers"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    phoneNumber: z.string().min(10, "Phone number is required")
  });

  app.post("/api/auth/employee/register", async (req, res) => {
    try {
      const data = employeeRegisterSchema.parse(req.body);
      
      // Check if email already exists
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      // Hash password with bcrypt (10 rounds = good security/performance balance)
      const passwordHash = await bcrypt.hash(data.password, 10);

      let newUser;

      // If user exists but has no password (Replit Auth migration), update their account
      if (existingUser.length > 0 && !existingUser[0].passwordHash) {
        console.log(`🔄 Migrating Replit Auth account to email/password: ${data.email}`);
        
        const [updatedUser] = await db
          .update(users)
          .set({
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
            phoneNumber: data.phoneNumber,
          })
          .where(eq(users.id, existingUser[0].id))
          .returning();
        
        newUser = updatedUser;
      } else if (existingUser.length > 0) {
        // User exists and already has a password
        return res.status(400).json({ error: "Email already registered" });
      } else {
        // Create new user
        const referralCode = `EMP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        
        const [createdUser] = await db.insert(users).values({
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber,
          role: "employee",
          status: "pending", // Requires admin approval
          referralCode,
        }).returning();
        
        newUser = createdUser;
      }

      (req.session as any).userId = newUser.id;
      (req.session as any).userEmail = newUser.email;
      (req.session as any).userRole = newUser.role;

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
          return res.status(500).json({ error: "Registration failed. Please try again." });
        }

        res.json({
          success: true,
          user: {
            id: newUser.id,
            email: newUser.email,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            role: newUser.role,
            status: newUser.status,
          },
          message: "Registration successful! Your account is pending admin approval."
        });
      });
    } catch (error: any) {
      console.error("Employee registration error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: error.issues?.[0]?.message || "Invalid registration data" });
      }
      res.status(500).json({ error: "Registration failed. Please try again." });
    }
  });

  // Employee Login
  const employeeLoginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required")
  });

  app.post("/api/auth/employee/login", async (req, res) => {
    try {
      const data = employeeLoginSchema.parse(req.body);

      // Find user by email
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(data.password, user.passwordHash);
      
      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Set session data directly (avoid regenerate which can cause cookie issues behind proxies)
      (req.session as any).userId = user.id;
      (req.session as any).userEmail = user.email;
      (req.session as any).userRole = user.role;

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
          return res.status(500).json({ error: "Login failed. Please try again." });
        }

        console.log(`[LOGIN] Session saved successfully. Session ID: ${req.sessionID}, userId: ${user.id}`);

        res.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            status: user.status,
          }
        });
      });
    } catch (error: any) {
      console.error("Employee login error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: error.issues?.[0]?.message || "Invalid login data" });
      }
      res.status(500).json({ error: "Login failed. Please try again." });
    }
  });

  // Logout endpoint for all users (email/password)
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
        return res.status(500).json({ error: "Logout failed" });
      }
      res.clearCookie('jc.sid');
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });

  // Employee Logout
  app.post("/api/auth/employee/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
        return res.status(500).json({ error: "Logout failed" });
      }
      res.clearCookie('jc.sid');
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });

  // Customer Registration
  const customerRegisterSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    phoneNumber: z.string().optional()
  });

  app.post("/api/auth/customer/register", async (req, res) => {
    try {
      const data = customerRegisterSchema.parse(req.body);
      
      // Check if email already exists
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      const passwordHash = await bcrypt.hash(data.password, 10);
      let newUser;

      if (existingUser.length > 0 && !existingUser[0].passwordHash) {
        // Upgrade existing customer account (from quote submission)
        const [updatedUser] = await db
          .update(users)
          .set({
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
            phoneNumber: data.phoneNumber || existingUser[0].phoneNumber,
          })
          .where(eq(users.id, existingUser[0].id))
          .returning();
        newUser = updatedUser;
      } else if (existingUser.length > 0) {
        return res.status(400).json({ error: "Email already registered. Please sign in." });
      } else {
        // Create new customer account
        const referralCode = `CUST-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        
        const [createdUser] = await db.insert(users).values({
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phoneNumber: data.phoneNumber || '',
          role: 'customer',
          status: 'active',
          referralCode,
        }).returning();
        newUser = createdUser;

        // Create wallet account for customer
        await storage.createWalletAccount(newUser.id);
      }

      if (!newUser) {
        return res.status(500).json({ error: "Registration failed" });
      }

      // Award retroactive rewards for previous accepted/completed leads
      try {
        const { rewardSettings, rewards: rewardsTable } = await import('@shared/schema');
        
        // Get reward amounts from settings
        const settings = await db.select().from(rewardSettings);
        const acceptedReward = settings.find(s => s.settingKey === 'customer_quote_accepted');
        const completedReward = settings.find(s => s.settingKey === 'customer_quote_completed');
        
        const acceptedAmount = parseFloat(acceptedReward?.tokenAmount || '200');
        const completedAmount = parseFloat(completedReward?.tokenAmount || '1500');
        
        // Find leads matching this email that are accepted or completed
        const customerLeads = await db
          .select()
          .from(leads)
          .where(and(
            eq(leads.email, newUser.email),
            sql`${leads.status} IN ('accepted', 'confirmed', 'in_progress', 'completed')`
          ));
        
        let totalTokensAwarded = 0;
        let acceptedCount = 0;
        let completedCount = 0;
        
        for (const lead of customerLeads) {
          // Check if reward already given for this lead
          const existingReward = await db
            .select()
            .from(rewardsTable)
            .where(and(
              eq(rewardsTable.recipientId, newUser.id),
              sql`${rewardsTable.metadata}->>'leadId' = ${lead.id}`
            ))
            .limit(1);
          
          if (existingReward.length > 0) continue; // Skip if already rewarded
          
          let rewardAmount = 0;
          let rewardType = '';
          
          if (lead.status === 'completed') {
            rewardAmount = completedAmount;
            rewardType = 'customer_quote_completed';
            completedCount++;
          } else if (['accepted', 'confirmed', 'in_progress'].includes(lead.status || '')) {
            rewardAmount = acceptedAmount;
            rewardType = 'customer_quote_accepted';
            acceptedCount++;
          }
          
          if (rewardAmount > 0) {
            await storage.creditWalletTokens(newUser.id, rewardAmount);
            await db.insert(rewardsTable).values({
              userId: newUser.id,
              rewardType: rewardType,
              tokenAmount: rewardAmount.toFixed(8),
              cashValue: (rewardAmount * 0.01).toFixed(2), // 1 JCMOVES = $0.01
              status: 'confirmed',
              earnedDate: new Date(),
              referenceId: lead.id,
              metadata: { leadId: lead.id, retroactive: true }
            });
            totalTokensAwarded += rewardAmount;
          }
        }
        
        if (totalTokensAwarded > 0) {
          console.log(`🎁 Awarded ${totalTokensAwarded} JCMOVES to new customer ${newUser.email} for ${acceptedCount} accepted + ${completedCount} completed retroactive leads`);
        }
      } catch (retroError) {
        console.error('Retroactive rewards error (non-blocking):', retroError);
      }

      (req.session as any).userId = newUser.id;
      (req.session as any).userEmail = newUser.email;
      (req.session as any).userRole = newUser.role;

      req.session.save((saveErr) => {
        if (saveErr) {
          return res.status(500).json({ error: "Registration successful but login failed" });
        }

        res.json({
          success: true,
          user: {
            id: newUser.id,
            email: newUser.email,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            role: newUser.role,
            status: newUser.status,
          }
        });
      });
    } catch (error: any) {
      console.error("Customer registration error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: error.issues?.[0]?.message || "Invalid data" });
      }
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Customer Login
  app.post("/api/auth/customer/login", async (req, res) => {
    try {
      const data = employeeLoginSchema.parse(req.body);

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password. If you haven't created an account yet, please sign up first." });
      }

      const passwordMatch = await bcrypt.compare(data.password, user.passwordHash);
      
      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      (req.session as any).userId = user.id;
      (req.session as any).userEmail = user.email;
      (req.session as any).userRole = user.role;

      req.session.save((saveErr) => {
        if (saveErr) {
          return res.status(500).json({ error: "Login failed" });
        }

        res.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            status: user.status,
          }
        });
      });
    } catch (error: any) {
      console.error("Customer login error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: error.issues?.[0]?.message || "Invalid data" });
      }
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Unified login endpoint for mobile app (works for all user types)
  app.post("/api/login", async (req, res) => {
    try {
      const data = employeeLoginSchema.parse(req.body);

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      if (!user || !user.passwordHash) {
        return res.status(401).json({ error: "Invalid email or password. If you haven't created an account yet, please sign up first." });
      }

      const passwordMatch = await bcrypt.compare(data.password, user.passwordHash);
      
      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      (req.session as any).userId = user.id;
      (req.session as any).userEmail = user.email;
      (req.session as any).userRole = user.role;

      req.session.save((saveErr) => {
        if (saveErr) {
          return res.status(500).json({ error: "Login failed" });
        }

        res.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            status: user.status,
            phone: user.phone,
            tokenBalance: user.tokenBalance,
          }
        });
      });
    } catch (error: any) {
      console.error("Unified login error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: error.issues?.[0]?.message || "Invalid data" });
      }
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Unified register endpoint for mobile app
  app.post("/api/register", async (req, res) => {
    try {
      const data = employeeRegisterSchema.parse(req.body);

      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ error: "An account with this email already exists" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(data.password, 10);

      // Create user as customer by default
      const [newUser] = await db
        .insert(users)
        .values({
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          passwordHash,
          role: 'customer',
          status: 'active',
          tokenBalance: "0",
        })
        .returning();

      (req.session as any).userId = newUser.id;
      (req.session as any).userEmail = newUser.email;
      (req.session as any).userRole = newUser.role;

      req.session.save((saveErr) => {
        if (saveErr) {
          return res.status(500).json({ error: "Registration successful but login failed" });
        }

        res.json({
          success: true,
          user: {
            id: newUser.id,
            email: newUser.email,
            firstName: newUser.firstName,
            lastName: newUser.lastName,
            role: newUser.role,
            status: newUser.status,
          }
        });
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: error.issues?.[0]?.message || "Invalid data" });
      }
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // ========== Mobile App API Endpoints ==========
  
  // GET /api/user - Get current logged in user
  app.get("/api/user", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        phone: user.phone,
        tokenBalance: user.tokenBalance,
        profileImage: user.profileImage,
        referralCode: user.referralCode,
        solanaWalletAddress: user.solanaWalletAddress,
        createdAt: user.createdAt,
      });
    } catch (error: any) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // GET /api/rewards/balance - Get user's JCMOVES token balance
  app.get("/api/rewards/balance", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        balance: user.tokenBalance || "0",
        solanaWalletAddress: user.solanaWalletAddress,
      });
    } catch (error: any) {
      console.error("Error fetching balance:", error);
      res.status(500).json({ error: "Failed to fetch balance" });
    }
  });

  // GET /api/rewards/mining - Get mining status and streak (delegates to mining service)
  app.get("/api/rewards/mining", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { miningService } = await import('./services/mining');
      const stats = await miningService.getMiningStats(userId);
      res.json(stats);
    } catch (error: any) {
      console.error("Error fetching mining status:", error);
      res.status(500).json({ error: "Failed to fetch mining status" });
    }
  });

  // POST /api/rewards/claim - Claim mined tokens (delegates to mining service)
  app.post("/api/rewards/claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { miningService } = await import('./services/mining');
      const result = await miningService.claimTokens(userId, 'manual');
      
      if (!result.success) {
        return res.status(400).json({ error: result.error || "Failed to claim tokens" });
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("Error claiming reward:", error);
      res.status(500).json({ error: "Failed to claim reward" });
    }
  });

  // GET /api/jobs - Get jobs for calendar (employee jobs)
  app.get("/api/jobs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      let jobs;
      if (userRole === 'admin' || userRole === 'business_owner') {
        // Admins see all jobs
        jobs = await storage.getLeads();
      } else if (userRole === 'employee') {
        // Employees see their assigned jobs
        jobs = await storage.getEmployeeJobs(userId);
      } else {
        // Customers see their own requests
        jobs = await storage.getLeadsByCustomer(userId);
      }
      
      // Format for calendar display
      const calendarJobs = jobs.map((job: any) => ({
        id: job.id,
        title: job.name || `${job.serviceType} - ${job.firstName} ${job.lastName}`,
        date: job.confirmedDate || job.moveDate,
        serviceType: job.serviceType,
        status: job.status,
        address: job.fromAddress || job.address,
        customerName: `${job.firstName || ''} ${job.lastName || ''}`.trim(),
        phone: job.phone,
        email: job.email,
        notes: job.notes,
      }));
      
      res.json(calendarJobs);
    } catch (error: any) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });
  
  // Validation schemas for rewards endpoints
  // NOTE: checkinSchema removed - daily check-ins replaced by unified mining system
  
  const cashoutSchema = z.object({
    tokenAmount: z.number().positive().min(0.01),
    bankDetails: z.object({
      accountNumber: z.string().min(4),
      routingNumber: z.string().length(9),
      accountHolderName: z.string().min(2),
      bankName: z.string().min(2)
    })
  });

  // Treasury validation schema
  const treasuryDepositSchema = z.object({
    amount: z.coerce.number().positive().min(1.00).max(1000000).finite(), // $1.00 - $1M deposit
    depositMethod: z.enum(['manual', 'stripe', 'bank_transfer']).optional().default('manual'),
    notes: z.string().optional()
  });

  // Referral validation schemas
  const referralCodeSchema = z.object({
    referralCode: z.string().min(1).max(20)
  });

  // Crypto conversion validation schemas
  const usdToTokensSchema = z.object({
    usdAmount: z.coerce.number().positive().min(0.01).max(10000).finite() // $0.01 - $10K conversion
  });

  const tokensToUsdSchema = z.object({
    tokenAmount: z.string().refine(
      (val) => {
        const num = parseFloat(val);
        return !isNaN(num) && num > 0 && num <= 1000000000; // 1B token max
      },
      { message: "Token amount must be a positive number string up to 1B tokens" }
    )
  });

  // Treasury dashboard helper functions
  async function getTreasuryAnalytics() {
    // Get reward distribution patterns and user analytics
    const rewardStats = await db
      .select({
        rewardType: rewards.rewardType,
        count: sql<number>`count(*)`,
        totalTokens: sql<number>`sum(cast(${rewards.tokenAmount} as decimal))`,
        totalCash: sql<number>`sum(cast(${rewards.cashValue} as decimal))`
      })
      .from(rewards)
      .where(eq(rewards.status, 'confirmed'))
      .groupBy(rewards.rewardType);

    // Calculate date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    const userStats = await db
      .select({
        totalUsers: sql<number>`count(distinct ${rewards.userId})`,
      })
      .from(rewards);

    const activeUsers = await db
      .select({
        activeUsers: sql<number>`count(distinct ${rewards.userId})`,
      })
      .from(rewards)
      .where(sql`${rewards.earnedDate} >= ${thirtyDaysAgoISO}`);

    // Get distribution trends (simplified without date grouping for compatibility)
    const recentRewards = await db
      .select({
        tokenAmount: rewards.tokenAmount,
        cashValue: rewards.cashValue,
        earnedDate: rewards.earnedDate
      })
      .from(rewards)
      .where(sql`${rewards.earnedDate} >= ${thirtyDaysAgoISO}`)
      .orderBy(desc(rewards.earnedDate));

    return {
      rewardStats,
      userStats: { 
        totalUsers: userStats[0]?.totalUsers || 0,
        activeUsers: activeUsers[0]?.activeUsers || 0
      },
      recentRewards
    };
  }

  async function getTreasuryReports(period: string = '30d', type: string = 'all') {
    const dayMap = {
      '7d': 7,
      '30d': 30, 
      '90d': 90,
      '1y': 365
    };
    
    const days = dayMap[period as keyof typeof dayMap] || 30;
    
    // Calculate date boundary
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromDateISO = fromDate.toISOString();
    
    // Get funding deposits within period
    const fundingData = await db
      .select({
        amount: fundingDeposits.depositAmount,
        createdAt: fundingDeposits.createdAt
      })
      .from(fundingDeposits)
      .where(sql`${fundingDeposits.createdAt} >= ${fromDateISO}`)
      .orderBy(desc(fundingDeposits.createdAt));

    // Get distribution transactions within period
    const distributionData = await db
      .select({
        cashValue: reserveTransactions.cashValue,
        createdAt: reserveTransactions.createdAt
      })
      .from(reserveTransactions)
      .where(and(
        eq(reserveTransactions.transactionType, 'distribution'),
        sql`${reserveTransactions.createdAt} >= ${fromDateISO}`
      ))
      .orderBy(desc(reserveTransactions.createdAt));

    return {
      period,
      type,
      fundingData,
      distributionData
    };
  }

  async function getTreasurySummary() {
    // Calculate date 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    const [stats, recentDeposits, recentDistributions, activeUsersWeek] = await Promise.all([
      treasuryService.getTreasuryStats(),
      
      // Count recent deposits
      db.select({ count: sql<number>`count(*)` })
        .from(fundingDeposits)
        .where(sql`${fundingDeposits.createdAt} >= ${sevenDaysAgoISO}`),
      
      // Count recent distributions  
      db.select({ count: sql<number>`count(*)` })
        .from(reserveTransactions)
        .where(and(
          eq(reserveTransactions.transactionType, 'distribution'),
          sql`${reserveTransactions.createdAt} >= ${sevenDaysAgoISO}`
        )),
      
      // Count active users this week
      db.select({ count: sql<number>`count(distinct ${rewards.userId})` })
        .from(rewards)
        .where(sql`${rewards.earnedDate} >= ${sevenDaysAgoISO}`)
    ]);

    return {
      ...stats,
      weeklyActivity: {
        recentDeposits: recentDeposits[0]?.count || 0,
        recentDistributions: recentDistributions[0]?.count || 0,
        activeUsersWeek: activeUsersWeek[0]?.count || 0
      }
    };
  }

  function getTreasuryConfig() {
    return {
      tokenPrice: 0.10, // $0.10 per token
      minimumBalance: 100.0, // $100 minimum balance
      warningThreshold: 500.0, // $500 warning threshold
      signupBonusTokens: 1000, // 1000 tokens signup bonus
      maxDistributionPerDay: null
    };
  }
  
  // Submit quote request
  app.post("/api/leads", async (req, res) => {
    try {
      const leadData = insertLeadSchema.parse(req.body);
      const lead = await storage.createLead(leadData);
      
      // Send email notification
      const emailContent = generateLeadNotificationEmail(lead);
      const companyEmail = process.env.COMPANY_EMAIL || "upmichiganstatemovers@gmail.com";
      
      await sendEmail({
        to: companyEmail,
        from: companyEmail,
        subject: `New ${lead.serviceType} Lead - ${lead.firstName} ${lead.lastName}`,
        text: emailContent.text,
        html: emailContent.html,
      });

      // Send SMS notification for new quote to admin
      try {
        await smsService.notifyNewQuote({
          customerName: `${lead.firstName} ${lead.lastName}`,
          serviceType: lead.serviceType,
          phone: lead.phone || undefined,
          moveDate: lead.moveDate || undefined
        });
      } catch (smsError) {
        console.error("Admin SMS notification failed:", smsError);
      }
      
      // Send SMS confirmation to customer (only if they consented)
      if (lead.phone && lead.smsConsent) {
        try {
          await smsService.sendSMS(
            lead.phone,
            `📝 JC ON THE MOVE\n\nThank you ${lead.firstName}! We received your ${lead.serviceType} quote request.\n\nWe'll review your request and get back to you soon with a quote!\n\nQuestions? Call us anytime.`
          );
          console.log(`📱 SMS sent to customer: ${lead.phone}`);
        } catch (customerSmsError) {
          console.error("Customer SMS notification failed:", customerSmsError);
        }
      } else if (lead.phone && !lead.smsConsent) {
        console.log(`📵 Customer did not consent to SMS: ${lead.phone}`);
      }

      // Award 200 JCMOVES for booking request (find or create customer account)
      let rewardMessage = "";
      try {
        const { rewardSettings, rewards: rewardsTable } = await import('@shared/schema');
        
        // Get configurable amount from reward settings
        const settings = await db.select().from(rewardSettings).where(eq(rewardSettings.settingKey, 'customer_quote_accepted'));
        const bonusTokens = settings.length > 0 && settings[0].isActive
          ? parseFloat(settings[0].tokenAmount)
          : 200; // Default 200 JCMOVES
        
        // Find existing user by email or create placeholder for future registration
        let existingUser = await db.select().from(users).where(eq(users.email, lead.email)).limit(1);
        
        if (existingUser.length > 0) {
          // Award tokens to existing account
          await storage.creditWalletTokens(existingUser[0].id, bonusTokens);
          await db.insert(rewardsTable).values({
            userId: existingUser[0].id,
            rewardType: 'booking_request',
            tokenAmount: bonusTokens.toFixed(8),
            cashValue: (bonusTokens * 0.01).toFixed(2),
            status: 'confirmed',
            earnedDate: new Date(),
            referenceId: lead.id,
            metadata: { leadId: lead.id, source: 'public_quote_form' }
          });
          rewardMessage = ` Earned ${bonusTokens} JCMOVES!`;
          console.log(`🎁 Awarded ${bonusTokens} JCMOVES to existing customer ${lead.email} for booking request`);
        } else {
          // Store pending reward for when they register
          console.log(`📋 Customer ${lead.email} not registered - reward will be applied on registration`);
        }
      } catch (rewardError) {
        console.error('Booking request reward error:', rewardError);
      }

      res.json({ success: true, leadId: lead.id, message: `Quote submitted!${rewardMessage}` });
    } catch (error) {
      console.error("Error creating lead:", error);
      res.status(400).json({ error: "Invalid lead data" });
    }
  });

  // Customer quote tracking - REMOVED for security
  // This endpoint was a security vulnerability as it allowed anyone to view leads by email
  // Customers should use the authenticated /api/leads/my-requests endpoint instead

  // Role-based access control middleware
  const requireBusinessOwner = async (req: any, res: any, next: any) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      
      // Allow both admin and business_owner roles for treasury access
      const hasBusinessOwnerAccess = user && (user.role === 'admin' || user.role === 'business_owner');
      
      // Also allow upmichiganstatemovers@gmail.com as the known business owner
      const isKnownBusinessOwner = user?.email === 'upmichiganstatemovers@gmail.com';
      
      if (!hasBusinessOwnerAccess && !isKnownBusinessOwner) {
        console.log(`Access denied for user ${user?.email} with role ${user?.role}`);
        return res.status(403).json({ message: "Business owner access required" });
      }
      
      console.log(`Treasury access granted for user ${user?.email} with role ${user?.role}`);
      req.currentUser = user;
      next();
    } catch (error) {
      console.error("Business owner access control error:", error);
      res.status(500).json({ message: "Access control error" });
    }
  };

  const requireEmployee = async (req: any, res: any, next: any) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = await storage.getUser(userId);
      if (!user || (user.role !== 'employee' && user.role !== 'admin')) {
        return res.status(403).json({ message: "Employee access required" });
      }
      req.currentUser = user;
      next();
    } catch (error) {
      res.status(500).json({ message: "Access control error" });
    }
  };

  const requireApprovedEmployee = async (req: any, res: any, next: any) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = await storage.getUser(userId);
      
      // Admins always have access
      if (user && user.role === 'admin') {
        req.currentUser = user;
        return next();
      }
      
      // Employees must be approved
      if (!user || user.role !== 'employee' || !user.isApproved) {
        return res.status(403).json({ message: "Approved employee access required" });
      }
      
      req.currentUser = user;
      next();
    } catch (error) {
      res.status(500).json({ message: "Access control error" });
    }
  };

  const requireAdmin = async (req: any, res: any, next: any) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = await storage.getUser(userId);
      // Only admin role has administrative access
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: "Administrator access required" });
      }
      req.currentUser = user;
      next();
    } catch (error) {
      res.status(500).json({ message: "Access control error" });
    }
  };

  // Treasury access - allows admin, employee, and business_owner (not customers)
  const requireTreasuryAccess = async (req: any, res: any, next: any) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = await storage.getUser(userId);
      
      // Allow admin, employee, and business_owner roles
      const hasTreasuryAccess = user && (user.role === 'admin' || user.role === 'employee' || user.role === 'business_owner');
      
      // Also allow upmichiganstatemovers@gmail.com as the known business owner
      const isKnownBusinessOwner = user?.email === 'upmichiganstatemovers@gmail.com';
      
      if (!hasTreasuryAccess && !isKnownBusinessOwner) {
        console.log(`Treasury access denied for user ${user?.email} with role ${user?.role}`);
        return res.status(403).json({ message: "Treasury access requires admin, employee, or business owner role" });
      }
      
      console.log(`Treasury access granted for user ${user?.email} with role ${user?.role}`);
      req.currentUser = user;
      next();
    } catch (error) {
      console.error("Treasury access control error:", error);
      res.status(500).json({ message: "Access control error" });
    }
  };

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      console.log(`✅ Authentication successful - Fetching user data for userId: ${userId}`);
      const user = await storage.getUser(userId);
      console.log(`User data retrieved:`, user ? `found - ${user.email} with role ${user.role}` : 'not found');
      
      if (!user) {
        console.error(`❌ User not found in database for userId: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }
      
      console.log(`📤 Returning user data for ${user.email}`);
      // Sanitize user object - remove sensitive fields
      const { passwordHash, ...sanitizedUser } = user;
      res.json(sanitizedUser);
    } catch (error) {
      console.error("❌ Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Update user compliance (age verification and TOS)
  app.post('/api/auth/user/compliance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { dateOfBirth, tosAccepted } = req.body;

      if (!dateOfBirth || typeof tosAccepted !== 'boolean') {
        return res.status(400).json({ message: "Date of birth and TOS acceptance are required" });
      }

      // Validate age (18+)
      const birthDate = new Date(dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      if (age < 18) {
        return res.status(400).json({ message: "You must be 18 years or older to use this service" });
      }

      if (!tosAccepted) {
        return res.status(400).json({ message: "You must accept the Terms of Service to continue" });
      }

      const updatedUser = await storage.updateUserCompliance(userId, dateOfBirth, tosAccepted);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user compliance:", error);
      res.status(500).json({ message: "Failed to update compliance information" });
    }
  });

  // Check username availability
  app.get('/api/auth/username/check/:username', async (req: any, res) => {
    try {
      const { username } = req.params;
      
      if (!username || username.length < 3) {
        return res.status(400).json({ available: false, message: "Username must be at least 3 characters" });
      }

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ available: false, message: "Username can only contain letters, numbers, and underscores" });
      }

      const isAvailable = await storage.checkUsernameAvailability(username);
      res.json({ available: isAvailable });
    } catch (error) {
      console.error("Error checking username availability:", error);
      res.status(500).json({ message: "Failed to check username availability" });
    }
  });

  // Update username
  app.post('/api/auth/user/username', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { username } = req.body;

      if (!username || username.length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters" });
      }

      if (username.length > 20) {
        return res.status(400).json({ message: "Username must be 20 characters or less" });
      }

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ message: "Username can only contain letters, numbers, and underscores" });
      }

      // Check if username is already taken
      const isAvailable = await storage.checkUsernameAvailability(username);
      if (!isAvailable) {
        return res.status(409).json({ message: "Username is already taken" });
      }

      const updatedUser = await storage.updateUsername(userId, username);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updatedUser);
    } catch (error: any) {
      // Handle unique constraint violation from race conditions
      if (error.message === 'USERNAME_TAKEN') {
        return res.status(409).json({ message: "Username is already taken" });
      }
      console.error("Error updating username:", error);
      res.status(500).json({ message: "Failed to update username" });
    }
  });

  // Get all users (for employee/admin to assign jobs)
  app.get('/api/users', isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      
      // Return only safe user data
      const safeUsers = users.map(user => ({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        role: user.role,
      }));
      
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching all users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get user by ID (for employee access)
  app.get('/api/users/:id', isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const { id } = req.params;
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Return only safe user data
      res.json({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      });
    } catch (error) {
      console.error("Error fetching user by ID:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Delete user (business owner only)
  app.delete('/api/users/:id', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      
      console.log(`🗑️ Deleting user ${id}...`);
      
      const deleted = await storage.deleteUser(id);
      
      if (!deleted) {
        console.log(`❌ User ${id} not found for deletion`);
        return res.status(404).json({ error: "User not found" });
      }
      
      console.log(`✅ User ${id} deleted successfully`);
      res.json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Update user role (business owner only)
  app.patch('/api/users/:id/role', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;
      
      console.log(`🔄 Updating user ${id} role to: ${role}`);
      
      // Validate role
      const validRoles = ['employee', 'customer', 'admin', 'business_owner'];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
      }
      
      const updatedUser = await storage.updateUserRole(id, role);
      
      if (!updatedUser) {
        console.log(`❌ User ${id} not found for role update`);
        return res.status(404).json({ error: "User not found" });
      }
      
      console.log(`✅ User ${id} role updated to ${role}`);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  // Get detailed user information for admin (balance, rewards, transactions, jobs)
  app.get('/api/admin/users/:id/details', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Get basic user info
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Get wallet and balance information
      const wallet = await storage.getWalletAccount(id);
      const tokenBalance = wallet ? parseFloat(wallet.tokenBalance || "0") : 0;
      
      // Get employee stats if user is employee or admin
      let employeeStats = null;
      if (user.role === 'employee' || user.role === 'admin') {
        employeeStats = await storage.getEmployeeStats(id);
      }
      
      // Get recent rewards (last 10)
      const recentRewards = await db
        .select()
        .from(rewards)
        .where(eq(rewards.userId, id))
        .orderBy(desc(rewards.earnedDate))
        .limit(10);
      
      // Calculate total earnings from ALL rewards (not just recent 10)
      const allRewards = await db
        .select({ cashValue: rewards.cashValue })
        .from(rewards)
        .where(eq(rewards.userId, id));
      
      const totalEarnings = allRewards.reduce((sum, reward) => 
        sum + parseFloat(reward.cashValue || "0"), 0
      );
      
      // Get pending cashout requests
      const pendingCashouts = await db
        .select()
        .from(cashoutRequests)
        .where(and(
          eq(cashoutRequests.userId, id),
          eq(cashoutRequests.status, 'pending')
        ))
        .orderBy(desc(cashoutRequests.createdAt));
      
      // Get assigned/created leads if employee (use targeted queries instead of filtering all leads)
      let assignedJobs: any[] = [];
      let createdJobs: any[] = [];
      if (user.role === 'employee' || user.role === 'admin') {
        // Query only leads where user is in crew (more efficient than loading all leads)
        const [allLeadsForUser, allCreatedLeads] = await Promise.all([
          db.select()
            .from(leads)
            .where(sql`${id} = ANY(${leads.crewMembers})`)
            .orderBy(desc(leads.createdAt))
            .limit(10),
          db.select()
            .from(leads)
            .where(eq(leads.createdByUserId, id))
            .orderBy(desc(leads.createdAt))
            .limit(10)
        ]);
        assignedJobs = allLeadsForUser;
        createdJobs = allCreatedLeads;
      }
      
      res.json({
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          username: user.username,
          role: user.role,
          createdAt: user.createdAt,
          referralCount: user.referralCount
        },
        wallet: {
          tokenBalance: tokenBalance.toFixed(8),
          totalEarnings: totalEarnings.toFixed(4)
        },
        employeeStats: employeeStats ? {
          totalPoints: employeeStats.totalPoints,
          currentLevel: employeeStats.currentLevel,
          totalEarnedTokens: employeeStats.totalEarnedTokens,
          jobsCompleted: employeeStats.jobsCompleted,
          streakCount: employeeStats.currentStreak,
          lastActivityDate: employeeStats.lastActivityDate
        } : null,
        recentRewards: recentRewards.map(reward => ({
          id: reward.id,
          rewardType: reward.rewardType,
          tokenAmount: reward.tokenAmount,
          cashValue: reward.cashValue,
          status: reward.status,
          earnedDate: reward.earnedDate,
          referenceId: reward.referenceId
        })),
        pendingRequests: {
          cashouts: pendingCashouts.length,
          cashoutDetails: pendingCashouts.map(cashout => ({
            id: cashout.id,
            tokenAmount: cashout.tokenAmount,
            usdValue: cashout.cashAmount,
            status: cashout.status,
            createdAt: cashout.createdAt
          }))
        },
        jobs: {
          assignedCount: assignedJobs.length,
          createdCount: createdJobs.length,
          recentAssigned: assignedJobs.slice(0, 5).map(job => ({
            id: job.id,
            serviceType: job.serviceType,
            status: job.status,
            createdAt: job.createdAt
          })),
          recentCreated: createdJobs.slice(0, 5).map(job => ({
            id: job.id,
            serviceType: job.serviceType,
            status: job.status,
            createdAt: job.createdAt
          }))
        }
      });
    } catch (error) {
      console.error("Error fetching user details:", error);
      res.status(500).json({ error: "Failed to fetch user details" });
    }
  });

  // Update user status (pending/approved/removed)
  app.patch('/api/admin/users/:id/status', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      // Validate status
      if (!['pending', 'approved', 'removed'].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be 'pending', 'approved', or 'removed'" });
      }
      
      console.log(`🔄 Admin updating user ${id} status to ${status}...`);
      
      // Get user to verify exists
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Update user status
      const [updatedUser] = await db
        .update(users)
        .set({ 
          status,
          isApproved: status === 'approved', // Sync with deprecated field for backward compatibility
          updatedAt: new Date()
        })
        .where(eq(users.id, id))
        .returning();
      
      console.log(`✅ User ${id} status updated to ${status}`);
      res.json({ success: true, user: updatedUser });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ error: "Failed to update user status" });
    }
  });

  // Delete user (admin only) - transfers tokens to treasury before deletion
  app.delete('/api/admin/users/:id', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      
      console.log(`🗑️ Admin deleting user ${id}...`);
      
      // Get user to check role (prevent deleting admins/owners)
      const user = await storage.getUser(id);
      if (!user) {
        console.log(`❌ User ${id} not found for deletion`);
        return res.status(404).json({ error: "User not found" });
      }
      
      // Prevent deleting admins only (allow business_owner deletion by admins)
      if (user.role === 'admin') {
        console.log(`❌ Cannot delete user ${id} with admin role`);
        return res.status(403).json({ error: `Cannot delete users with admin role` });
      }
      
      // Capture token balance outside transaction scope for response
      let reclaimedTokens = 0;
      
      // Wrap ENTIRE deletion and treasury reclaim in single transaction for atomicity
      await db.transaction(async (tx) => {
        // Get user's wallet to check token balance
        const [wallet] = await tx
          .select()
          .from(walletAccounts)
          .where(eq(walletAccounts.userId, id || ""))
          .limit(1);
        
        const tokenBalance = wallet ? parseFloat(wallet.tokenBalance) : 0;
        reclaimedTokens = tokenBalance; // Capture for response
        
        // If user has tokens, transfer them to treasury within same transaction
        if (tokenBalance > 0) {
          console.log(`💰 Transferring ${tokenBalance} tokens from user ${id} to treasury...`);
          
          // Set wallet balance to zero within transaction
          if (wallet) {
            await tx
              .update(walletAccounts)
              .set({ tokenBalance: "0.00000000" })
              .where(eq(walletAccounts.userId, id || ""));
          }
          
          // Get treasury account and update reserve (within same transaction)
          const [treasuryAccount] = await tx
            .select()
            .from(treasuryAccounts)
            .where(eq(treasuryAccounts.isActive, true))
            .limit(1);
          
          if (treasuryAccount) {
            const currentReserve = parseFloat(treasuryAccount.tokenReserve);
            const newReserve = currentReserve + tokenBalance;
            
            // Update treasury reserve within transaction
            await tx
              .update(treasuryAccounts)
              .set({ tokenReserve: newReserve.toFixed(8) })
              .where(eq(treasuryAccounts.id, treasuryAccount.id));
            
            // Record the reclaim transaction within same transaction
            await tx.insert(reserveTransactions).values({
              treasuryAccountId: treasuryAccount.id,
              transactionType: 'refund',
              relatedEntityType: 'account_deletion',
              relatedEntityId: id,
              tokenAmount: tokenBalance.toFixed(8),
              cashValue: "0.00",
              balanceAfter: treasuryAccount.cashReserve,
              tokenReserveAfter: newReserve.toFixed(8),
              description: `Tokens reclaimed from deleted user account: ${user.email || id}`,
            });
            
            console.log(`✅ Transferred ${tokenBalance} tokens to treasury`);
          } else {
            throw new Error("No active treasury account found");
          }
        }
        
        // Delete user within same transaction (all-or-nothing)
        await tx.delete(users).where(eq(users.id, id || ""));
        console.log(`✅ User ${id} deleted successfully`);
      });
      
      const deleted = true;
      
      if (!deleted) {
        console.log(`❌ Failed to delete user ${id}`);
        return res.status(500).json({ error: "Failed to delete user" });
      }
      
      console.log(`✅ User ${id} deleted successfully`);
      res.json({ 
        success: true, 
        message: "User deleted successfully",
        tokensTransferred: reclaimedTokens > 0 ? reclaimedTokens.toFixed(8) : "0.00000000"
      });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Admin transfer tokens to user wallet
  app.post('/api/admin/wallet/:userId/transfer', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { userId } = req.params;
      const { tokenAmount, description } = req.body;
      
      if (!tokenAmount || tokenAmount <= 0) {
        return res.status(400).json({ error: "Valid token amount is required" });
      }
      
      // Get user to verify exists
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Distribute tokens from treasury to user
      const distributionResult = await treasuryService.distributeTokens(
        parseFloat(tokenAmount),
        description || `Admin transfer to ${targetUser.email}`,
        'admin_transfer',
        userId
      );
      
      if (!distributionResult.success) {
        return res.status(400).json({ error: distributionResult.error });
      }
      
      // Add tokens to user wallet
      await storage.addTokens(
        userId,
        parseFloat(tokenAmount),
        distributionResult.cashValue,
        'admin_transfer',
        description
      );
      
      // Get updated balance
      const updatedBalance = await storage.getTokenBalance(userId);
      
      res.json({
        success: true,
        message: `Successfully transferred ${tokenAmount} JCMOVES to ${targetUser.email}`,
        newBalance: updatedBalance.toFixed(8),
        cashValue: distributionResult.cashValue
      });
    } catch (error) {
      console.error("Error transferring tokens:", error);
      res.status(500).json({ error: "Failed to transfer tokens" });
    }
  });

  // Get user wallet transaction history
  app.get('/api/admin/wallet/:userId/history', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      
      // Get user to verify exists
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Get all rewards/transactions for this user
      const allRewards = await db
        .select()
        .from(rewards)
        .where(eq(rewards.userId, userId))
        .orderBy(desc(rewards.earnedDate))
        .limit(limit);
      
      // Format transaction history
      const transactions = allRewards.map(reward => ({
        id: reward.id,
        type: reward.rewardType,
        tokenAmount: reward.tokenAmount,
        cashValue: reward.cashValue,
        status: reward.status,
        date: reward.earnedDate,
        referenceId: reward.referenceId,
        metadata: reward.metadata
      }));
      
      res.json({
        success: true,
        transactions,
        totalCount: transactions.length
      });
    } catch (error) {
      console.error("Error fetching transaction history:", error);
      res.status(500).json({ error: "Failed to fetch transaction history" });
    }
  });

  // Manual login endpoint (temporary workaround for broken OAuth)
  app.post('/api/auth/manual-login', async (req: any, res) => {
    try {
      const { userId, email } = req.body;
      
      if (!userId || !email) {
        return res.status(400).json({ message: "userId and email are required" });
      }

      // Create mock user session
      req.login({
        claims: {
          sub: userId,
          email: email,
          first_name: 'Darrell',
          last_name: 'Jackson'
        },
        expires_at: 9999999999,
        access_token: 'test_token'
      }, (err: any) => {
        if (err) {
          console.error('Manual login error:', err);
          return res.status(500).json({ message: "Login failed" });
        }
        console.log(`✅ Manual login successful for ${email}`);
        res.json({ success: true, message: "Logged in successfully" });
      });
    } catch (error) {
      console.error("Manual login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Wallet choice management (hybrid personal/company wallet system)
  app.get('/api/user/wallet-preference', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let companyWalletAddress: string | null = null;
      if (user.companyWalletId) {
        const companyWallet = await storage.getUserWalletById(user.companyWalletId);
        companyWalletAddress = companyWallet?.walletAddress || null;
      }

      res.json({
        walletMode: user.walletMode || null,
        personalWalletAddress: user.personalWalletAddress || null,
        companyWalletId: user.companyWalletId || null,
        companyWalletAddress,
        hasWalletConfigured: !!user.walletMode
      });
    } catch (error) {
      console.error("Error fetching wallet preference:", error);
      res.status(500).json({ message: "Failed to fetch wallet preference" });
    }
  });

  app.post('/api/user/wallet-choice', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { walletMode, personalWalletAddress } = req.body;

      // Validate wallet mode
      if (!walletMode || !['personal', 'company'].includes(walletMode)) {
        return res.status(400).json({ message: "Invalid wallet mode. Must be 'personal' or 'company'" });
      }

      // Validate personal wallet address if mode is personal
      if (walletMode === 'personal') {
        if (!personalWalletAddress || typeof personalWalletAddress !== 'string') {
          return res.status(400).json({ message: "Personal wallet address is required when using personal mode" });
        }
        
        // Basic Solana address validation (base58, 32-44 chars)
        const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        if (!solanaAddressRegex.test(personalWalletAddress)) {
          return res.status(400).json({ message: "Invalid Solana wallet address format" });
        }
      }

      let companyWalletId: string | undefined;
      let generatedWalletAddress: string | undefined;

      // If company mode, generate a real Solana wallet for the user
      if (walletMode === 'company') {
        try {
          const { walletService } = await import('./services/wallet');
          const companyWallet = await walletService.createUserWallet(userId, 'JCMOVES');
          companyWalletId = companyWallet.id;
          generatedWalletAddress = companyWallet.walletAddress;
          console.log(`✅ Generated company Solana wallet for user ${userId}: ${generatedWalletAddress}`);
        } catch (walletError) {
          console.error('Error generating company wallet:', walletError);
          return res.status(500).json({ message: "Failed to generate company wallet. Please try again." });
        }
      }

      const updatedUser = await storage.updateUserWalletChoice(
        userId,
        walletMode,
        personalWalletAddress,
        companyWalletId
      );

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      console.log(`✅ Wallet choice updated for user ${userId}: mode=${walletMode}`);
      res.json({
        success: true,
        walletMode: updatedUser.walletMode,
        personalWalletAddress: updatedUser.personalWalletAddress,
        companyWalletId: updatedUser.companyWalletId,
        companyWalletAddress: generatedWalletAddress
      });
    } catch (error) {
      console.error("Error updating wallet choice:", error);
      res.status(500).json({ message: "Failed to update wallet choice" });
    }
  });

  app.get('/api/user/payout-address', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const payoutInfo = await storage.getPayoutAddress(userId);
      
      res.json(payoutInfo);
    } catch (error) {
      console.error("Error fetching payout address:", error);
      res.status(500).json({ message: "Failed to fetch payout address" });
    }
  });

  // Profile image upload (base64 encoded)
  app.post('/api/user/profile-image', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { profileImageUrl } = req.body;

      if (!profileImageUrl || typeof profileImageUrl !== 'string') {
        return res.status(400).json({ message: "Profile image is required" });
      }

      // Validate base64 image format
      if (!profileImageUrl.startsWith('data:image/')) {
        return res.status(400).json({ message: "Invalid image format. Must be a base64 encoded image" });
      }

      const updatedUser = await storage.updateUserProfileImage(userId, profileImageUrl);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating profile image:", error);
      res.status(500).json({ message: "Failed to update profile image" });
    }
  });

  // Help request submission with optional images
  app.post('/api/support/help-request', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { message, imageUrls } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ message: "Help message is required" });
      }

      // Validate image URLs if provided
      const validatedImageUrls: string[] = [];
      if (imageUrls && Array.isArray(imageUrls)) {
        for (const url of imageUrls) {
          if (url && typeof url === 'string' && url.startsWith('data:image/')) {
            validatedImageUrls.push(url);
          }
        }
      }

      const helpRequest = await storage.createHelpRequest({
        userId,
        message: message.trim(),
        imageUrls: validatedImageUrls.length > 0 ? validatedImageUrls : null,
      });

      res.json(helpRequest);
    } catch (error) {
      console.error("Error creating help request:", error);
      res.status(500).json({ message: "Failed to submit help request" });
    }
  });

  // Employee job submission - track who created the job for rewards
  app.post("/api/leads/employee", isAuthenticated, requireApprovedEmployee, async (req: any, res) => {
    try {
      console.log('📝 Employee lead creation request:', JSON.stringify(req.body, null, 2));
      const employeeId = (req.session as any).userId; // Get from authenticated user
      
      const leadData = insertLeadSchema.parse(req.body);
      console.log('✅ Lead data validated successfully');
      
      // Create lead with createdByUserId to track the employee
      const lead = await storage.createLead({
        ...leadData,
        createdByUserId: employeeId
      });
      console.log('✅ Lead created successfully:', lead.id);
      
      // Send email notification
      const emailContent = generateLeadNotificationEmail(lead);
      const companyEmail = process.env.COMPANY_EMAIL || "upmichiganstatemovers@gmail.com";
      
      await sendEmail({
        to: companyEmail,
        from: companyEmail,
        subject: `New Employee-Created ${lead.serviceType} Lead - ${lead.firstName} ${lead.lastName}`,
        text: `${emailContent.text}\n\nCreated by Employee ID: ${employeeId}`,
        html: `${emailContent.html}<p><strong>Created by Employee ID:</strong> ${employeeId}</p>`,
      });

      // Send SMS notification to admin for new lead
      try {
        const creator = await storage.getUser(employeeId);
        const creatorName = creator ? `${creator.firstName} ${creator.lastName}` : 'Unknown Employee';
        
        await smsService.notifyNewLead({
          customerName: `${lead.firstName} ${lead.lastName}`,
          serviceType: lead.serviceType,
          phone: lead.phone || undefined,
          createdBy: creatorName
        });
        console.log(`📱 SMS sent to admin for new lead created by ${creatorName}`);
      } catch (smsError) {
        console.error('Admin SMS notification failed:', smsError);
      }

      // Send SMS confirmation to customer (only if they consented)
      if (lead.phone && lead.smsConsent) {
        try {
          await smsService.sendSMS(
            lead.phone,
            `📝 JC ON THE MOVE\n\nThank you ${lead.firstName}! We received your ${lead.serviceType} quote request.\n\nWe'll review your request and get back to you soon with a quote!\n\nQuestions? Call us anytime.`
          );
          console.log(`📱 SMS sent to customer: ${lead.phone}`);
        } catch (customerSmsError) {
          console.error('Customer SMS notification failed:', customerSmsError);
        }
      } else if (lead.phone && !lead.smsConsent) {
        console.log(`📵 Customer did not consent to SMS: ${lead.phone}`);
      }

      // Award lead creation bonus (configurable amount, up to 5/day)
      let rewardMessage = "";
      try {
        const { TREASURY_CONFIG, REWARD_TYPES } = await import('./constants');
        const { rewardSettings } = await import('@shared/schema');
        
        // Get configurable amount from reward settings, fallback to constant
        const settings = await db.select().from(rewardSettings).where(eq(rewardSettings.settingKey, 'employee_lead_creation'));
        const bonusTokens = settings.length > 0 && settings[0].isActive
          ? parseFloat(settings[0].tokenAmount)
          : TREASURY_CONFIG.LEAD_CREATION_BONUS_TOKENS;
        const dailyCap = TREASURY_CONFIG.LEAD_CREATION_DAILY_CAP;
        
        // Check daily cap - count lead_creation rewards today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayRewards = await storage.getRewardsByUserAndTypeToday(employeeId, REWARD_TYPES.LEAD_CREATION);
        
        if (todayRewards.length < dailyCap) {
          // Award the bonus
          await storage.creditWalletTokens(employeeId, bonusTokens);
          
          // Create reward record
          await storage.createReward({
            recipientId: employeeId,
            type: REWARD_TYPES.LEAD_CREATION,
            amount: "0",
            tokenAmount: bonusTokens.toFixed(8),
            status: 'confirmed',
            metadata: { leadId: lead.id, dailyCount: todayRewards.length + 1, dailyCap }
          });
          
          rewardMessage = ` You earned ${bonusTokens} JCMOVES for creating this job!`;
          console.log(`🎁 Awarded ${bonusTokens} JCMOVES to ${employeeId} for lead creation (${todayRewards.length + 1}/${dailyCap} today)`);
        } else {
          rewardMessage = ` (Daily reward cap reached - ${dailyCap} leads)`;
          console.log(`⚠️ Employee ${employeeId} hit daily lead creation cap (${dailyCap})`);
        }
      } catch (rewardError) {
        console.error('Lead creation reward error:', rewardError);
      }

      res.json({ success: true, leadId: lead.id, message: `Job created!${rewardMessage} You'll also earn a bonus when it's completed.` });
    } catch (error: any) {
      console.error("❌ Error creating employee lead:", error);
      
      // If it's a Zod validation error, provide details
      if (error.issues) {
        console.error("❌ Validation errors:", JSON.stringify(error.issues, null, 2));
        return res.status(400).json({ 
          error: "Invalid lead data",
          details: error.issues.map((issue: any) => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        });
      }
      
      res.status(400).json({ error: error.message || "Invalid lead data" });
    }
  });

  // Admin: Employee approval management
  app.get('/api/admin/employees/pending', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const pendingEmployees = await storage.getPendingEmployees();
      res.json(pendingEmployees);
    } catch (error) {
      console.error("Error fetching pending employees:", error);
      res.status(500).json({ message: "Failed to fetch pending employees" });
    }
  });

  app.get('/api/admin/employees/approved', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const approvedEmployees = await storage.getApprovedEmployees();
      res.json(approvedEmployees);
    } catch (error) {
      console.error("Error fetching approved employees:", error);
      res.status(500).json({ message: "Failed to fetch approved employees" });
    }
  });

  app.patch('/api/admin/employees/:id/approve', isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { approved } = req.body;
      
      if (typeof approved !== 'boolean') {
        return res.status(400).json({ message: "Invalid approval status" });
      }

      const updatedUser = await storage.updateUserApproval(id, approved);
      if (!updatedUser) {
        return res.status(404).json({ message: "Employee not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating employee approval:", error);
      res.status(500).json({ message: "Failed to update employee approval" });
    }
  });

  // Protected routes - Get all leads (business owner only)
  // TEMPORARY: Authentication temporarily disabled for debugging
  app.get("/api/leads", async (req, res) => {
    try {
      console.log('📋 Fetching all leads...');
      const leads = await storage.getLeads();
      console.log(`📋 Found ${leads.length} leads`);
      res.json(leads);
    } catch (error) {
      console.error("Error fetching leads:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  // Get leads by status (business owner only)
  app.get("/api/leads/status/:status", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { status } = req.params;
      const leads = await storage.getLeadsByStatus(status);
      res.json(leads);
    } catch (error) {
      console.error("Error fetching leads by status:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  // Customer endpoint to fetch only their own job requests (MUST be before :id route)
  app.get("/api/leads/my-requests", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || !user.email) {
        return res.status(404).json({ error: "User not found or email not available" });
      }

      // Fetch leads created by this customer (matching email)
      const customerLeads = await storage.getLeadsByEmail(user.email);
      
      // Transform to match frontend CustomerJob interface
      const transformedLeads = customerLeads.map(lead => ({
        id: lead.id,
        fullName: `${lead.firstName} ${lead.lastName}`,
        email: lead.email,
        phone: lead.phone || '',
        moveDate: lead.moveDate || '',
        serviceType: lead.serviceType,
        pickupAddress: lead.fromAddress || '',
        dropoffAddress: lead.toAddress || '',
        status: lead.status,
        estimatedTotal: lead.totalPrice || '',
        createdAt: lead.createdAt?.toISOString() || ''
      }));
      
      console.log(`📋 Customer ${user.email} has ${transformedLeads.length} requests`);
      res.json(transformedLeads);
    } catch (error) {
      console.error("Error fetching customer requests:", error);
      res.status(500).json({ error: "Failed to fetch your requests" });
    }
  });

  // Get single lead by ID 
  // TEMPORARY: Authentication temporarily disabled for debugging
  app.get("/api/leads/:id", async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`📋 Fetching lead ${id}...`);
      const lead = await storage.getLead(id);
      
      if (!lead) {
        console.log(`❌ Lead ${id} not found`);
        return res.status(404).json({ error: "Lead not found" });
      }
      
      console.log(`✅ Found lead ${id}: ${lead.firstName} ${lead.lastName}`);
      res.json(lead);
    } catch (error) {
      console.error("Error fetching lead:", error);
      res.status(500).json({ error: "Failed to fetch lead" });
    }
  });

  // Protected routes - Update lead status (dashboard only - business owner only)
  app.patch("/api/leads/:id/status", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!status || !["quote_requested", "available", "completed"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const updatedLead = await storage.updateLeadStatus(id, status);
      if (!updatedLead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      // Send SMS notifications for status changes
      try {
        const { notificationService } = await import("./services/notification");
        
        // Notify when job becomes available
        if (status === 'available') {
          await notificationService.notifyAllEmployees(
            'New Job Available',
            `${updatedLead.serviceType} job available for ${updatedLead.firstName} ${updatedLead.lastName}`,
            { jobId: updatedLead.id, type: 'job_available' }
          );
          
          // Send SMS to all employees with phone numbers
          try {
            const allUsers = await storage.getAllUsers();
            const employees = allUsers.filter(u => u.role === 'employee' && (u.status === 'active' || u.status === 'approved') && u.phoneNumber);
            for (const emp of employees) {
              if (emp.phoneNumber) {
                await smsService.notifyJobAvailable(emp.phoneNumber, {
                  customerName: `${updatedLead.firstName} ${updatedLead.lastName}`,
                  serviceType: updatedLead.serviceType,
                  moveDate: updatedLead.confirmedDate || updatedLead.moveDate || undefined,
                  tokensReward: updatedLead.tokenAllocation ? parseFloat(updatedLead.tokenAllocation) : undefined
                });
              }
            }
          } catch (e) { console.error('SMS to employees failed:', e); }
          
          // Send SMS to customer confirming job availability
          if (updatedLead.phone) {
            try {
              await smsService.sendSMS(
                updatedLead.phone,
                `✅ JC ON THE MOVE\n\nGreat news! Your ${updatedLead.serviceType} job has been confirmed and is now available for scheduling. We'll be in touch soon!\n\nQuestions? Call us anytime.`
              );
            } catch (e) { console.error('Customer SMS failed:', e); }
          }
        }
        
        // Notify when job is completed
        if (status === 'completed') {
          // Send SMS to admin
          try {
            const assignedUser = updatedLead.assignedToUserId 
              ? await storage.getUser(updatedLead.assignedToUserId)
              : null;
            await smsService.notifyJobCompleted({
              customerName: `${updatedLead.firstName} ${updatedLead.lastName}`,
              serviceType: updatedLead.serviceType,
              completedBy: assignedUser ? `${assignedUser.firstName} ${assignedUser.lastName}` : undefined
            });
          } catch (e) { console.error('Admin SMS failed:', e); }
          
          // Send SMS to customer thanking them
          if (updatedLead.phone) {
            try {
              await smsService.sendSMS(
                updatedLead.phone,
                `🎉 JC ON THE MOVE\n\nThank you for choosing us! Your ${updatedLead.serviceType} job has been completed.\n\nWe'd love your feedback! Please leave us a review.\n\nQuestions? Call anytime!`
              );
            } catch (e) { console.error('Customer SMS failed:', e); }
          }
        }
        
        // Notify assigned employee about status changes
        if (updatedLead.assignedToUserId && ['available', 'completed'].includes(status)) {
          await notificationService.notifyJobStatusChange(
            updatedLead.assignedToUserId,
            updatedLead.id,
            status,
            `${updatedLead.firstName} ${updatedLead.lastName}`
          );
        }
      } catch (notificationError) {
        console.error("Error sending status change notification:", notificationError);
        // Don't fail the request if notification fails
      }

      res.json(updatedLead);
    } catch (error) {
      console.error("Error updating lead status:", error);
      if (error instanceof Error && error.message.includes("Cannot set status to 'accepted'")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update lead status" });
    }
  });

  // Request a review from customer for completed job
  app.post("/api/leads/:id/request-review", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Get the lead
      const lead = await storage.getLead(id);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      // Only completed jobs can receive review requests
      if (lead.status !== 'completed') {
        return res.status(400).json({ error: "Can only request reviews for completed jobs" });
      }
      
      // Get the service type label
      const serviceLabels: Record<string, string> = {
        residential: "Moving",
        commercial: "Commercial Moving",
        junk: "Junk Removal",
        snow: "Snow Removal",
        cleaning: "Move In/Out Cleaning",
        handyman: "Handyman",
        demolition: "Light Demolition",
        flooring: "Flooring",
        painting: "Painting",
      };
      const serviceLabel = serviceLabels[lead.serviceType] || lead.serviceType;
      
      // Generate review link
      const reviewLink = `${process.env.APP_URL || 'https://jconthemove.com'}/leave-review?jobId=${lead.id}`;
      
      // Send review request email to customer
      const companyEmail = process.env.COMPANY_EMAIL || "upmichiganstatemovers@gmail.com";
      
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">How was your experience with JC ON THE MOVE?</h2>
          <p>Hi ${lead.firstName},</p>
          <p>Thank you for choosing JC ON THE MOVE for your ${serviceLabel} service! We hope everything went smoothly.</p>
          <p>We'd love to hear about your experience. Your feedback helps us improve and helps other customers find quality service.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${reviewLink}" style="background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Leave a Review</a>
          </div>
          <p>Thank you for your business!</p>
          <p>- The JC ON THE MOVE Team</p>
        </div>
      `;
      
      const emailText = `Hi ${lead.firstName},

Thank you for choosing JC ON THE MOVE for your ${serviceLabel} service! We hope everything went smoothly.

We'd love to hear about your experience. Your feedback helps us improve and helps other customers find quality service.

Leave a review here: ${reviewLink}

Thank you for your business!
- The JC ON THE MOVE Team`;
      
      await sendEmail({
        to: lead.email,
        from: companyEmail,
        subject: `How was your ${serviceLabel} service with JC ON THE MOVE?`,
        text: emailText,
        html: emailHtml,
      });
      
      console.log(`📧 Review request sent to ${lead.email} for job ${id}`);
      
      res.json({ success: true, message: "Review request sent successfully" });
    } catch (error) {
      console.error("Error sending review request:", error);
      res.status(500).json({ error: "Failed to send review request" });
    }
  });

  // =====================
  // TESTIMONIALS ROUTES
  // =====================
  
  // Get ALL testimonials (admin only - for management)
  app.get("/api/admin/testimonials", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      // Admins see all testimonials regardless of status
      const allTestimonials = await storage.getTestimonials({});
      res.json(allTestimonials);
    } catch (error) {
      console.error("Error fetching admin testimonials:", error);
      res.status(500).json({ error: "Failed to fetch testimonials" });
    }
  });
  
  // Get published testimonials (public - for showcase page)
  app.get("/api/testimonials", async (req, res) => {
    try {
      const { status, featured, sourceType, sourcePlatform, limit } = req.query;
      
      const filters: any = {};
      if (status) filters.status = status as string;
      if (featured === 'true') filters.featured = true;
      if (featured === 'false') filters.featured = false;
      if (sourceType) filters.sourceType = sourceType as string;
      if (sourcePlatform) filters.sourcePlatform = sourcePlatform as string;
      
      const testimonials = await storage.getTestimonials(
        filters,
        limit ? parseInt(limit as string) : undefined
      );
      
      res.json(testimonials);
    } catch (error) {
      console.error("Error fetching testimonials:", error);
      res.status(500).json({ error: "Failed to fetch testimonials" });
    }
  });

  // Get testimonial stats (public)
  app.get("/api/testimonials/stats", async (req, res) => {
    try {
      const stats = await storage.getTestimonialStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching testimonial stats:", error);
      res.status(500).json({ error: "Failed to fetch testimonial stats" });
    }
  });

  // Submit a new testimonial (public - customers can leave reviews)
  app.post("/api/testimonials", async (req, res) => {
    try {
      const { reviewerName, rating, content, serviceType } = req.body;
      
      if (!reviewerName || !rating || !content) {
        return res.status(400).json({ error: "Name, rating, and review content are required" });
      }
      
      if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be between 1 and 5" });
      }
      
      const testimonial = await storage.createTestimonial({
        reviewerName,
        rating,
        content,
        serviceType: serviceType || null,
        sourceType: 'customer',
        sourcePlatform: null,
        sourceUrl: null,
        reviewDate: new Date().toISOString().split('T')[0],
        status: 'pending', // Customer reviews need approval
        featured: false,
        verified: false,
      });
      
      console.log(`📝 New customer testimonial submitted by ${reviewerName}`);
      
      res.json({ success: true, message: "Thank you for your review! It will be published after approval." });
    } catch (error) {
      console.error("Error creating testimonial:", error);
      res.status(500).json({ error: "Failed to submit review" });
    }
  });

  // Import testimonials from external sources (admin only)
  app.post("/api/testimonials/import", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { testimonials: testimonialsToImport } = req.body;
      
      if (!Array.isArray(testimonialsToImport) || testimonialsToImport.length === 0) {
        return res.status(400).json({ error: "Please provide an array of testimonials to import" });
      }
      
      const formattedTestimonials = testimonialsToImport.map((t: any) => ({
        reviewerName: t.reviewerName || 'Anonymous',
        rating: Math.min(5, Math.max(1, parseInt(t.rating) || 5)),
        content: t.content || '',
        serviceType: t.serviceType || null,
        sourceType: 'imported' as const,
        sourcePlatform: t.sourcePlatform || null,
        sourceUrl: t.sourceUrl || null,
        reviewDate: t.reviewDate || null,
        status: 'published' as const, // Imported reviews go directly to published
        featured: t.featured || false,
        verified: true, // Imported reviews are considered verified
      }));
      
      const imported = await storage.importTestimonials(formattedTestimonials);
      
      console.log(`📥 Imported ${imported.length} testimonials`);
      
      res.json({ success: true, count: imported.length, testimonials: imported });
    } catch (error) {
      console.error("Error importing testimonials:", error);
      res.status(500).json({ error: "Failed to import testimonials" });
    }
  });

  // Update testimonial (admin only - for moderation)
  app.patch("/api/testimonials/:id", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const testimonial = await storage.updateTestimonial(id, updates);
      
      if (!testimonial) {
        return res.status(404).json({ error: "Testimonial not found" });
      }
      
      res.json(testimonial);
    } catch (error) {
      console.error("Error updating testimonial:", error);
      res.status(500).json({ error: "Failed to update testimonial" });
    }
  });

  // Delete testimonial (admin only)
  app.delete("/api/testimonials/:id", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      
      const deleted = await storage.deleteTestimonial(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Testimonial not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting testimonial:", error);
      res.status(500).json({ error: "Failed to delete testimonial" });
    }
  });

  // General update lead endpoint (admin or employee)
  // TEMPORARY: Authentication temporarily disabled for debugging
  app.patch("/api/leads/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      console.log(`📝 Updating lead ${id} with:`, updateData);
      
      // Get the current lead status BEFORE updating to check for status change
      const currentLead = await storage.getLead(id);
      if (!currentLead) {
        console.log(`❌ Lead ${id} not found for update`);
        return res.status(404).json({ error: "Lead not found" });
      }
      
      // Update last quote timestamp if quote-related fields are being updated
      if (updateData.basePrice || updateData.crewSize || updateData.confirmedDate) {
        updateData.lastQuoteUpdatedAt = new Date();
      }
      
      const updatedLead = await storage.updateLeadQuote(id, updateData);
      
      if (!updatedLead) {
        console.log(`❌ Lead ${id} not found for update`);
        return res.status(404).json({ error: "Lead not found" });
      }
      
      // IDEMPOTENCY CHECK: Only distribute tokens if rewards haven't been distributed yet
      const isStatusChangingToCompleted = updateData.status === "completed" && currentLead.status !== "completed";
      const rewardsAlreadyDistributed = currentLead.completionRewardedAt !== null && currentLead.completionRewardedAt !== undefined;
      
      if (isStatusChangingToCompleted && !rewardsAlreadyDistributed && updatedLead.tokenAllocation && updatedLead.crewMembers && updatedLead.crewMembers.length > 0) {
        try {
          const totalTokens = parseFloat(updatedLead.tokenAllocation);
          
          // Validate token allocation
          if (isNaN(totalTokens) || totalTokens <= 0) {
            console.log(`⚠️ Invalid token allocation for job ${id}: ${updatedLead.tokenAllocation}`);
            return res.status(400).json({ error: "Invalid or missing token allocation. Please set a valid token amount before marking the job as completed." });
          } else {
            const tokensPerWorker = totalTokens / updatedLead.crewMembers.length;
            
            console.log(`💰 Admin completion: Distributing ${totalTokens} tokens to ${updatedLead.crewMembers.length} crew members (${tokensPerWorker} each)`);
            
            // Award tokens to each crew member using gamification service (includes creator bonus)
            for (const crewMemberId of updatedLead.crewMembers) {
              await gamificationService.awardJobCompletion(crewMemberId, id, tokensPerWorker.toFixed(8), {
                onTime: true,
                customerRating: 5
              });
              console.log(`✅ Awarded ${tokensPerWorker} tokens to crew member ${crewMemberId}`);
            }
            
            // Mark rewards as distributed
            await storage.updateLeadQuote(id, { completionRewardedAt: new Date() });
            console.log(`✅ Marked job ${id} as rewarded at ${new Date().toISOString()}`);

            // Customer loyalty reward: Award tokens when their job completes
            try {
              if (updatedLead.customerEmail) {
                const customer = await storage.getUserByEmail(updatedLead.customerEmail);
                if (customer) {
                  const LOYALTY_REWARD = TREASURY_CONFIG.LOYALTY_REWARD_TOKENS; // $15 worth
                  await storage.creditWalletTokens(customer.id, LOYALTY_REWARD);
                  await db.insert(rewards).values({
                    recipientId: customer.id,
                    type: REWARD_TYPES.LOYALTY_BOOKING,
                    tokenAmount: LOYALTY_REWARD.toFixed(8),
                    status: "confirmed",
                    createdAt: new Date(),
                    metadata: { jobId: id, serviceType: updatedLead.serviceType }
                  });
                  console.log(`🎁 Awarded ${LOYALTY_REWARD} JCMOVES ($${(LOYALTY_REWARD * 0.01).toFixed(2)}) loyalty reward to customer ${customer.email}`);

                  // Referral bonus: Award tokens to referrer on first completed job
                  if (customer.referredByUserId) {
                    const completedJobs = await db.select().from(rewards)
                      .where(and(eq(rewards.recipientId, customer.id), eq(rewards.type, REWARD_TYPES.LOYALTY_BOOKING)));
                    
                    if (completedJobs.length === 1) { // This is their first completed job
                      const REFERRAL_BONUS = TREASURY_CONFIG.REFERRAL_CONFIRMED_TOKENS; // $25 worth
                      await storage.creditWalletTokens(customer.referredByUserId, REFERRAL_BONUS);
                      await db.insert(rewards).values({
                        recipientId: customer.referredByUserId,
                        type: REWARD_TYPES.REFERRAL_CONFIRMED,
                        tokenAmount: REFERRAL_BONUS.toFixed(8),
                        status: "confirmed",
                        createdAt: new Date(),
                        metadata: { referredUserId: customer.id, jobId: id }
                      });
                      console.log(`🎉 Awarded ${REFERRAL_BONUS} JCMOVES ($${(REFERRAL_BONUS * 0.01).toFixed(2)}) referral bonus to ${customer.referredByUserId}`);
                    }
                  }
                }
              }
            } catch (customerRewardError) {
              console.error("Error awarding customer rewards:", customerRewardError);
            }
          }
        } catch (tokenError) {
          console.error("Error distributing tokens:", tokenError);
          // Don't fail the request if token distribution fails - job is still completed
        }
      } else if (rewardsAlreadyDistributed) {
        console.log(`ℹ️ Job ${id} rewards already distributed at ${currentLead.completionRewardedAt} - skipping`);
      } else if (updateData.status === "completed" && currentLead.status === "completed") {
        console.log(`ℹ️ Job ${id} already completed - skipping token distribution`);
      }
      
      console.log(`✅ Lead ${id} updated successfully`);
      res.json(updatedLead);
    } catch (error) {
      console.error("Error updating lead:", error);
      res.status(500).json({ error: "Failed to update lead" });
    }
  });

  // Delete lead (business owner only)
  app.delete("/api/leads/:id", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      
      console.log(`🗑️ Deleting lead ${id}...`);
      
      const deleted = await storage.deleteLead(id);
      
      if (!deleted) {
        console.log(`❌ Lead ${id} not found for deletion`);
        return res.status(404).json({ error: "Lead not found" });
      }
      
      console.log(`✅ Lead ${id} deleted successfully`);
      res.json({ success: true, message: "Lead deleted successfully" });
    } catch (error) {
      console.error("Error deleting lead:", error);
      res.status(500).json({ error: "Failed to delete lead" });
    }
  });

  // Update lead quote and confirmation (business owner only)
  app.patch("/api/leads/:id/quote", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const quoteData = req.body;
      
      // Get the current lead to check for status change
      const currentLead = await storage.getLead(id);
      const previousStatus = currentLead?.status;
      const newStatus = quoteData.status;
      
      // Calculate special items fees based on weight ($200 base + $150 per 100lbs up to 1000lbs)
      const calculateHeavyItemFee = (weight: number | null | undefined): number => {
        if (!weight || weight <= 0) return 0;
        const cappedWeight = Math.min(weight, 1000); // Cap at 1000 lbs
        const hundredPounds = Math.floor(cappedWeight / 100);
        return 200 + (hundredPounds * 150);
      };
      
      // Calculate fees for each special item
      const hotTubFee = quoteData.hasHotTub ? calculateHeavyItemFee(quoteData.hotTubWeight) : 0;
      const heavySafeFee = quoteData.hasHeavySafe ? calculateHeavyItemFee(quoteData.heavySafeWeight) : 0;
      const poolTableFee = quoteData.hasPoolTable ? calculateHeavyItemFee(quoteData.poolTableWeight) : 0;
      const pianoFee = quoteData.hasPiano ? calculateHeavyItemFee(quoteData.pianoWeight) : 0;
      
      const totalSpecialItemsFee = hotTubFee + heavySafeFee + poolTableFee + pianoFee;
      const basePrice = parseFloat(quoteData.basePrice) || 0;
      const totalPrice = basePrice + totalSpecialItemsFee;
      
      const updatedLead = await storage.updateLeadQuote(id, {
        ...quoteData,
        hotTubFee: hotTubFee.toFixed(2),
        heavySafeFee: heavySafeFee.toFixed(2),
        poolTableFee: poolTableFee.toFixed(2),
        pianoFee: pianoFee.toFixed(2),
        totalSpecialItemsFee: totalSpecialItemsFee.toFixed(2),
        totalPrice: totalPrice.toFixed(2),
        lastQuoteUpdatedAt: new Date(),
      });
      
      if (!updatedLead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      // Send SMS notifications if status changed
      if (newStatus && newStatus !== previousStatus) {
        console.log(`📱 Status changed from ${previousStatus} to ${newStatus} - sending SMS notifications`);
        
        // Notify when job becomes available - send SMS to JC Crew
        if (newStatus === 'available') {
          try {
            const allUsers = await storage.getAllUsers();
            const employees = allUsers.filter(u => u.role === 'employee' && (u.status === 'active' || u.status === 'approved') && u.phoneNumber);
            console.log(`📱 Sending SMS to ${employees.length} JC Crew members`);
            for (const emp of employees) {
              if (emp.phoneNumber) {
                await smsService.notifyJobAvailable(emp.phoneNumber, {
                  customerName: `${updatedLead.firstName} ${updatedLead.lastName}`,
                  serviceType: updatedLead.serviceType,
                  moveDate: updatedLead.confirmedDate || updatedLead.moveDate || undefined,
                  tokensReward: updatedLead.tokenAllocation ? parseFloat(updatedLead.tokenAllocation) : undefined
                });
                console.log(`✅ SMS sent to JC Crew: ${emp.firstName} ${emp.lastName}`);
              }
            }
          } catch (e) { console.error('SMS to JC Crew failed:', e); }
        }
        
        // Notify admin when job is completed
        if (newStatus === 'completed') {
          try {
            const assignedUser = updatedLead.assignedToUserId 
              ? await storage.getUser(updatedLead.assignedToUserId)
              : null;
            await smsService.notifyJobCompleted({
              customerName: `${updatedLead.firstName} ${updatedLead.lastName}`,
              serviceType: updatedLead.serviceType,
              completedBy: assignedUser ? `${assignedUser.firstName} ${assignedUser.lastName}` : undefined
            });
            console.log(`✅ SMS sent to admin for job completion`);
          } catch (e) { console.error('Admin SMS failed:', e); }
        }
      }
      
      res.json(updatedLead);
    } catch (error) {
      console.error("Error updating lead quote:", error);
      res.status(500).json({ error: "Failed to update lead quote" });
    }
  });

  // Get crew assignment suggestions for a job (business owner only)
  app.get("/api/leads/:id/crew-suggestions", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      
      const suggestions = await crewSuggestionService.suggestCrewForJob(id);
      
      if (!suggestions) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      res.json(suggestions);
    } catch (error) {
      console.error("Error generating crew suggestions:", error);
      res.status(500).json({ error: "Failed to generate crew suggestions" });
    }
  });

  // Submit contact form
  app.post("/api/contacts", async (req, res) => {
    try {
      const contactData = insertContactSchema.parse(req.body);
      const contact = await storage.createContact(contactData);
      
      // Send email notification
      const emailContent = generateContactNotificationEmail(contact);
      const companyEmail = process.env.COMPANY_EMAIL || "upmichiganstatemovers@gmail.com";
      
      await sendEmail({
        to: companyEmail,
        from: companyEmail,
        subject: `New Contact Form Submission - ${contact.name}`,
        text: emailContent.text,
        html: emailContent.html,
      });

      res.json({ success: true, contactId: contact.id });
    } catch (error) {
      console.error("Error creating contact:", error);
      res.status(400).json({ error: "Invalid contact data" });
    }
  });

  // Protected routes - Get all contacts (business owner only)
  app.get("/api/contacts", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const contacts = await storage.getContacts();
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  // Review Routes
  // Submit a review for a completed job (authenticated customers only)
  app.post("/api/reviews", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const reviewData = insertReviewSchema.parse({
        ...req.body,
        userId, // Always use authenticated user's ID
      });

      // Verify the lead exists and is completed
      const lead = await storage.getLead(reviewData.leadId);
      if (!lead) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (lead.status !== 'completed') {
        return res.status(400).json({ error: "Can only review completed jobs" });
      }

      // Verify lead ownership: Check if this user's ID matches the lead's userId
      // (Only users who created the lead can review it)
      if (lead.userId && lead.userId !== userId) {
        return res.status(403).json({ error: "You can only review your own jobs" });
      }

      // Check if user already reviewed this job
      const existingReview = await storage.getReviewByLeadAndUser(reviewData.leadId, userId);
      if (existingReview) {
        return res.status(400).json({ error: "You have already reviewed this job" });
      }

      // Set employeeId from the lead's assignment
      const employeeId = lead.assignedToUserId;
      if (!employeeId) {
        return res.status(400).json({ error: "No employee assigned to this job" });
      }

      const review = await storage.createReview({
        ...reviewData,
        employeeId,
      });

      // Update employee stats with new review
      const stats = await storage.getEmployeeReviewStats(employeeId);
      await storage.updateEmployeeStats(employeeId, {
        averageRating: stats.averageRating.toString(),
        totalRatings: stats.totalReviews,
      });

      // Award bonus tokens for high ratings (4 or 5 stars)
      if (review.rating >= 4 && !review.rewardedAt) {
        const bonusAmount = review.rating === 5 ? 500 : 250; // 500 tokens for 5 stars, 250 for 4 stars
        await gamificationService.awardHighRatingBonus(employeeId, review.id, review.rating);
        await storage.markReviewAsRewarded(review.id);
      }

      res.json({ success: true, review });
    } catch (error) {
      console.error("Error creating review:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid review data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create review" });
    }
  });

  // Get reviews with optional filters (public for employee reviews, authenticated for customer reviews)
  app.get("/api/reviews", async (req: any, res) => {
    try {
      const { leadId, employeeId, userId, limit } = req.query;
      
      const filters: { leadId?: string; employeeId?: string; userId?: string } = {};
      if (leadId) filters.leadId = leadId as string;
      if (employeeId) filters.employeeId = employeeId as string;
      
      // Only allow fetching own reviews unless admin
      if (userId) {
        const requestingUserId = (req.session as any).userId;
        const user = requestingUserId ? await storage.getUser(requestingUserId) : null;
        
        if (user?.role !== 'admin' && requestingUserId !== userId) {
          return res.status(403).json({ error: "Can only view your own reviews" });
        }
        filters.userId = userId as string;
      }

      const reviews = await storage.getReviews(filters, limit ? parseInt(limit as string) : undefined);
      res.json(reviews);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      res.status(500).json({ error: "Failed to fetch reviews" });
    }
  });

  // Get current user's reviews (authenticated)
  app.get("/api/reviews/my-reviews", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const reviews = await storage.getReviews({ userId });
      res.json(reviews);
    } catch (error) {
      console.error("Error fetching user reviews:", error);
      res.status(500).json({ error: "Failed to fetch reviews" });
    }
  });

  // Get employee review statistics (public)
  app.get("/api/reviews/employee/:employeeId/stats", async (req, res) => {
    try {
      const { employeeId } = req.params;
      const stats = await storage.getEmployeeReviewStats(employeeId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching employee review stats:", error);
      res.status(500).json({ error: "Failed to fetch review statistics" });
    }
  });

  // Get a single review (public for display, but limited info)
  app.get("/api/reviews/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const review = await storage.getReview(id);
      
      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }

      res.json(review);
    } catch (error) {
      console.error("Error fetching review:", error);
      res.status(500).json({ error: "Failed to fetch review" });
    }
  });

  // Shop Routes
  // Get all shop items (public with optional filters, defaults to active items only)
  app.get("/api/shop", async (req: any, res) => {
    try {
      const { status, postedBy, limit = '20', offset = '0' } = req.query;
      const filters: { status?: string; postedBy?: string } = {};
      
      // Parse pagination params with validation
      const parsedLimit = Math.min(Math.max(parseInt(limit as string) || 20, 1), 100); // Between 1 and 100
      const parsedOffset = Math.max(parseInt(offset as string) || 0, 0); // Non-negative
      
      // Enforce visibility based on authentication and authorization
      const userId = (req.session as any).userId;
      let user = null;
      if (userId) {
        user = await storage.getUser(userId);
      }
      
      // Determine allowed status based on user role
      if (user?.role === 'admin') {
        // Admins can see all statuses
        if (status && typeof status === 'string') {
          filters.status = status;
        }
        // No status filter = all items
      } else if (userId && postedBy === userId) {
        // Authenticated users can see their own items with any status
        filters.postedBy = userId;
        if (status && typeof status === 'string') {
          filters.status = status;
        }
      } else {
        // Public/non-admin users can only see active items
        filters.status = 'active';
        if (postedBy && typeof postedBy === 'string') {
          filters.postedBy = postedBy;
        }
      }
      
      const items = await storage.getShopItems(filters, parsedLimit, parsedOffset);
      res.json(items);
    } catch (error) {
      console.error("Error fetching shop items:", error);
      res.status(500).json({ error: "Failed to fetch shop items" });
    }
  });

  // Get single shop item by ID (public for active items, owner/admin for others)
  app.get("/api/shop/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const item = await storage.getShopItem(id);
      
      if (!item) {
        return res.status(404).json({ error: "Shop item not found" });
      }
      
      // If item is not active, only owner or admin can view
      if (item.status !== 'active') {
        const userId = (req.session as any).userId;
        if (!userId) {
          return res.status(404).json({ error: "Shop item not found" });
        }
        
        const user = await storage.getUser(userId);
        if (!user || (item.postedBy !== userId && user.role !== 'admin')) {
          return res.status(404).json({ error: "Shop item not found" });
        }
      }
      
      res.json(item);
    } catch (error) {
      console.error("Error fetching shop item:", error);
      res.status(500).json({ error: "Failed to fetch shop item" });
    }
  });

  // Create new shop item (authenticated users only)
  app.post("/api/shop", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const itemData = insertShopItemSchema.parse({
        ...req.body,
        postedBy: userId,
      });
      
      const item = await storage.createShopItem(itemData);
      res.json(item);
    } catch (error) {
      console.error("Error creating shop item:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid shop item data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create shop item" });
    }
  });

  // Update shop item (owner or admin only)
  app.patch("/api/shop/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = (req.session as any).userId;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Check if item exists and user has permission
      const item = await storage.getShopItem(id);
      if (!item) {
        return res.status(404).json({ error: "Shop item not found" });
      }
      
      // Only allow owner or admin to update
      if (item.postedBy !== userId && user.role !== 'admin') {
        return res.status(403).json({ error: "You don't have permission to update this item" });
      }
      
      // Validate update data using partial schema
      const updateSchema = insertShopItemSchema.partial().pick({
        title: true,
        description: true,
        price: true,
        photos: true,
        status: true,
        category: true,
      });
      
      const validatedUpdates = updateSchema.parse(req.body);
      
      const updatedItem = await storage.updateShopItem(id, validatedUpdates);
      res.json(updatedItem);
    } catch (error) {
      console.error("Error updating shop item:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid update data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update shop item" });
    }
  });

  // Delete shop item (owner or admin only)
  app.delete("/api/shop/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = (req.session as any).userId;
      
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Check if item exists and user has permission
      const item = await storage.getShopItem(id);
      if (!item) {
        return res.status(404).json({ error: "Shop item not found" });
      }
      
      // Only allow owner or admin to delete
      if (item.postedBy !== userId && user.role !== 'admin') {
        return res.status(403).json({ error: "You don't have permission to delete this item" });
      }
      
      const success = await storage.deleteShopItem(id);
      if (success) {
        res.json({ success: true, message: "Shop item deleted successfully" });
      } else {
        res.status(500).json({ error: "Failed to delete shop item" });
      }
    } catch (error) {
      console.error("Error deleting shop item:", error);
      res.status(500).json({ error: "Failed to delete shop item" });
    }
  });

  // Increment view count (public)
  app.post("/api/shop/:id/view", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if item exists
      const item = await storage.getShopItem(id);
      if (!item) {
        return res.status(404).json({ error: "Shop item not found" });
      }
      
      await storage.incrementShopItemViews(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error incrementing view count:", error);
      res.status(500).json({ error: "Failed to increment view count" });
    }
  });

  // Employee Management Routes (Business Owner Only)
  app.get("/api/employees", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const employees = await storage.getEmployees();
      res.json(employees);
    } catch (error) {
      console.error("Error fetching employees:", error);
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  app.patch("/api/employees/:id/role", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;
      
      if (!role || !["admin", "employee", "customer"].includes(role)) {
        return res.status(400).json({ error: "Invalid role. Valid roles: admin, employee, customer" });
      }

      const updatedUser = await storage.updateUserRole(id, role);
      if (!updatedUser) {
        return res.status(404).json({ error: "Employee not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating employee role:", error);
      res.status(500).json({ error: "Failed to update employee role" });
    }
  });

  // Employee Job Routes
  app.get("/api/leads/available", isAuthenticated, requireEmployee, async (req, res) => {
    try {
      const availableLeads = await storage.getAvailableLeads();
      res.json(availableLeads);
    } catch (error) {
      console.error("Error fetching available leads:", error);
      res.status(500).json({ error: "Failed to fetch available jobs" });
    }
  });

  app.get("/api/leads/my-jobs", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const employeeId = req.currentUser.id;
      const assignedLeads = await storage.getAssignedLeads(employeeId);
      res.json(assignedLeads);
    } catch (error) {
      console.error("Error fetching assigned leads:", error);
      res.status(500).json({ error: "Failed to fetch assigned jobs" });
    }
  });

  app.post("/api/leads/:id/accept", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const { id } = req.params;
      const employeeId = req.currentUser.id;
      
      // Get the current lead
      const lead = await storage.getLead(id);
      if (!lead) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Check if job is available for acceptance
      if (lead.status !== "available") {
        return res.status(400).json({ error: "Job is not available for acceptance" });
      }

      // Check if employee has already accepted this job
      const acceptedByEmployees = lead.acceptedByEmployees || [];
      if (acceptedByEmployees.includes(employeeId)) {
        return res.status(409).json({ error: "You have already accepted this job" });
      }

      // Check if crew is already full
      const crewSize = lead.crewSize || 2;
      if (acceptedByEmployees.length >= crewSize) {
        return res.status(409).json({ error: "This job's crew is already full" });
      }

      // Add employee to accepted list
      const updatedAcceptedBy = [...acceptedByEmployees, employeeId];
      const isCrewFull = updatedAcceptedBy.length >= crewSize;

      // Update the lead
      const updatedLead = await storage.addEmployeeAcceptance(
        id, 
        employeeId, 
        isCrewFull
      );
      
      if (!updatedLead) {
        return res.status(500).json({ error: "Failed to accept job" });
      }

      // Send notification to employee
      try {
        const { notificationService } = await import("./services/notification");
        const message = isCrewFull 
          ? `Job accepted! Crew is full (${crewSize}/${crewSize})`
          : `Job accepted! Waiting for ${crewSize - updatedAcceptedBy.length} more crew member(s)`;
        await notificationService.notifyJobAssigned(
          employeeId,
          updatedLead.id,
          message
        );
      } catch (notificationError) {
        console.error("Error sending job assignment notification:", notificationError);
      }

      res.json(updatedLead);
    } catch (error) {
      console.error("Error accepting job:", error);
      res.status(500).json({ error: "Failed to accept job" });
    }
  });

  // Complete job endpoint
  app.post("/api/leads/:id/complete", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const { id } = req.params;
      const employeeId = req.currentUser.id;
      
      // Verify the employee is assigned to this job
      const lead = await storage.getLead(id);
      if (!lead) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      // Check if employee is assigned (either as the assigned employee or part of the crew)
      const isAssigned = lead.assignedToUserId === employeeId || lead.crewMembers?.includes(employeeId);
      if (!isAssigned) {
        return res.status(403).json({ error: "You can only complete jobs you're assigned to" });
      }
      
      // Update job status to completed
      const updatedLead = await storage.updateLeadStatus(id, "completed");
      if (!updatedLead) {
        return res.status(404).json({ error: "Failed to update job status" });
      }

      // Distribute tokens to crew members if allocated
      if (updatedLead.tokenAllocation && updatedLead.crewMembers && updatedLead.crewMembers.length > 0) {
        try {
          const totalTokens = parseFloat(updatedLead.tokenAllocation);
          const tokensPerWorker = totalTokens / updatedLead.crewMembers.length;
          
          console.log(`💰 Distributing ${totalTokens} tokens to ${updatedLead.crewMembers.length} crew members (${tokensPerWorker} each)`);
          
          // Award tokens to each crew member using gamification service (includes creator bonus)
          for (const crewMemberId of updatedLead.crewMembers) {
            await gamificationService.awardJobCompletion(crewMemberId, id, tokensPerWorker.toFixed(8), {
              onTime: true,
              customerRating: 5
            });
            console.log(`✅ Awarded ${tokensPerWorker} tokens to crew member ${crewMemberId}`);
          }
        } catch (tokenError) {
          console.error("Error distributing tokens:", tokenError);
          // Don't fail the request if token distribution fails - job is still completed
        }
      }

      // Customer loyalty reward: Award tokens when their job completes
      try {
        const { TREASURY_CONFIG, REWARD_TYPES } = await import('./constants');
        if (updatedLead.customerEmail) {
          const customer = await storage.getUserByEmail(updatedLead.customerEmail);
          if (customer) {
            const LOYALTY_REWARD = TREASURY_CONFIG.LOYALTY_REWARD_TOKENS; // $15 worth
            await storage.creditWalletTokens(customer.id, LOYALTY_REWARD);
            await db.insert(rewards).values({
              recipientId: customer.id,
              type: REWARD_TYPES.LOYALTY_BOOKING,
              tokenAmount: LOYALTY_REWARD.toFixed(8),
              status: "confirmed",
              createdAt: new Date(),
              metadata: { jobId: id, serviceType: updatedLead.serviceType }
            });
            console.log(`🎁 Awarded ${LOYALTY_REWARD} JCMOVES ($${(LOYALTY_REWARD * 0.01).toFixed(2)}) loyalty reward to customer ${customer.email}`);

            // Referral bonus: Award tokens to referrer on first completed job
            if (customer.referredByUserId) {
              const completedJobs = await db.select().from(rewards)
                .where(and(eq(rewards.recipientId, customer.id), eq(rewards.type, REWARD_TYPES.LOYALTY_BOOKING)));
              
              if (completedJobs.length === 1) { // This is their first completed job
                const REFERRAL_BONUS = TREASURY_CONFIG.REFERRAL_CONFIRMED_TOKENS; // $25 worth
                await storage.creditWalletTokens(customer.referredByUserId, REFERRAL_BONUS);
                await db.insert(rewards).values({
                  recipientId: customer.referredByUserId,
                  type: REWARD_TYPES.REFERRAL_CONFIRMED,
                  tokenAmount: REFERRAL_BONUS.toFixed(8),
                  status: "confirmed",
                  createdAt: new Date(),
                  metadata: { referredUserId: customer.id, jobId: id }
                });
                console.log(`🎉 Awarded ${REFERRAL_BONUS} JCMOVES ($${(REFERRAL_BONUS * 0.01).toFixed(2)}) referral bonus to ${customer.referredByUserId}`);
              }
            }
          }
        }
      } catch (customerRewardError) {
        console.error("Error awarding customer rewards:", customerRewardError);
      }

      res.json(updatedLead);
    } catch (error) {
      console.error("Error completing job:", error);
      res.status(500).json({ error: "Failed to complete job" });
    }
  });

  // Photo management for jobs
  app.post("/api/leads/:id/photos", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const { id } = req.params;
      const employeeId = req.currentUser.id;
      
      // Verify the employee is assigned to this job
      const lead = await storage.getLead(id);
      if (!lead) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      if (lead.assignedToUserId !== employeeId) {
        return res.status(403).json({ error: "You can only add photos to your assigned jobs" });
      }
      
      // Validate photo data using schema
      const { jobPhotoSchema } = await import("@shared/schema");
      const validatedPhoto = jobPhotoSchema.parse(req.body);
      
      const updatedLead = await storage.addJobPhoto(id, validatedPhoto);
      if (!updatedLead) {
        return res.status(404).json({ error: "Failed to add photo" });
      }

      res.json({ success: true, photo: validatedPhoto, updatedLead });
    } catch (error) {
      console.error("Error adding job photo:", error);
      if (error instanceof Error && error.message.includes("Invalid")) {
        return res.status(400).json({ error: "Invalid photo data" });
      }
      res.status(500).json({ error: "Failed to add photo" });
    }
  });

  // Notification routes
  app.get("/api/notifications", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const notifications = await storage.getUserNotifications(userId, limit);
      res.json({ notifications });
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const { id } = req.params;
      const notification = await storage.markNotificationAsRead(id);
      
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      
      res.json({ success: true, notification });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/notifications/mark-all-read", isAuthenticated, requireEmployee, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      await storage.markAllNotificationsAsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  app.post("/api/notifications/subscribe", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { pushSubscriptionSchema } = await import("@shared/schema");
      const subscription = pushSubscriptionSchema.parse(req.body);
      
      const user = await storage.updateUserPushSubscription(userId, subscription);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ success: true, message: "Push notifications enabled" });
    } catch (error) {
      console.error("Error subscribing to push notifications:", error);
      res.status(500).json({ error: "Failed to subscribe to push notifications" });
    }
  });

  // Rewards system routes
  // NOTE: Daily check-in system has been replaced with unified mining system
  // Mining now includes streak tracking - claiming daily gives bonus rewards (1% per day, linear)
  // See server/services/mining.ts for the unified system

  // Get wallet balance
  app.get("/api/rewards/wallet", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      
      const wallet = await db
        .select()
        .from(walletAccounts)
        .where(eq(walletAccounts.userId, userId))
        .limit(1);

      if (wallet.length === 0) {
        // Create wallet if it doesn't exist
        const newWallet = await db.insert(walletAccounts).values({
          userId
        }).returning();
        return res.json(newWallet[0]);
      }

      res.json(wallet[0]);
    } catch (error) {
      console.error("Error getting wallet:", error);
      res.status(500).json({ error: "Failed to get wallet" });
    }
  });

  // Get rewards history
  app.get("/api/rewards/history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const rewardsHistory = await db
        .select({
          id: rewards.id,
          rewardType: rewards.rewardType,
          tokenAmount: rewards.tokenAmount,
          cashValue: rewards.cashValue,
          status: rewards.status,
          earnedDate: rewards.earnedDate,
          redeemedDate: rewards.redeemedDate,
          metadata: rewards.metadata
        })
        .from(rewards)
        .where(eq(rewards.userId, userId))
        .orderBy(desc(rewards.earnedDate))
        .limit(limit);

      res.json(rewardsHistory);
    } catch (error) {
      console.error("Error getting rewards history:", error);
      res.status(500).json({ error: "Failed to get rewards history" });
    }
  });

  // Get token price and info
  app.get("/api/rewards/token-info", isAuthenticated, async (req, res) => {
    try {
      const enrichedData = await moonshotService.getEnrichedTokenData();
      
      if (enrichedData) {
        res.json({
          price: enrichedData.price,
          symbol: enrichedData.symbol || 'JCMOVES',
          name: enrichedData.name || 'JC ON THE MOVE Token',
          priceChange24h: enrichedData.priceChange24h,
          volume24h: enrichedData.volume24h,
          marketCap: enrichedData.marketCap,
          fdv: enrichedData.fdv
        });
      } else {
        // Fallback to basic data
        const tokenData = await moonshotService.getTokenData();
        const price = await moonshotService.getTokenPrice();
        
        res.json({
          price,
          symbol: tokenData?.baseToken?.symbol || 'JCMOVES',
          name: tokenData?.baseToken?.name || 'JC ON THE MOVE Token',
          priceChange24h: tokenData?.priceChange?.h24 || 0,
          volume24h: tokenData?.volume?.h24?.total || 0,
          marketCap: 0,
          fdv: 0
        });
      }
    } catch (error) {
      console.error("Error getting token info:", error);
      res.status(500).json({ error: "Failed to get token information" });
    }
  });

  // Cashout endpoints disabled - will be available when connected to Solana blockchain
  // Cashout request
  // app.post("/api/rewards/cashout", isAuthenticated, async (req: any, res) => {
  //   try {
  //     const userId = (req.session as any).userId;
  //     
  //     // Validate request body with Zod
  //     const validatedData = cashoutSchema.parse(req.body);
  //     const { tokenAmount, bankDetails } = validatedData;
  //
  //     // Validate bank details
  //     const validation = cryptoCashoutService.validateBankDetails(bankDetails);
  //     if (!validation.valid) {
  //       return res.status(400).json({ error: validation.errors.join(', ') });
  //     }
  //
  //     // Get current wallet balance
  //     const wallet = await db
  //       .select()
  //       .from(walletAccounts)
  //       .where(eq(walletAccounts.userId, userId))
  //       .limit(1);
  //
  //     if (wallet.length === 0 || parseFloat(wallet[0].tokenBalance || '0') < tokenAmount) {
  //       return res.status(400).json({ error: "Insufficient balance" });
  //     }
  //
  //     // Check eligibility
  //     const eligibility = await rewardsService.validateCashoutEligibility(
  //       parseFloat(wallet[0].tokenBalance || '0'),
  //       tokenAmount
  //     );
  //
  //     if (!eligibility.eligible) {
  //       return res.status(400).json({ error: eligibility.reason });
  //     }
  //
  //     // Calculate cash amount
  //     const cashAmount = await moonshotService.calculateCashValue(tokenAmount);
  //     const conversionRate = await moonshotService.getTokenPrice();
  //
  //     // Encrypt bank details for secure storage
  //     const encryptedBankDetails = await EncryptionService.encryptBankDetails(bankDetails);
  //
  //     // Create cashout request with encrypted bank details
  //     const cashoutRequest = await db.insert(cashoutRequests).values({
  //       userId,
  //       tokenAmount: tokenAmount.toString(),
  //       cashAmount: cashAmount.toString(),
  //       conversionRate: conversionRate.toString(),
  //       bankDetails: encryptedBankDetails
  //     }).returning();
  //
  //     // Initiate external cashout
  //     const externalResult = await cryptoCashoutService.initiateCashout({
  //       userId,
  //       tokenAmount,
  //       cashAmount,
  //       bankDetails
  //     });
  //
  //     // Update request with external transaction ID
  //     await db
  //       .update(cashoutRequests)
  //       .set({
  //         externalTransactionId: externalResult.id,
  //         status: externalResult.status,
  //         failureReason: externalResult.failureReason
  //       })
  //       .where(eq(cashoutRequests.id, cashoutRequest[0].id));
  //
  //     if (externalResult.status !== 'failed') {
  //       // Deduct from wallet balance (reserve tokens)
  //       await db
  //         .update(walletAccounts)
  //         .set({
  //           tokenBalance: (parseFloat(wallet[0].tokenBalance || '0') - tokenAmount).toString(),
  //           lastActivity: new Date()
  //         })
  //         .where(eq(walletAccounts.userId, userId));
  //     }
  //
  //     res.json({
  //       success: true,
  //       cashoutId: cashoutRequest[0].id,
  //       externalId: externalResult.id,
  //       status: externalResult.status,
  //       cashAmount,
  //       estimatedCompletion: "1-3 business days"
  //     });
  //
  //   } catch (error) {
  //     console.error("Cashout error:", error);
  //     res.status(500).json({ error: "Cashout request failed" });
  //   }
  // });

  // Get cashout history
  // app.get("/api/rewards/cashouts", isAuthenticated, async (req: any, res) => {
  //   try {
  //     const userId = (req.session as any).userId;
  //     
  //     const cashouts = await db
  //       .select({
  //         id: cashoutRequests.id,
  //         tokenAmount: cashoutRequests.tokenAmount,
  //         cashAmount: cashoutRequests.cashAmount,
  //         status: cashoutRequests.status,
  //         createdAt: cashoutRequests.createdAt,
  //         processedDate: cashoutRequests.processedDate,
  //         failureReason: cashoutRequests.failureReason
  //       })
  //       .from(cashoutRequests)
  //       .where(eq(cashoutRequests.userId, userId))
  //       .orderBy(desc(cashoutRequests.createdAt))
  //       .limit(50);
  //
  //     res.json(cashouts);
  //   } catch (error) {
  //     console.error("Error getting cashout history:", error);
  //     res.status(500).json({ error: "Failed to get cashout history" });
  //   }
  // });

  // Admin/Business owner routes for rewards management
  app.get("/api/admin/rewards/stats", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      // Get rewards statistics
      const totalRewardsIssued = await db
        .select()
        .from(rewards)
        .then(rows => rows.reduce((sum, reward) => sum + parseFloat(reward.tokenAmount), 0));

      const totalCashouts = await db
        .select()
        .from(cashoutRequests)
        .where(eq(cashoutRequests.status, 'completed'))
        .then(rows => rows.reduce((sum, cashout) => sum + parseFloat(cashout.cashAmount), 0));

      const activeUsers = await db
        .select()
        .from(walletAccounts)
        .then(rows => rows.filter(w => parseFloat(w.tokenBalance || '0') > 0).length);

      // Count today's mining claims (replaces daily check-ins)
      const { miningClaims } = await import('@shared/schema');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const recentClaims = await db
        .select()
        .from(miningClaims)
        .where(sql`${miningClaims.claimTime} >= ${today}`)
        .then(rows => rows.length);

      res.json({
        totalRewardsIssued,
        totalCashouts,
        activeUsers,
        recentClaims // Changed from recentCheckins to recentClaims
      });
    } catch (error) {
      console.error("Error getting reward stats:", error);
      res.status(500).json({ error: "Failed to get reward statistics" });
    }
  });

  // Admin reward settings management
  app.get("/api/admin/reward-settings", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { rewardSettings } = await import('@shared/schema');
      const settings = await db
        .select()
        .from(rewardSettings)
        .orderBy(rewardSettings.settingKey);
      res.json(settings);
    } catch (error) {
      console.error("Error getting reward settings:", error);
      res.status(500).json({ error: "Failed to get reward settings" });
    }
  });

  app.put("/api/admin/reward-settings/:key", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { key } = req.params;
      const { tokenAmount, isActive } = req.body;
      const userId = (req.session as any).userId;
      
      if (typeof tokenAmount !== 'number' || tokenAmount < 0) {
        return res.status(400).json({ error: "Token amount must be a positive number" });
      }

      const { rewardSettings } = await import('@shared/schema');
      const [updated] = await db
        .update(rewardSettings)
        .set({
          tokenAmount: tokenAmount.toFixed(2),
          isActive: isActive ?? true,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(rewardSettings.settingKey, key))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Reward setting not found" });
      }

      console.log(`📊 Reward setting '${key}' updated to ${tokenAmount} JCMOVES by admin ${userId}`);
      res.json(updated);
    } catch (error) {
      console.error("Error updating reward setting:", error);
      res.status(500).json({ error: "Failed to update reward setting" });
    }
  });

  // Referral System Routes
  
  // Get user's referral code (generate if needed)
  app.get("/api/referrals/my-code", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const referralCode = await storage.generateReferralCode(userId);
      res.json({ referralCode });
    } catch (error) {
      console.error("Error getting referral code:", error);
      res.status(500).json({ error: "Failed to get referral code" });
    }
  });

  // Apply a referral code
  app.post("/api/referrals/apply", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { referralCode } = referralCodeSchema.parse(req.body);
      const { TREASURY_CONFIG, REWARD_TYPES } = await import('./constants');
      
      const result = await storage.applyReferralCode(userId, referralCode);
      
      if (result.success && result.referrerId) {
        // Award referral request bonus to referrer (50 JCMOVES / $0.50)
        try {
          const REFERRAL_REQUEST_REWARD = TREASURY_CONFIG.REFERRAL_REQUEST_TOKENS;
          await storage.creditWalletTokens(result.referrerId, REFERRAL_REQUEST_REWARD);
          await db.insert(rewards).values({
            recipientId: result.referrerId,
            type: REWARD_TYPES.REFERRAL_REQUEST,
            tokenAmount: REFERRAL_REQUEST_REWARD.toFixed(8),
            status: "confirmed",
            createdAt: new Date(),
            metadata: { referredUserId: userId }
          });
          console.log(`🎁 Awarded ${REFERRAL_REQUEST_REWARD} JCMOVES ($${(REFERRAL_REQUEST_REWARD * 0.01).toFixed(2)}) to referrer ${result.referrerId} for referral request`);
        } catch (rewardError) {
          console.error("Error awarding referral request bonus:", rewardError);
        }
        
        res.json({
          success: true,
          message: "Referral code applied successfully! Your referrer earned a bonus."
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error("Error applying referral code:", error);
      res.status(500).json({ error: "Failed to apply referral code" });
    }
  });

  // Get referral stats
  app.get("/api/referrals/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const stats = await storage.getReferralStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error getting referral stats:", error);
      res.status(500).json({ error: "Failed to get referral stats" });
    }
  });

  // Treasury Management Routes (Business Owner Only)
  
  // Deposit funds into treasury
  app.post("/api/treasury/deposit", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const depositData = treasuryDepositSchema.parse(req.body);
      const userId = (req.session as any).userId;
      
      const result = await treasuryService.depositTokens(
        userId,
        depositData.amount,
        depositData.depositMethod,
        depositData.notes
      );
      
      if (result.success) {
        res.json({ 
          success: true, 
          deposit: result.deposit,
          message: `Successfully deposited ${depositData.amount.toLocaleString()} JCMOVES into treasury`
        });
      } else {
        res.status(400).json({ 
          success: false, 
          error: result.error 
        });
      }
    } catch (error) {
      console.error("Error depositing treasury tokens:", error);
      res.status(400).json({ error: "Invalid deposit data" });
    }
  });

  // Moonshot funding deposit endpoint
  app.post("/api/treasury/moonshot-deposit", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const transferData = moonshotAccountTransferSchema.parse(req.body);
      const userId = (req.session as any).userId;
      
      // Initiate Moonshot transfer
      const transferHash = await moonshotService.initiateAccountTransfer(transferData);
      
      // Check transfer status with original request data for accurate metadata
      const transferStatus = await moonshotService.checkAccountTransferStatus(transferHash, transferData);
      
      if (transferStatus.status === "completed" && transferStatus.metadata) {
        // Create funding deposit record
        const depositAmount = transferStatus.metadata.usdValue;
        const tokenPrice = await moonshotService.getTokenPrice();
        
        const result = await treasuryService.depositFunds(
          userId,
          depositAmount,
          "moonshot",
          `Moonshot transfer: ${transferHash}`
        );
        
        if (result.success && result.deposit) {
          // Update deposit with Moonshot metadata
          await storage.updateFundingDeposit(result.deposit.id, {
            externalTransactionId: transferHash,
            moonshotMetadata: transferStatus.metadata
          });
          
          res.json({ 
            success: true, 
            deposit: result.deposit,
            moonshotMetadata: transferStatus.metadata,
            message: `Successfully transferred ${transferStatus.metadata.tokenAmount} ${transferStatus.metadata.tokenSymbol} ($${depositAmount.toFixed(2)}) from Moonshot account`
          });
        } else {
          res.status(400).json({ 
            success: false, 
            error: result.error || "Failed to record deposit"
          });
        }
      } else {
        res.status(400).json({ 
          success: false, 
          error: "Moonshot transfer failed or is still pending"
        });
      }
    } catch (error) {
      console.error("Error processing Moonshot deposit:", error);
      res.status(400).json({ 
        error: error instanceof Error ? error.message : "Invalid Moonshot transfer data" 
      });
    }
  });

  // Record a completed token deposit from external source (like Moonshot app)
  app.post("/api/treasury/record-token-deposit", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { tokenAmount, transactionHash, moonshotAccountId, notes } = req.body;
      const userId = (req.session as any).userId;

      // Validation
      if (!tokenAmount || typeof tokenAmount !== 'number' || tokenAmount <= 0) {
        return res.status(400).json({ error: "Valid token amount is required" });
      }
      if (!transactionHash || typeof transactionHash !== 'string') {
        return res.status(400).json({ error: "Transaction hash is required" });
      }

      const result = await treasuryService.depositTokensFromMoonshot(
        userId,
        tokenAmount,
        transactionHash,
        moonshotAccountId,
        notes
      );

      if (result.success && result.deposit) {
        res.json({
          success: true,
          deposit: result.deposit,
          message: `Successfully recorded deposit of ${tokenAmount.toLocaleString()} JCMOVES tokens`
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || "Failed to record token deposit"
        });
      }
    } catch (error) {
      console.error("Error recording token deposit:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to record token deposit" 
      });
    }
  });

  // Get treasury status and health
  app.get("/api/treasury/status", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const [stats, funding, healthCheck, fundingDays] = await Promise.all([
        treasuryService.getTreasuryStats(),
        treasuryService.getFundingStatus(),
        treasuryService.getHealthCheck(),
        treasuryService.getEstimatedFundingDays()
      ]);

      res.json({
        stats,
        funding,
        health: healthCheck,
        estimatedFundingDays: fundingDays
      });
    } catch (error) {
      console.error("Error getting treasury status:", error);
      res.status(500).json({ error: "Failed to get treasury status" });
    }
  });


  // Get funding deposit history
  app.get("/api/treasury/deposits", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const deposits = await treasuryService.getFundingHistory();
      res.json({ deposits });
    } catch (error) {
      console.error("Error getting funding history:", error);
      res.status(500).json({ error: "Failed to get funding history" });
    }
  });

  // Get reserve transaction history
  app.get("/api/treasury/transactions", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      // Sanitize and validate limit parameter
      const limitParam = Number(req.query.limit);
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
      
      const transactions = await treasuryService.getRecentTransactions(limit);
      res.json({ transactions, pagination: { limit } });
    } catch (error) {
      console.error("Error getting reserve transactions:", error);
      res.status(500).json({ error: "Failed to get reserve transactions" });
    }
  });

  // Get treasury analytics and distribution patterns
  app.get("/api/treasury/analytics", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const analytics = await getTreasuryAnalytics();
      res.json(analytics);
    } catch (error) {
      console.error("Error getting treasury analytics:", error);
      res.status(500).json({ error: "Failed to get treasury analytics" });
    }
  });

  // Get treasury reports (time-series data for charts)
  app.get("/api/treasury/reports", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { period = '30d', type = 'all' } = req.query;
      const reports = await getTreasuryReports(period as string, type as string);
      res.json(reports);
    } catch (error) {
      console.error("Error getting treasury reports:", error);
      res.status(500).json({ error: "Failed to get treasury reports" });
    }
  });

  // Get treasury dashboard summary (quick stats for widgets)
  app.get("/api/treasury/summary", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const [stats, funding, healthCheck, fundingDays] = await Promise.all([
        treasuryService.getTreasuryStats(),
        treasuryService.getFundingStatus(),
        treasuryService.getHealthCheck(),
        treasuryService.getEstimatedFundingDays()
      ]);

      // Get weekly activity data
      const weeklyActivity = {
        recentDeposits: 1, // We have 1 deposit of $1000
        recentDistributions: 0,
        activeUsersWeek: 1
      };

      const response = {
        stats,
        funding,
        health: healthCheck,
        estimatedFundingDays: fundingDays,
        weeklyActivity
      };
      
      res.json(response);
    } catch (error) {
      console.error("Error getting treasury summary:", error);
      res.status(500).json({ error: "Failed to get treasury summary" });
    }
  });

  // Get treasury configuration
  app.get("/api/treasury/config", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const config = getTreasuryConfig();
      res.json(config);
    } catch (error) {
      console.error("Error getting treasury config:", error);
      res.status(500).json({ error: "Failed to get treasury config" });
    }
  });

  // Treasury limits API (admin configurable up to 500M JCMOVES)
  app.get("/api/treasury/limits", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const limits = await storage.getTreasuryLimits();
      res.json({ limits });
    } catch (error) {
      console.error("Error getting treasury limits:", error);
      res.status(500).json({ error: "Failed to get treasury limits" });
    }
  });

  app.put("/api/treasury/limits/:limitType", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { limitType } = req.params;
      const { limitValue, notes } = req.body;
      const userId = (req.session as any).userId;

      // Validate limit type is one of the known types
      const validLimitTypes = ['per_transaction', 'daily', 'minimum_reserve'];
      if (!validLimitTypes.includes(limitType)) {
        return res.status(400).json({ error: "Invalid limit type" });
      }

      if (typeof limitValue !== 'number' || limitValue < 0) {
        return res.status(400).json({ error: "Invalid limit value" });
      }

      // Validate limit doesn't exceed 500M cap
      const maxLimit = 500000000;
      if (limitValue > maxLimit) {
        return res.status(400).json({ error: `Limit cannot exceed ${maxLimit.toLocaleString()} JCMOVES` });
      }

      const updated = await storage.updateTreasuryLimit(limitType, limitValue, userId, notes);
      if (!updated) {
        return res.status(404).json({ error: "Limit type not found" });
      }

      console.log(`[TREASURY] Admin ${userId} updated ${limitType} limit to ${limitValue.toLocaleString()} JCMOVES`);
      res.json({ success: true, limit: updated });
    } catch (error) {
      console.error("Error updating treasury limit:", error);
      res.status(500).json({ error: "Failed to update treasury limit" });
    }
  });

  // Buyback fund stats API - Get current buyback fund balances and lifetime stats
  // Now includes live blockchain balance from burn wallet for full transparency
  app.get("/api/treasury/buyback-fund", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const stats = await storage.getBuybackFundStats();
      
      // Get live blockchain balance from burn wallet
      const burnWalletBalance = await solanaTransferService.getBurnWalletBalance();
      
      res.json({ 
        success: true,
        fund: {
          tokenBalance: stats.tokenBalance,
          totalTokensCollected: stats.totalTokensCollected,
          feeContributionCount: stats.feeContributionCount,
          lastUpdated: stats.lastUpdated
        },
        burnWallet: {
          address: burnWalletBalance.address,
          tokenBalance: burnWalletBalance.tokenBalance,
          solBalance: burnWalletBalance.solBalance
        }
      });
    } catch (error) {
      console.error("Error getting buyback fund stats:", error);
      res.status(500).json({ error: "Failed to get buyback fund stats" });
    }
  });

  // Token conversions API (JCMOVES/SOL/ETH swap tracking)
  app.get("/api/conversions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const user = await storage.getUser(userId);
      
      // Admin can see all conversions, others only their own
      const conversions = user?.role === 'admin' 
        ? await storage.getTokenConversions(undefined, 100)
        : await storage.getTokenConversions(userId, 50);
      
      res.json({ conversions });
    } catch (error) {
      console.error("Error getting token conversions:", error);
      res.status(500).json({ error: "Failed to get token conversions" });
    }
  });

  // ====================== CRYPTO PORTFOLIO MANAGEMENT API ======================

  // Get comprehensive crypto portfolio performance metrics
  app.get("/api/treasury/crypto/portfolio", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const portfolioData = await treasuryService.getCryptoPortfolioPerformance();
      res.json(portfolioData);
    } catch (error) {
      console.error("Error getting crypto portfolio data:", error);
      res.status(500).json({ error: "Failed to get crypto portfolio data" });
    }
  });

  // Get advanced risk assessment with volatility protection
  app.get("/api/treasury/crypto/risk-assessment", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const riskData = await treasuryService.getAdvancedRiskAssessment();
      res.json(riskData);
    } catch (error) {
      console.error("Error getting risk assessment:", error);
      res.status(500).json({ error: "Failed to get risk assessment data" });
    }
  });

  // Get comprehensive treasury health score
  app.get("/api/treasury/crypto/health-score", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const healthScore = await treasuryService.getTreasuryHealthScore();
      res.json(healthScore);
    } catch (error) {
      console.error("Error getting treasury health score:", error);
      res.status(500).json({ error: "Failed to get treasury health score" });
    }
  });

  // Get current JCMOVES market data and pricing
  app.get("/api/treasury/crypto/market-data", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const [currentPrice, marketData, volatility] = await Promise.all([
        treasuryService.getCurrentTokenPrice(),
        treasuryService.getMarketData(),
        treasuryService.checkVolatility()
      ]);
      
      res.json({
        currentPrice,
        marketData,
        volatility,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error getting market data:", error);
      res.status(500).json({ error: "Failed to get market data" });
    }
  });

  // Get real-time JCMOVES token price with live updates (for public display)
  app.get("/api/crypto/live-price", async (req, res) => {
    try {
      const { moonshotService } = await import('./services/moonshot');
      const tokenData = await moonshotService.getTokenData();
      
      if (!tokenData) {
        // Fallback to basic price if full data unavailable
        const price = await moonshotService.getTokenPrice();
        return res.json({
          price: price,
          priceFormatted: `$${price.toFixed(10)}`,
          change24h: null,
          changePercent24h: null,
          volume24h: null,
          lastUpdated: new Date().toISOString(),
          status: 'fallback'
        });
      }

      const price = parseFloat(tokenData.priceUsd);
      const change24h = tokenData.priceChange?.h24 || 0;
      const volume24h = tokenData.volume?.h24?.total || 0;

      res.json({
        price: price,
        priceFormatted: `$${price.toFixed(10)}`,
        change24h: change24h,
        changePercent24h: `${change24h > 0 ? '+' : ''}${change24h.toFixed(2)}%`,
        volume24h: volume24h,
        volumeFormatted: `$${volume24h.toLocaleString()}`,
        symbol: tokenData.baseToken?.symbol || 'JCMOVES',
        tokenName: tokenData.baseToken?.name || 'JC ON THE MOVE',
        lastUpdated: new Date().toISOString(),
        status: 'live'
      });
    } catch (error) {
      console.error("Error getting live token price:", error);
      res.status(500).json({ error: "Failed to get live price data" });
    }
  });

  // Get live blockchain balance for treasury wallet
  app.get("/api/solana/balance", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const result = await solanaMonitor.getLiveTokenBalance();
      res.json(result);
    } catch (error) {
      console.error("Error fetching live blockchain balance:", error);
      res.status(500).json({ 
        success: false,
        balance: 0,
        walletAddress: '',
        error: error instanceof Error ? error.message : "Failed to fetch balance" 
      });
    }
  });

  // Scan historical blockchain transactions and reconcile missing deposits
  // TEMPORARILY UNAUTHENTICATED FOR TESTING - RE-ENABLE AUTH AFTER TESTING
  app.post("/api/solana/scan-history", async (req, res) => {
    try {
      // Validate and constrain limit parameter (1-200)
      const limitParam = parseInt(req.body.limit as string);
      const limit = Number.isFinite(limitParam) && limitParam >= 1 && limitParam <= 200 
        ? limitParam 
        : 100;
      
      console.log(`[BLOCKCHAIN SCAN] Admin ${req.currentUser?.email} initiated scan with limit: ${limit}`);
      
      const result = await solanaMonitor.scanHistoricalTransactions(limit);
      
      // Log scan results for audit trail
      console.log(`[BLOCKCHAIN SCAN] Complete - Scanned: ${result.scanned}, Found: ${result.found}, Recorded: ${result.recorded}`);
      
      res.json(result);
    } catch (error) {
      console.error("Error scanning blockchain history:", error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : "Failed to scan history" 
      });
    }
  });

  // Transfer JCMOVES tokens between wallets - REAL BLOCKCHAIN TRANSFER
  app.post("/api/treasury/transfer", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { recipientAddress, amount, executeOnChain } = req.body;

      if (!recipientAddress || typeof recipientAddress !== 'string') {
        return res.status(400).json({ error: "Recipient address is required" });
      }

      if (!amount || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
      }

      // Get current token balance
      const liveBalance = await solanaMonitor.getLiveTokenBalance();
      if (!liveBalance.success || liveBalance.balance < amount) {
        return res.status(400).json({ 
          error: `Insufficient balance. Available: ${liveBalance.balance} JCMOVES, Requested: ${amount} JCMOVES` 
        });
      }

      const tokenPrice = await moonshotService.getTokenPrice();
      const usdValue = amount * tokenPrice;

      // If executeOnChain is true and the transfer service is operational, execute real blockchain transfer
      if (executeOnChain && solanaTransferService.isOperational()) {
        console.log(`[BLOCKCHAIN TRANSFER] Executing on-chain transfer: ${amount} JCMOVES to ${recipientAddress}`);
        
        const transferResult = await solanaTransferService.transferTokens({
          recipientAddress,
          amount,
          memo: `Treasury transfer by admin ${req.currentUser?.email}`
        });

        if (!transferResult.success) {
          return res.status(400).json({ 
            success: false,
            error: transferResult.error || "Blockchain transfer failed"
          });
        }

        // Record successful blockchain transfer in database
        const transaction = await storage.deductFromReserve(
          amount,
          `Blockchain transfer to ${recipientAddress.slice(0, 8)}...${recipientAddress.slice(-6)}`,
          tokenPrice,
          'blockchain_transfer',
          recipientAddress
        );

        console.log(`[BLOCKCHAIN TRANSFER] ✅ Success! TX: ${transferResult.transactionHash}`);

        return res.json({
          success: true,
          message: "Blockchain transfer completed successfully",
          transactionHash: transferResult.transactionHash,
          transaction: {
            id: transaction.id,
            amount,
            usdValue,
            recipientAddress,
            timestamp: transaction.createdAt
          },
          explorerUrl: `https://solscan.io/tx/${transferResult.transactionHash}`
        });
      }

      // Fallback: Record transfer intent only (no blockchain execution)
      const transaction = await storage.deductFromReserve(
        amount,
        `Transfer to ${recipientAddress.slice(0, 8)}...${recipientAddress.slice(-6)}`,
        tokenPrice,
        'transfer',
        recipientAddress
      );

      console.log(`[TRANSFER] Recorded: ${amount} JCMOVES to ${recipientAddress}, USD value: $${usdValue.toFixed(2)}`);

      const transferServiceStatus = solanaTransferService.getStatus();
      
      res.json({
        success: true,
        message: "Transfer recorded successfully",
        transaction: {
          id: transaction.id,
          amount,
          usdValue,
          recipientAddress,
          timestamp: transaction.createdAt
        },
        blockchainEnabled: transferServiceStatus.operational,
        note: transferServiceStatus.operational 
          ? "Set executeOnChain=true to execute real blockchain transfer"
          : `Blockchain transfers disabled: ${transferServiceStatus.error}`
      });
    } catch (error) {
      console.error("Error processing transfer:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to process transfer" 
      });
    }
  });

  // Get blockchain transfer service status
  app.get("/api/treasury/transfer/status", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const status = solanaTransferService.getStatus();
      const balance = await solanaTransferService.getTreasuryBalance();
      
      res.json({
        ...status,
        balance: {
          sol: balance.solBalance,
          tokens: balance.tokenBalance
        }
      });
    } catch (error) {
      console.error("Error getting transfer status:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get status" 
      });
    }
  });

  // Switch active treasury wallet
  app.post("/api/treasury/switch-wallet", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { walletType } = req.body;
      
      if (!walletType || !['primary', 'jcmoves_banks', 'in_god_we_trust'].includes(walletType)) {
        return res.status(400).json({ error: "Invalid wallet type. Must be 'primary', 'jcmoves_banks', or 'in_god_we_trust'" });
      }

      const success = solanaTransferService.switchActiveWallet(walletType);
      
      if (!success) {
        return res.status(400).json({ error: `Wallet '${walletType}' is not configured or available` });
      }

      const status = solanaTransferService.getStatus();
      const balance = await solanaTransferService.getTreasuryBalance();

      console.log(`[TREASURY] Admin ${req.currentUser?.email} switched active wallet to: ${walletType}`);

      res.json({
        success: true,
        message: `Switched to ${walletType} wallet`,
        activeWallet: status.activeWallet,
        address: status.address,
        balance: {
          sol: balance.solBalance,
          tokens: balance.tokenBalance
        }
      });
    } catch (error) {
      console.error("Error switching wallet:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to switch wallet" });
    }
  });

  // Get buyback fund status
  app.get("/api/treasury/buyback/status", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const fund = await db.query.buybackFund.findFirst();
      const recentBuybacks = await db.query.buybackTransactions.findMany({
        orderBy: (tx, { desc }) => [desc(tx.createdAt)],
        limit: 10
      });
      const recentFees = await db.query.transferFees.findMany({
        orderBy: (fee, { desc }) => [desc(fee.createdAt)],
        limit: 20
      });

      res.json({
        fund: fund || {
          solBalance: "0",
          totalCollected: "0",
          totalUsedForBuyback: "0",
          totalTokensBought: "0",
          buybackCount: 0
        },
        recentBuybacks,
        recentFees,
        platformFeeRate: 0.00001 // 2x base Solana fee (~0.000005 SOL)
      });
    } catch (error) {
      console.error("Error getting buyback status:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get buyback status" });
    }
  });

  // ====================== COMPLIANT SWAP REQUEST SYSTEM (Option A) ======================
  // Users REQUEST swaps, admin reviews and fulfills manually off-platform
  // NO live prices, NO automated execution, NO exchange functionality

  // Get swap rules (public for form validation)
  app.get("/api/swap-rules", async (req, res) => {
    try {
      const rules = await db.query.treasurySwapRules.findFirst();
      if (!rules) {
        return res.json({
          monthlySwapCapTokens: "500000",
          maxPerUserPerMonth: "10000",
          minSwapAmount: "100",
          maxSwapAmount: "50000",
          approvedAssets: ["SOL", "USDC"],
          swapsEnabled: true
        });
      }
      res.json(rules);
    } catch (error) {
      console.error("Error getting swap rules:", error);
      res.status(500).json({ error: "Failed to get swap rules" });
    }
  });

  // Submit a swap request (user)
  app.post("/api/swap-requests", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as Express.User;
      const { jcmovesAmount, desiredAsset, destinationWallet, acknowledgedManualProcess, acknowledgedNoGuaranteedRate, acknowledgedTerms } = req.body;

      // Validate required acknowledgements
      if (!acknowledgedManualProcess || !acknowledgedNoGuaranteedRate || !acknowledgedTerms) {
        return res.status(400).json({ error: "All acknowledgements must be accepted" });
      }

      // Get swap rules
      const rules = await db.query.treasurySwapRules.findFirst();
      if (!rules?.swapsEnabled) {
        return res.status(400).json({ error: "Swap requests are currently disabled" });
      }

      // Validate amount
      const amount = parseFloat(jcmovesAmount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      if (amount < parseFloat(rules.minSwapAmount || "100")) {
        return res.status(400).json({ error: `Minimum swap amount is ${rules.minSwapAmount} JCMOVES` });
      }
      if (amount > parseFloat(rules.maxSwapAmount || "50000")) {
        return res.status(400).json({ error: `Maximum swap amount is ${rules.maxSwapAmount} JCMOVES` });
      }

      // Validate asset
      const approvedAssets = rules.approvedAssets || ["SOL", "USDC"];
      if (!approvedAssets.includes(desiredAsset)) {
        return res.status(400).json({ error: `Asset not supported. Approved: ${approvedAssets.join(", ")}` });
      }

      // Validate wallet address
      const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      if (!solanaAddressRegex.test(destinationWallet)) {
        return res.status(400).json({ error: "Invalid Solana wallet address" });
      }

      // Check user's monthly usage
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const userMonthlyRequests = await db.query.swapRequests.findMany({
        where: (sr, { eq, and, gte }) => and(
          eq(sr.userId, user.id),
          gte(sr.createdAt, startOfMonth)
        )
      });

      const userMonthlyTotal = userMonthlyRequests.reduce((sum, r) => sum + parseFloat(r.jcmovesAmount), 0);
      const maxPerUser = parseFloat(rules.maxPerUserPerMonth || "10000");
      
      if (userMonthlyTotal + amount > maxPerUser) {
        return res.status(400).json({ 
          error: `This would exceed your monthly limit. Used: ${userMonthlyTotal.toFixed(2)}, Limit: ${maxPerUser}` 
        });
      }

      // Create swap request
      const [request] = await db.insert(swapRequests).values({
        userId: user.id,
        userEmail: user.email,
        userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        jcmovesAmount: amount.toString(),
        desiredAsset,
        destinationWallet,
        acknowledgedManualProcess: true,
        acknowledgedNoGuaranteedRate: true,
        acknowledgedTerms: true,
        status: "pending"
      }).returning();

      console.log(`[SWAP REQUEST] User ${user.email} submitted request for ${amount} JCMOVES -> ${desiredAsset}`);

      res.json({
        success: true,
        message: "Your swap request has been submitted for manual review. You will be notified once processed.",
        request: {
          id: request.id,
          amount: request.jcmovesAmount,
          desiredAsset: request.desiredAsset,
          status: request.status,
          createdAt: request.createdAt
        }
      });
    } catch (error) {
      console.error("Error submitting swap request:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to submit request" });
    }
  });

  // Get user's own swap requests
  app.get("/api/swap-requests/my", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as Express.User;
      const requests = await db.query.swapRequests.findMany({
        where: (sr, { eq }) => eq(sr.userId, user.id),
        orderBy: (sr, { desc }) => [desc(sr.createdAt)]
      });
      res.json({ requests });
    } catch (error) {
      console.error("Error getting user swap requests:", error);
      res.status(500).json({ error: "Failed to get requests" });
    }
  });

  // Get all swap requests (admin only)
  app.get("/api/swap-requests", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      
      let requests;
      if (status) {
        requests = await db.query.swapRequests.findMany({
          where: (sr, { eq }) => eq(sr.status, status),
          orderBy: (sr, { desc }) => [desc(sr.createdAt)]
        });
      } else {
        requests = await db.query.swapRequests.findMany({
          orderBy: (sr, { desc }) => [desc(sr.createdAt)]
        });
      }
      res.json({ requests });
    } catch (error) {
      console.error("Error getting swap requests:", error);
      res.status(500).json({ error: "Failed to get requests" });
    }
  });

  // Review a swap request (approve/decline) - admin only
  app.patch("/api/swap-requests/:id/review", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { action, reviewNotes, declineReason } = req.body;
      const admin = req.user as Express.User;

      if (!["approve", "decline"].includes(action)) {
        return res.status(400).json({ error: "Action must be 'approve' or 'decline'" });
      }

      const request = await db.query.swapRequests.findFirst({
        where: (sr, { eq }) => eq(sr.id, id)
      });

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      if (request.status !== "pending") {
        return res.status(400).json({ error: "Request has already been reviewed" });
      }

      const newStatus = action === "approve" ? "approved" : "declined";

      await db.update(swapRequests)
        .set({
          status: newStatus,
          reviewedBy: admin.email,
          reviewedAt: new Date(),
          reviewNotes: reviewNotes || null,
          declineReason: action === "decline" ? declineReason : null,
          updatedAt: new Date()
        })
        .where(eq(swapRequests.id, id));

      console.log(`[SWAP REQUEST] Admin ${admin.email} ${action}d request ${id}`);

      res.json({
        success: true,
        message: `Request ${action}d successfully`,
        status: newStatus
      });
    } catch (error) {
      console.error("Error reviewing swap request:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to review request" });
    }
  });

  // Mark swap as fulfilled (after manual off-platform execution) - admin only
  app.patch("/api/swap-requests/:id/fulfill", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { id } = req.params;
      const { fulfilledAmount, fulfillmentTxHash, fulfillmentMethod } = req.body;
      const admin = req.user as Express.User;

      const request = await db.query.swapRequests.findFirst({
        where: (sr, { eq }) => eq(sr.id, id)
      });

      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      if (request.status !== "approved") {
        return res.status(400).json({ error: "Request must be approved before fulfillment" });
      }

      await db.update(swapRequests)
        .set({
          status: "completed",
          fulfilledAmount: fulfilledAmount?.toString() || null,
          fulfillmentTxHash: fulfillmentTxHash || null,
          fulfilledBy: admin.email,
          fulfilledAt: new Date(),
          fulfillmentMethod: fulfillmentMethod || "treasury",
          updatedAt: new Date()
        })
        .where(eq(swapRequests.id, id));

      // Update monthly usage
      const rules = await db.query.treasurySwapRules.findFirst();
      if (rules) {
        const newUsed = parseFloat(rules.monthlySwapsUsed || "0") + parseFloat(request.jcmovesAmount);
        await db.update(treasurySwapRules)
          .set({
            monthlySwapsUsed: newUsed.toString(),
            lastUpdated: new Date()
          });
      }

      console.log(`[SWAP REQUEST] Admin ${admin.email} fulfilled request ${id} with ${fulfilledAmount} ${request.desiredAsset}`);

      res.json({
        success: true,
        message: "Request marked as fulfilled",
        status: "completed"
      });
    } catch (error) {
      console.error("Error fulfilling swap request:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fulfill request" });
    }
  });

  // Update swap rules (admin only)
  app.patch("/api/swap-rules", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const admin = req.user as Express.User;
      const { monthlySwapCapTokens, maxPerUserPerMonth, minSwapAmount, maxSwapAmount, approvedAssets, swapsEnabled } = req.body;

      const existingRules = await db.query.treasurySwapRules.findFirst();
      
      if (existingRules) {
        await db.update(treasurySwapRules)
          .set({
            monthlySwapCapTokens: monthlySwapCapTokens?.toString() || existingRules.monthlySwapCapTokens,
            maxPerUserPerMonth: maxPerUserPerMonth?.toString() || existingRules.maxPerUserPerMonth,
            minSwapAmount: minSwapAmount?.toString() || existingRules.minSwapAmount,
            maxSwapAmount: maxSwapAmount?.toString() || existingRules.maxSwapAmount,
            approvedAssets: approvedAssets || existingRules.approvedAssets,
            swapsEnabled: swapsEnabled !== undefined ? swapsEnabled : existingRules.swapsEnabled,
            lastUpdated: new Date(),
            updatedBy: admin.email
          });
      } else {
        await db.insert(treasurySwapRules).values({
          monthlySwapCapTokens: monthlySwapCapTokens?.toString() || "500000",
          maxPerUserPerMonth: maxPerUserPerMonth?.toString() || "10000",
          minSwapAmount: minSwapAmount?.toString() || "100",
          maxSwapAmount: maxSwapAmount?.toString() || "50000",
          approvedAssets: approvedAssets || ["SOL", "USDC"],
          swapsEnabled: swapsEnabled !== undefined ? swapsEnabled : true,
          updatedBy: admin.email
        });
      }

      console.log(`[SWAP RULES] Admin ${admin.email} updated swap rules`);

      res.json({ success: true, message: "Swap rules updated" });
    } catch (error) {
      console.error("Error updating swap rules:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update rules" });
    }
  });

  // ====================== JUPITER SWAP API ======================

  // Get supported tokens for swapping
  app.get("/api/swap/tokens", isAuthenticated, async (req, res) => {
    try {
      const tokens = jupiterSwapService.getSupportedTokens();
      res.json({ tokens });
    } catch (error) {
      console.error("Error getting supported tokens:", error);
      res.status(500).json({ error: "Failed to get supported tokens" });
    }
  });

  // Get swap quote
  app.post("/api/swap/quote", isAuthenticated, async (req, res) => {
    try {
      const { inputMint, outputMint, amount, slippageBps } = req.body;

      if (!inputMint || !outputMint || amount === undefined) {
        return res.status(400).json({ error: "inputMint, outputMint, and amount are required" });
      }

      const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
      
      if (typeof numAmount !== 'number' || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: "Amount must be a positive number" });
      }

      if (numAmount < 0.000001) {
        return res.status(400).json({ error: "Amount is too small for a swap" });
      }

      const quote = await jupiterSwapService.getSwapQuote(
        inputMint,
        outputMint,
        numAmount,
        slippageBps || 50
      );

      if (!quote) {
        return res.status(400).json({ error: "Unable to get swap quote. The token pair may not have sufficient liquidity." });
      }

      res.json({ quote });
    } catch (error) {
      console.error("Error getting swap quote:", error);
      res.status(500).json({ error: "Failed to get swap quote" });
    }
  });

  // Get swap transaction for user to sign
  app.post("/api/swap/transaction", isAuthenticated, async (req, res) => {
    try {
      const { inputMint, outputMint, amount, slippageBps } = req.body;
      const user = req.currentUser;

      if (!user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!inputMint || !outputMint || !amount) {
        return res.status(400).json({ error: "inputMint, outputMint, and amount are required" });
      }

      // Get user's wallet address
      const payoutInfo = await storage.getPayoutAddress(user.id.toString());
      
      if (!payoutInfo.address) {
        return res.status(400).json({ 
          error: "No wallet configured. Please set up your wallet first.",
          needsWallet: true
        });
      }

      const result = await jupiterSwapService.getSwapTransaction(
        inputMint,
        outputMint,
        amount,
        payoutInfo.address,
        slippageBps || 50
      );

      if (!result) {
        return res.status(400).json({ error: "Unable to create swap transaction" });
      }

      res.json({
        transaction: result.transaction,
        quote: result.quote,
        userWallet: payoutInfo.address,
        walletMode: payoutInfo.mode
      });
    } catch (error) {
      console.error("Error getting swap transaction:", error);
      res.status(500).json({ error: "Failed to create swap transaction" });
    }
  });

  // Get token price in USDC
  app.get("/api/swap/price/:tokenMint", isAuthenticated, async (req, res) => {
    try {
      const { tokenMint } = req.params;
      const price = await jupiterSwapService.getTokenPrice(tokenMint);
      
      if (price === null) {
        return res.status(400).json({ error: "Unable to get token price" });
      }

      res.json({ 
        tokenMint,
        priceUsd: price,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error getting token price:", error);
      res.status(500).json({ error: "Failed to get token price" });
    }
  });

  // Convert USD to JCMOVES tokens at current price
  app.post("/api/treasury/crypto/convert-usd", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      // Proper Zod validation
      const { usdAmount } = usdToTokensSchema.parse(req.body);
      
      const conversion = await treasuryService.convertUsdToTokens(usdAmount);
      
      // Enhanced response with price metadata
      res.json({
        ...conversion,
        inputAmount: usdAmount,
        conversionType: 'usd-to-tokens',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: error.errors 
        });
      }
      console.error("Error converting USD to tokens:", error);
      res.status(500).json({ error: "Failed to convert USD to tokens" });
    }
  });

  // Convert JCMOVES tokens to USD at current price  
  app.post("/api/treasury/crypto/convert-tokens", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      // Proper Zod validation
      const { tokenAmount } = tokensToUsdSchema.parse(req.body);
      
      const conversion = await treasuryService.convertTokensToUsd(tokenAmount);
      
      // Enhanced response with price metadata
      res.json({
        ...conversion,
        inputAmount: tokenAmount,
        conversionType: 'tokens-to-usd',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: error.errors 
        });
      }
      console.error("Error converting tokens to USD:", error);
      res.status(500).json({ error: "Failed to convert tokens to USD" });
    }
  });

  // ====================== PRICE HISTORY API ======================
  
  // Get price history for charting
  app.get("/api/price-history", isAuthenticated, async (req, res) => {
    try {
      const range = req.query.range as string || '24h';
      const hours = range === '24h' ? 24 : range === '7d' ? 168 : range === '30d' ? 720 : 24;
      
      const priceData = await storage.getPriceHistory(hours);
      
      // Calculate statistics
      const latest = priceData[priceData.length - 1];
      const first = priceData[0];
      const changePercent = first && latest ? ((latest.price - first.price) / first.price) * 100 : 0;
      
      res.json({
        data: priceData,
        metadata: {
          latestPrice: latest?.price || 0,
          changePercent,
          source: latest?.source || 'unknown',
          range,
          dataPoints: priceData.length
        }
      });
    } catch (error) {
      console.error("Error fetching price history:", error);
      res.status(500).json({ error: "Failed to fetch price history" });
    }
  });
  
  // Poll and store current price (internal/cron endpoint)
  app.post("/api/price-history/poll", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const priceData = await cryptoService.getCurrentPrice();
      const marketData = await cryptoService.getMarketData();
      
      await storage.addPricePoint(
        priceData.price.toString(),
        priceData.source,
        marketData
      );
      
      res.json({ 
        success: true, 
        price: priceData.price,
        source: priceData.source,
        timestamp: new Date()
      });
    } catch (error) {
      console.error("Error polling price:", error);
      res.status(500).json({ error: "Failed to poll price" });
    }
  });

  // Bootstrap endpoint - promote current user to admin if no admins exist
  app.post("/api/bootstrap/admin", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "User ID not found" });
      }
      
      // Check if there are any existing admins
      const existingAdmins = await db.select().from(users).where(eq(users.role, 'admin'));
      
      if (existingAdmins.length > 0) {
        return res.status(403).json({ error: "Admin users already exist. Bootstrap not needed." });
      }
      
      // Promote current user to admin
      const updatedUser = await storage.updateUserRole(userId, 'admin');
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ 
        message: "Successfully promoted to admin", 
        user: updatedUser 
      });
    } catch (error) {
      console.error("Error bootstrapping admin:", error);
      res.status(500).json({ error: "Failed to bootstrap admin" });
    }
  });

  // ====================== ADMIN SYSTEM MANAGEMENT API ======================

  // Admin dashboard data endpoints
  app.get("/api/admin/users", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error getting users:", error);
      res.status(500).json({ error: "Failed to get users" });
    }
  });

  app.get("/api/admin/leads", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const leads = await storage.getLeads();
      res.json(leads);
    } catch (error) {
      console.error("Error getting leads:", error);
      res.status(500).json({ error: "Failed to get leads" });
    }
  });

  app.get("/api/admin/stats", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const leads = await storage.getLeads();
      
      const stats = {
        totalUsers: users.length,
        totalLeads: leads.length,
        activeJobs: leads.filter((lead: any) => lead.status === 'in_progress').length,
        monthlyRevenue: 45000, // This would come from actual financial data
        completedJobs: leads.filter((lead: any) => lead.status === 'completed').length,
        pendingLeads: leads.filter((lead: any) => lead.status === 'new').length,
      };
      
      res.json(stats);
    } catch (error) {
      console.error("Error getting admin stats:", error);
      res.status(500).json({ error: "Failed to get admin stats" });
    }
  });

  // Admin Token Ledger - Shows all JCMOVES transactions across customers and employees
  app.get("/api/admin/token-ledger", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { limit = 100, type, role } = req.query;
      
      // Get ALL rewards for accurate totals (no limit)
      const allRewardsForTotals = await db
        .select({
          rewardType: rewards.rewardType,
          tokenAmount: rewards.tokenAmount,
          userRole: users.role,
        })
        .from(rewards)
        .leftJoin(users, eq(rewards.userId, users.id));

      // Calculate totals from ALL data
      let totalTokensDispensed = 0;
      const totalByType: Record<string, number> = {};
      const totalByRole: Record<string, number> = {};
      
      allRewardsForTotals.forEach(r => {
        const rewardType = r.rewardType || 'unknown';
        const userRole = r.userRole || 'unknown';
        const amount = parseFloat(r.tokenAmount || '0');
        
        totalTokensDispensed += amount;
        totalByType[rewardType] = (totalByType[rewardType] || 0) + amount;
        totalByRole[userRole] = (totalByRole[userRole] || 0) + amount;
      });

      // Get paginated transactions for display (with limit)
      const recentTransactions = await db
        .select({
          id: rewards.id,
          userId: rewards.userId,
          rewardType: rewards.rewardType,
          tokenAmount: rewards.tokenAmount,
          cashValue: rewards.cashValue,
          status: rewards.status,
          earnedDate: rewards.earnedDate,
          userEmail: users.email,
          userFirstName: users.firstName,
          userLastName: users.lastName,
          userRole: users.role,
        })
        .from(rewards)
        .leftJoin(users, eq(rewards.userId, users.id))
        .orderBy(desc(rewards.earnedDate))
        .limit(Number(limit));

      // Apply optional filters to display list only
      let filteredTransactions = recentTransactions;
      if (type && typeof type === 'string') {
        filteredTransactions = filteredTransactions.filter(r => r.rewardType === type);
      }
      if (role && typeof role === 'string') {
        filteredTransactions = filteredTransactions.filter(r => r.userRole === role);
      }

      // Get all wallet balances with user info
      const allWallets = await db
        .select({
          userId: walletAccounts.userId,
          tokenBalance: walletAccounts.tokenBalance,
          totalEarned: walletAccounts.totalEarned,
          totalRedeemed: walletAccounts.totalRedeemed,
          userEmail: users.email,
          userFirstName: users.firstName,
          userLastName: users.lastName,
          userRole: users.role,
        })
        .from(walletAccounts)
        .leftJoin(users, eq(walletAccounts.userId, users.id));

      const totalWalletBalance = allWallets.reduce((sum, w) => sum + parseFloat(w.tokenBalance || '0'), 0);
      const employeeBalance = allWallets.filter(w => w.userRole === 'employee').reduce((sum, w) => sum + parseFloat(w.tokenBalance || '0'), 0);
      const customerBalance = allWallets.filter(w => w.userRole === 'customer').reduce((sum, w) => sum + parseFloat(w.tokenBalance || '0'), 0);

      res.json({
        transactions: filteredTransactions,
        wallets: allWallets,
        summary: {
          totalTokensDispensed,
          totalByType,
          totalByRole,
          totalWalletBalance,
          employeeBalance,
          customerBalance,
          walletCount: allWallets.length,
          totalTransactionCount: allRewardsForTotals.length,
        }
      });
    } catch (error) {
      console.error("Error getting token ledger:", error);
      res.status(500).json({ error: "Failed to get token ledger" });
    }
  });

  // Test SendGrid email service (admin only)
  app.get("/api/admin/test-email", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const companyEmail = process.env.COMPANY_EMAIL || "upmichiganstatemovers@gmail.com";
      
      const emailSuccess = await sendEmail({
        to: companyEmail,
        from: companyEmail,
        subject: "✅ JC ON THE MOVE SendGrid Test",
        text: "This is a test email from your Replit backend. SendGrid is working!",
        html: "<h2>JC ON THE MOVE 🚛</h2><p>This is a test email from your Replit app. SendGrid is working!</p><p>Sent at: " + new Date().toLocaleString() + "</p>",
      });

      if (emailSuccess) {
        res.json({ 
          success: true, 
          message: "✅ Test email sent successfully! Check your inbox at " + companyEmail 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: "❌ Email service is not configured or failed to send. Check server logs for details." 
        });
      }
    } catch (error: any) {
      console.error("SendGrid test error:", error);
      res.status(500).json({ 
        success: false, 
        message: "❌ Error sending test email: " + error.message 
      });
    }
  });

  // Public health check for environment configuration
  app.get("/api/health-check", (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      configured: {
        database: !!process.env.DATABASE_URL,
        sessionSecret: !!process.env.SESSION_SECRET,
        sendgrid: !!process.env.SENDGRID_API_KEY,
      },
      authType: "email/password"
    });
  });

  // Get system configuration (admin only) - shows environment variable status without exposing values
  app.get("/api/admin/system/config", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const systemConfig = {
        environment: process.env.NODE_ENV || 'development',
        database: {
          status: process.env.DATABASE_URL ? 'configured' : 'missing',
          type: 'PostgreSQL'
        },
        email: {
          sendgrid: {
            status: process.env.SENDGRID_API_KEY ? 'configured' : 'missing',
            companyEmail: process.env.COMPANY_EMAIL ? 'configured' : 'missing'
          }
        },
        authentication: {
          sessionSecret: process.env.SESSION_SECRET ? 'configured' : 'missing',
          type: 'email/password'
        },
        crypto: {
          moonshot: {
            tokenAddress: process.env.MOONSHOT_TOKEN_ADDRESS ? 'configured' : 'missing'
          },
          requestTech: {
            apiKey: process.env.REQUEST_TECH_API_KEY ? 'configured' : 'missing'
          },
          encryption: {
            key: process.env.ENCRYPTION_KEY ? 'configured' : 'missing'
          }
        },
        server: {
          port: process.env.PORT || '5000'
        },
        lastChecked: new Date().toISOString()
      };

      res.json(systemConfig);
    } catch (error) {
      console.error("Error getting system config:", error);
      res.status(500).json({ error: "Failed to get system configuration" });
    }
  });

  // Get system health status (admin only)
  app.get("/api/admin/system/health", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const healthStatus = {
        database: {
          status: 'healthy',
          connected: true,
          lastCheck: new Date().toISOString()
        },
        services: {
          email: process.env.SENDGRID_API_KEY ? 'available' : 'disabled',
          authentication: 'active',
          rewards: 'active',
          treasury: 'active'
        },
        security: {
          encryption: process.env.ENCRYPTION_KEY ? 'enabled' : 'disabled',
          authentication: 'enabled',
          roleBasedAccess: 'enabled'
        },
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        version: process.version,
        platform: process.platform,
        lastUpdated: new Date().toISOString()
      };

      res.json(healthStatus);
    } catch (error) {
      console.error("Error getting system health:", error);
      res.status(500).json({ error: "Failed to get system health status" });
    }
  });

  // ====================== GAMIFICATION API ROUTES ======================

  // Daily check-in endpoint
  app.post("/api/gamification/checkin", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const result = await gamificationService.performDailyCheckIn(userId);
      
      if (result.success) {
        res.json({
          success: true,
          points: result.points,
          tokens: result.tokens,
          streak: result.streak,
          isNewRecord: result.isNewRecord,
          treasuryBalance: result.treasuryBalance,
          message: `Daily check-in successful! Earned ${result.points} points and ${result.tokens} JCMOVES tokens.`
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          streak: result.streak,
          treasuryBalance: result.treasuryBalance
        });
      }
    } catch (error) {
      console.error("Error during daily check-in:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process daily check-in"
      });
    }
  });

  // Get employee gamification data (stats, achievements, rank, etc.)
  app.get("/api/gamification/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const data = await gamificationService.getEmployeeGamificationData(userId);
      
      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error("Error getting gamification stats:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get gamification data"
      });
    }
  });

  // Get weekly leaderboard
  app.get("/api/gamification/leaderboard", isAuthenticated, async (req: any, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Max 50 results
      const leaderboard = await gamificationService.getWeeklyLeaderboard();
      
      res.json({
        success: true,
        leaderboard: leaderboard.slice(0, limit)
      });
    } catch (error) {
      console.error("Error getting leaderboard:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get leaderboard data"
      });
    }
  });

  // Award job completion points (internal endpoint for job workflow)
  app.post("/api/gamification/job-completion", isAuthenticated, async (req: any, res) => {
    try {
      const { jobId, onTime, customerRating } = req.body;
      const userId = (req.session as any).userId;
      
      if (!jobId) {
        return res.status(400).json({
          success: false,
          error: "Job ID is required"
        });
      }

      const result = await gamificationService.awardJobCompletionPoints(userId, jobId, {
        onTime: Boolean(onTime),
        customerRating: customerRating ? parseFloat(customerRating) : undefined
      });
      
      res.json({
        success: true,
        points: result.points,
        tokens: result.tokens,
        level: result.level,
        message: `Job completion reward: ${result.points} points and ${result.tokens} JCMOVES tokens!`
      });
    } catch (error) {
      console.error("Error awarding job completion points:", error);
      res.status(500).json({
        success: false,
        error: "Failed to award job completion points"
      });
    }
  });

  // Get user's weekly rank
  app.get("/api/gamification/rank", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const rank = await gamificationService.getWeeklyRank(userId);
      
      res.json({
        success: true,
        rank
      });
    } catch (error) {
      console.error("Error getting user rank:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get user rank"
      });
    }
  });

  // ====================== FAUCET API ROUTES ======================

  // Get user's faucet status for all supported currencies
  app.get("/api/faucet/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const faucetStatus = await faucetService.getFaucetStatus(userId);
      
      res.json({
        success: true,
        data: faucetStatus
      });
    } catch (error) {
      console.error("Error getting faucet status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get faucet status"
      });
    }
  });

  // Claim faucet reward for a specific currency
  app.post("/api/faucet/claim/:currency", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { currency } = req.params;
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.connection.remoteAddress;
      
      if (!currency) {
        return res.status(400).json({
          success: false,
          error: "Currency is required"
        });
      }

      const result = await faucetService.claimFaucetReward(userId, currency.toUpperCase(), userAgent, ipAddress);
      
      if (result.success) {
        res.json({
          success: true,
          currency: result.currency,
          amount: result.amount,
          cashValue: result.cashValue,
          nextClaimTime: result.nextClaimTime,
          message: `Successfully claimed ${result.amount} ${result.currency}! (≈$${result.cashValue?.toFixed(4)})`
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          nextClaimTime: result.nextClaimTime
        });
      }
    } catch (error) {
      console.error("Error claiming faucet reward:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process faucet claim"
      });
    }
  });

  // ====================== ADVERTISING API ROUTES ======================

  // Track ad impression
  app.post("/api/advertising/impression", async (req, res) => {
    try {
      const { placementId, network } = req.body;
      
      if (!placementId || !network) {
        return res.status(400).json({ error: "placementId and network are required" });
      }

      const advertisingService = getAdvertisingService();
      const impressionId = await advertisingService.trackImpression(
        placementId, 
        network,
        (req.session as any).userId,
        req.body.sessionId,
        req.body.userAgent,
        req.ip
      );
      
      res.json({ success: true, impressionId });
    } catch (error) {
      console.error("Error tracking ad impression:", error);
      res.status(500).json({ error: "Failed to track impression" });
    }
  });

  // Track ad click
  app.post("/api/advertising/click", async (req, res) => {
    try {
      const { impressionId, placementId, network, clickUrl } = req.body;
      
      if (!impressionId || !placementId || !network) {
        return res.status(400).json({ error: "impressionId, placementId and network are required" });
      }

      const advertisingService = getAdvertisingService();
      const clickId = await advertisingService.trackClick(
        impressionId,
        placementId, 
        network,
        (req.session as any).userId,
        clickUrl
      );
      
      res.json({ success: true, clickId });
    } catch (error) {
      console.error("Error tracking ad click:", error);
      res.status(500).json({ error: "Failed to track click" });
    }
  });

  // Get advertising configuration for frontend
  app.get("/api/advertising/config", async (req, res) => {
    try {
      const advertisingService = getAdvertisingService();
      
      res.json({
        enabled: advertisingService.isConfigured(),
        networks: advertisingService.getEnabledNetworks(),
        scripts: advertisingService.getAdScripts()
      });
    } catch (error) {
      console.error("Error getting advertising config:", error);
      res.status(500).json({ error: "Failed to get advertising configuration" });
    }
  });

  // Get ad placement for specific location
  app.get("/api/advertising/placement/:placementId", async (req, res) => {
    try {
      const { placementId } = req.params;
      const { type = 'banner' } = req.query;
      
      const advertisingService = getAdvertisingService();
      const placement = advertisingService.getAdPlacement(
        placementId, 
        type as 'banner' | 'video' | 'popup' | 'interstitial'
      );
      
      if (!placement) {
        return res.status(404).json({ error: "No ads available" });
      }
      
      res.json(placement);
    } catch (error) {
      console.error("Error getting ad placement:", error);
      res.status(500).json({ error: "Failed to get ad placement" });
    }
  });

  // Admin: Get advertising statistics (business owner only)
  app.get("/api/advertising/admin/stats", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const advertisingService = getAdvertisingService();
      const stats = await advertisingService.getAdvertisingStats();
      
      res.json({ stats });
    } catch (error) {
      console.error("Error getting advertising stats:", error);
      res.status(500).json({ error: "Failed to get advertising statistics" });
    }
  });

  // Admin: Get estimated revenue (business owner only)  
  app.get("/api/advertising/admin/revenue", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { dailyImpressions = 1000 } = req.query;
      
      const advertisingService = getAdvertisingService();
      const estimatedRevenue = await advertisingService.getEstimatedRevenue(Number(dailyImpressions));
      
      res.json({ estimatedRevenue });
    } catch (error) {
      console.error("Error getting estimated revenue:", error);
      res.status(500).json({ error: "Failed to get estimated revenue" });
    }
  });

  // Track ad completion for faucet claim validation
  app.post("/api/advertising/completion", isAuthenticated, async (req, res) => {
    try {
      const { impressionId, sessionId, network, completionType = 'view' } = req.body;
      const userId = (req.session as any).userId;
      
      if (!impressionId || !sessionId || !network) {
        return res.status(400).json({ error: "impressionId, sessionId, and network are required" });
      }

      const advertisingService = getAdvertisingService();
      const completionId = await advertisingService.trackAdCompletion(
        userId,
        impressionId,
        sessionId,
        network,
        completionType
      );
      
      res.json({ success: true, completionId });
    } catch (error) {
      console.error("Error tracking ad completion:", error);
      res.status(500).json({ error: "Failed to track ad completion" });
    }
  });

  // SECURITY ENDPOINT: Check server-verified ad completion (prevents console spoofing)
  app.get("/api/advertising/check-completion/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
      }

      const advertisingService = getAdvertisingService();
      
      // Check if this session has a verified completion from real webhook
      const verified = await advertisingService.checkWebhookVerifiedCompletion(sessionId);
      
      res.json({ verified });
    } catch (error) {
      console.error("Error checking ad completion:", error);
      res.status(500).json({ error: "Failed to check completion status" });
    }
  });

  // SECURITY WEBHOOK: Real Bitmedia/Cointraffic webhook endpoint (production use)
  // CRITICAL: Raw body preserved by global webhook middleware in server/index.ts
  app.post("/api/advertising/webhook/:network", async (req, res) => {
    try {
      const { network } = req.params;
      const rawBody = req.body; // Raw Buffer from global webhook middleware
      const webhookData = JSON.parse(rawBody.toString()); // Parse for processing
      
      // Extract signature from headers (varies by vendor)
      const signature = req.headers['x-signature'] || 
                       req.headers['x-bitmedia-signature'] || 
                       req.headers['x-cointraffic-signature'] || 
                       req.headers['authorization'];
      
      console.log(`🔐 SECURITY: Received ${network} webhook with signature validation`);
      
      const advertisingService = getAdvertisingService();
      await advertisingService.processWebhookCompletion(network, webhookData, signature as string, rawBody);
      
      res.json({ success: true });
    } catch (error) {
      console.error("❌ SECURITY: Webhook authentication failed:", error);
      res.status(401).json({ error: "Unauthorized webhook - authentication failed" });
    }
  });

  // ====================== FAUCET ADMIN API ROUTES ======================

  // Faucet validation schemas
  const faucetClaimSchema = z.object({
    currency: z.enum(['BTC', 'ETH', 'LTC', 'DOGE']),
    faucetpayAddress: z.string().min(10).max(100),
    deviceFingerprint: z.string().optional(),
  });

  // Get available faucet currencies and configurations
  app.get("/api/faucet/config", async (req, res) => {
    try {
      const configs = await storage.getFaucetConfig();
      const enabledConfigs = configs.filter(config => config.isEnabled);
      
      res.json({
        currencies: enabledConfigs,
        defaultInterval: FAUCET_CONFIG.DEFAULT_CLAIM_INTERVAL,
        isConfigured: true, // Always configured - handles all modes (DEMO, FAUCETPAY, SELF_FUNDED)
        mode: FAUCET_CONFIG.MODE,
        hasFaucetPayKey: !!process.env.FAUCETPAY_API_KEY
      });
    } catch (error) {
      console.error("Error getting faucet config:", error);
      res.status(500).json({ error: "Failed to get faucet configuration" });
    }
  });

  // Check if user can claim for a specific currency
  app.get("/api/faucet/claim-status/:currency", isAuthenticated, async (req: any, res) => {
    try {
      const { currency } = req.params;
      const userId = (req.session as any).userId;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const claimStatus = await storage.canUserClaim(userId, currency);
      const wallet = await storage.getFaucetWallet(userId, currency);
      
      res.json({
        ...claimStatus,
        totalEarned: wallet?.totalEarned || "0",
        totalClaims: wallet?.totalClaims || 0,
        lastClaimTime: wallet?.lastClaimTime
      });
    } catch (error) {
      console.error("Error checking claim status:", error);
      res.status(500).json({ error: "Failed to check claim status" });
    }
  });

  // Process faucet claim
  app.post("/api/faucet/claim", isAuthenticated, async (req: any, res) => {
    try {
      const { currency, faucetpayAddress, deviceFingerprint } = faucetClaimSchema.parse(req.body);
      const userId = (req.session as any).userId;
      const userEmail = req.user?.claims?.email;

      if (!userId || !req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Check if FaucetPay is configured
      const faucetPayService = getFaucetPayService();
      if (!faucetPayService) {
        return res.status(503).json({ error: "Faucet service is not configured" });
      }

      // ============= SERVER-SIDE AD COMPLETION VALIDATION =============
      // Check if user has completed required advertisement viewing
      const { sessionId } = req.body;
      if (sessionId) {
        const advertisingService = getAdvertisingService();
        const adCompleted = await advertisingService.verifyAdCompletion(userId, sessionId);
        
        if (!adCompleted) {
          return res.status(400).json({
            error: "Ad completion required",
            message: "You must watch and complete an advertisement before claiming rewards. Please watch the ad and try again."
          });
        }
        
        console.log(`✅ Ad completion verified for user ${userId} with session ${sessionId}`);
      } else {
        console.log(`⚠️ No session ID provided for faucet claim - skipping ad verification for user ${userId}`);
      }

      // Check if user can claim
      const claimStatus = await storage.canUserClaim(userId, currency);
      if (!claimStatus.canClaim) {
        return res.status(429).json({ 
          error: "Claim not available yet",
          nextClaimTime: claimStatus.nextClaimTime,
          secondsRemaining: claimStatus.secondsRemaining
        });
      }

      // Get faucet configuration
      const [config] = await storage.getFaucetConfig(currency);
      if (!config || !config.isEnabled) {
        return res.status(400).json({ error: `Faucet not available for ${currency}` });
      }

      // Check FaucetPay balance
      try {
        const balance = await faucetPayService.getBalance(currency);
        const balanceAmount = parseInt(balance.balance);
        const rewardAmountNumber = parseFloat(config.rewardAmount);
        if (balanceAmount < rewardAmountNumber) {
          return res.status(503).json({ error: "Faucet temporarily out of funds" });
        }
      } catch (error) {
        console.error("FaucetPay balance check failed:", error);
        return res.status(503).json({ error: "Faucet service temporarily unavailable" });
      }

      // Calculate reward and cash value
      const rewardAmount = parseFloat(config.rewardAmount);
      const cashValue = rewardAmount * 0.001; // Estimate based on crypto prices

      // Get user's IP address for anti-fraud
      const ipAddress = req.ip || req.connection.remoteAddress || '';

      let claim: any = null;
      try {
        // Create faucet claim record
        claim = await storage.createFaucetClaim({
          userId,
          currency,
          rewardAmount: config.rewardAmount,
          cashValue: cashValue.toFixed(2),
          ipAddress,
          userAgent: req.get('User-Agent'),
          deviceFingerprint
        });

        // Send payment via FaucetPay
        const paymentResult = await faucetPayService.sendPayment({
          amount: parseInt(config.rewardAmount),
          to: faucetpayAddress,
          currency,
          ipAddress
        });

        // Update claim with payment details
        await storage.updateFaucetClaim(claim.id, {
          status: 'paid',
          faucetpayPayoutId: paymentResult.payout_id.toString(),
          faucetpayUserHash: paymentResult.payout_user_hash
        });

        // Create or update user's faucet wallet
        const existingWallet = await storage.getFaucetWallet(userId, currency);
        if (existingWallet && userId && faucetpayAddress) {
          await storage.updateFaucetWallet(userId, currency, {
            totalEarned: (parseFloat(existingWallet.totalEarned || '0') + rewardAmount).toFixed(8),
            totalClaims: (existingWallet.totalClaims || 0) + 1,
            lastClaimTime: new Date(),
            faucetpayAddress
          });
        } else if (faucetpayAddress) {
          await storage.createFaucetWallet({
            userId,
            currency,
            faucetpayAddress,
            lastClaimTime: new Date()
          });
        }

        // Update daily revenue tracking
        const today = new Date().toISOString().split('T')[0];
        await storage.updateFaucetRevenue(today, currency, {
          totalClaims: 1,
          totalRewards: rewardAmount.toFixed(8),
          totalRevenue: "0.05", // Self-funded faucet revenue estimate
          uniqueUsers: 1,
          adViews: 1
        });

        res.json({
          success: true,
          reward: {
            amount: rewardAmount,
            currency,
            cashValue,
            payoutId: paymentResult.payout_id
          },
          nextClaimTime: new Date(Date.now() + config.claimInterval * 1000),
          remainingBalance: paymentResult.balance
        });

      } catch (paymentError: any) {
        console.error("FaucetPay payment failed:", paymentError);
        
        // Update claim status to failed - only if claim was created
        if (claim) {
          await storage.updateFaucetClaim(claim.id, {
            status: 'failed',
            failureReason: paymentError.message
          });
        }

        res.status(500).json({ 
          error: "Payment failed", 
          details: paymentError.message 
        });
      }

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: error.errors 
        });
      }
      console.error("Error processing faucet claim:", error);
      res.status(500).json({ error: "Failed to process claim" });
    }
  });

  // Get user's faucet claim history
  app.get("/api/faucet/claims", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const currency = req.query.currency as string;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!userId || !req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const claims = await storage.getFaucetClaims(userId, currency, limit);
      res.json({ claims });
    } catch (error) {
      console.error("Error getting faucet claims:", error);
      res.status(500).json({ error: "Failed to get claim history" });
    }
  });

  // Admin: Get faucet revenue statistics (business owner only)
  app.get("/api/faucet/admin/revenue", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const revenue = await storage.getFaucetRevenue();
      res.json({ revenue });
    } catch (error) {
      console.error("Error getting faucet revenue:", error);
      res.status(500).json({ error: "Failed to get revenue statistics" });
    }
  });

  // Admin: Update faucet configuration (business owner only)
  app.put("/api/faucet/admin/config/:currency", isAuthenticated, requireBusinessOwner, async (req, res) => {
    try {
      const { currency } = req.params;
      const updates = req.body;

      const updatedConfig = await storage.updateFaucetConfig(currency, updates);
      if (!updatedConfig) {
        return res.status(404).json({ error: "Currency configuration not found" });
      }

      res.json({ config: updatedConfig });
    } catch (error) {
      console.error("Error updating faucet config:", error);
      res.status(500).json({ error: "Failed to update configuration" });
    }
  });

  // ===== WALLET MANAGEMENT ROUTES =====
  
  // Get user's crypto wallets
  app.get("/api/wallets", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const wallets = await walletService.getUserWallets(userId);
      res.json({ wallets });
    } catch (error) {
      console.error("Error fetching user wallets:", error);
      res.status(500).json({ error: "Failed to fetch wallets" });
    }
  });

  // Create wallets for user (all supported currencies)
  app.post("/api/wallets/create", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const wallets = await walletService.createAllWalletsForUser(userId);
      res.json({ 
        success: true, 
        wallets,
        message: `Created ${wallets.length} crypto wallets`
      });
    } catch (error) {
      console.error("Error creating wallets:", error);
      res.status(500).json({ error: "Failed to create wallets" });
    }
  });

  // Get wallet balance for specific currency
  app.get("/api/wallets/:currency/balance", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { currency } = req.params;
      
      const balanceInfo = await walletService.getWalletBalance(userId, currency);
      if (!balanceInfo) {
        return res.status(404).json({ error: "Wallet not found for this currency" });
      }
      
      res.json({ 
        currency: balanceInfo.currency.symbol,
        balance: balanceInfo.balance,
        currencyDetails: balanceInfo.currency
      });
    } catch (error) {
      console.error("Error fetching wallet balance:", error);
      res.status(500).json({ error: "Failed to fetch wallet balance" });
    }
  });

  // Get wallet transfer summary (Admin only)
  app.get("/api/wallets/transfer-summary", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      
      // Get all user wallets
      const wallets = await storage.getUserWalletsWithCurrency(userId);
      
      // Calculate transfer summary for JCMOVES only
      let totalWithdrawn = 0;
      let totalTransactionCount = 0;
      
      for (const wallet of wallets) {
        // Only count JCMOVES transfers
        if (wallet.currency.symbol === 'JCMOVES') {
          const transactions = await storage.getWalletTransactions(wallet.id, 1000);
          const withdrawals = transactions.filter(tx => 
            tx.transactionType === 'withdrawal' || tx.transactionType === 'transfer'
          );
          
          totalTransactionCount += withdrawals.length;
          
          for (const tx of withdrawals) {
            totalWithdrawn += parseFloat(tx.amount);
          }
        }
      }
      
      res.json({
        totalWithdrawn: totalWithdrawn.toFixed(8),
        transactionCount: totalTransactionCount,
        walletCount: wallets.length
      });
    } catch (error) {
      console.error("Error fetching transfer summary:", error);
      res.status(500).json({ error: "Failed to fetch transfer summary" });
    }
  });

  // Treasury Wallet Endpoints (Admin only)
  app.get("/api/treasury/wallets", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const treasuryWallets = await storage.getTreasuryWallets('admin');
      res.json({ wallets: treasuryWallets });
    } catch (error) {
      console.error("Error fetching treasury wallets:", error);
      res.status(500).json({ error: "Failed to fetch treasury wallets" });
    }
  });

  // Update treasury wallet address (Admin only)
  app.put("/api/treasury/wallets/:walletId", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { walletId } = req.params;
      const { walletAddress } = req.body;

      if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({ error: "Wallet address is required" });
      }

      // Validate Solana address format
      const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      if (!solanaAddressRegex.test(walletAddress)) {
        return res.status(400).json({ error: "Invalid Solana wallet address format" });
      }

      const updatedWallet = await storage.updateTreasuryWalletAddress(walletId, walletAddress);
      if (!updatedWallet) {
        return res.status(404).json({ error: "Treasury wallet not found" });
      }

      console.log(`✅ Treasury wallet ${walletId} updated to address: ${walletAddress}`);
      res.json({ success: true, wallet: updatedWallet });
    } catch (error) {
      console.error("Error updating treasury wallet:", error);
      res.status(500).json({ error: "Failed to update treasury wallet" });
    }
  });

  // Create or update treasury wallet for a currency (Admin only)
  app.post("/api/treasury/wallets", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { currencyId, walletAddress, purpose } = req.body;

      if (!currencyId || !walletAddress) {
        return res.status(400).json({ error: "Currency ID and wallet address are required" });
      }

      // Validate Solana address format
      const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      if (!solanaAddressRegex.test(walletAddress)) {
        return res.status(400).json({ error: "Invalid Solana wallet address format" });
      }

      const wallet = await storage.upsertTreasuryWallet(currencyId, walletAddress, purpose || 'treasury');
      console.log(`✅ Treasury wallet upserted: ${wallet.id} with address ${walletAddress}`);
      res.json({ success: true, wallet });
    } catch (error) {
      console.error("Error upserting treasury wallet:", error);
      res.status(500).json({ error: "Failed to create/update treasury wallet" });
    }
  });

  // Get wallet transactions
  app.get("/api/wallets/:walletId/transactions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { walletId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      
      console.log(`🔍 Fetching transactions for walletId: ${walletId}, user: ${userId}`);
      
      // Verify wallet belongs to user
      const wallet = await storage.getUserWalletById(walletId);
      console.log(`📂 Wallet found:`, wallet ? `Yes (userId: ${wallet.userId})` : 'No');
      
      if (!wallet || wallet.userId !== userId) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      const transactions = await storage.getWalletTransactions(walletId, limit);
      console.log(`📜 Transactions found: ${transactions.length}`);
      
      res.json({ transactions });
    } catch (error) {
      console.error("Error fetching wallet transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // Record a deposit (for external deposits)
  app.post("/api/wallets/deposit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { currency, amount, transactionHash, source } = req.body;

      if (!currency || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Invalid currency or amount" });
      }

      // Get user's wallet for this currency
      const currencyData = await storage.getSupportedCurrencyBySymbol(currency);
      if (!currencyData) {
        return res.status(400).json({ error: "Currency not supported" });
      }

      const wallet = await storage.getUserWallet(userId, currencyData.id);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found. Create wallets first." });
      }

      // Record the deposit transaction
      const transaction = await walletService.recordTransaction(
        wallet.id,
        'deposit',
        amount,
        {
          source: source || 'external',
          transactionHash,
          depositor: 'user',
          timestamp: new Date().toISOString()
        }
      );

      res.json({ 
        success: true, 
        transaction,
        newBalance: transaction.balanceAfter,
        message: `Successfully deposited ${amount} ${currency}`
      });
    } catch (error) {
      console.error("Error recording deposit:", error);
      res.status(500).json({ error: "Failed to record deposit" });
    }
  });

  // Wallet export request endpoint  
  app.post("/api/wallets/export-request", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { amount, withdrawalAddress, notes, currency } = req.body;
      
      if (!amount || !currency || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Invalid export request data" });
      }

      if (!withdrawalAddress || withdrawalAddress.trim() === '') {
        return res.status(400).json({ error: "Wallet address is required" });
      }

      if (currency !== 'JCMOVES') {
        return res.status(400).json({ error: "Export only supported for JCMOVES tokens" });
      }

      // Get user's JCMOVES wallet
      const userWallets = await walletService.getUserWallets(userId);
      const jcmovesWallet = userWallets.find(w => w.currency.symbol === 'JCMOVES');
      
      if (!jcmovesWallet) {
        return res.status(404).json({ error: "JCMOVES wallet not found" });
      }

      const currentBalance = parseFloat(jcmovesWallet.balance);
      const exportAmount = parseFloat(amount);

      if (exportAmount > currentBalance) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      // Auto-approve the withdrawal after user confirmation
      // Create a confirmed transaction record with blockchain placeholder
      const transactionResult = await storage.createWalletTransaction({
        userWalletId: jcmovesWallet.id,
        transactionType: 'withdrawal',
        amount: exportAmount.toString(),
        balanceAfter: (currentBalance - exportAmount).toString(),
        transactionHash: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Placeholder until blockchain integration
        status: 'confirmed',
        confirmations: 1,
        metadata: {
          withdrawalAddress: withdrawalAddress || null,
          notes: notes || null,
          exportRequest: true,
          autoApproved: true,
          requestedAt: new Date().toISOString(),
          approvedAt: new Date().toISOString()
        }
      });

      // Update wallet balance
      await storage.updateUserWalletBalance(jcmovesWallet.id, (currentBalance - exportAmount).toString());

      res.json({ 
        success: true, 
        message: "Withdrawal approved and processed successfully",
        transactionId: transactionResult.id,
        transactionHash: transactionResult.transactionHash,
        amount: exportAmount,
        newBalance: (currentBalance - exportAmount).toString(),
        approved: true
      });

    } catch (error) {
      console.error("Error processing export request:", error);
      res.status(500).json({ error: "Failed to process export request" });
    }
  });

  // Sync tokens from rewards system to crypto wallets
  app.post("/api/wallets/sync-from-rewards", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get user's current reward balance from walletAccounts
      const rewardWallet = await storage.getWalletAccount(userId);
      if (!rewardWallet) {
        return res.status(404).json({ error: "No rewards wallet found" });
      }

      const rewardBalance = parseFloat(rewardWallet.tokenBalance || '0');
      if (rewardBalance <= 0) {
        return res.status(400).json({ error: "No tokens to sync" });
      }

      // Get or create user's JCMOVES crypto wallet
      const userWallets = await walletService.getUserWallets(userId);
      let jcmovesWallet = userWallets.find(w => w.currency.symbol === 'JCMOVES');
      
      if (!jcmovesWallet) {
        // Create JCMOVES wallet if it doesn't exist
        const walletService = new (await import('./services/wallet.js')).WalletService();
        await walletService.createUserWallet(userId, 'JCMOVES');
        // Refetch with currency info
        const updatedWallets = await walletService.getUserWallets(userId);
        jcmovesWallet = updatedWallets.find(w => w.currency.symbol === 'JCMOVES');
        
        if (!jcmovesWallet) {
          throw new Error('Failed to create JCMOVES wallet');
        }
      }

      // Calculate new balances
      const currentCryptoBalance = parseFloat(jcmovesWallet.balance);
      const newCryptoBalance = currentCryptoBalance + rewardBalance;

      // Transfer the tokens
      // 1. Add to crypto wallet
      await storage.updateUserWalletBalance(jcmovesWallet.id, newCryptoBalance.toString());
      
      // 2. Record the sync transaction
      await storage.createWalletTransaction({
        userWalletId: jcmovesWallet.id,
        transactionType: 'deposit',
        amount: rewardBalance.toString(),
        balanceAfter: newCryptoBalance.toString(),
        transactionHash: null,
        status: 'confirmed',
        confirmations: 1,
        metadata: {
          syncFromRewards: true,
          originalRewardBalance: rewardBalance.toString(),
          syncedAt: new Date().toISOString(),
          source: 'rewards_system'
        }
      });

      // 3. Clear the rewards balance (set to 0)
      await storage.updateWalletAccount(userId, {
        tokenBalance: "0.00000000"
      });

      res.json({ 
        success: true, 
        message: "Tokens successfully synced to crypto wallet",
        syncedAmount: rewardBalance,
        newCryptoBalance: newCryptoBalance,
        walletId: jcmovesWallet.id
      });

    } catch (error) {
      console.error("Error syncing tokens from rewards:", error);
      res.status(500).json({ error: "Failed to sync tokens" });
    }
  });

  // Internal transfer between users
  app.post("/api/wallets/transfer", isAuthenticated, async (req: any, res) => {
    try {
      const fromUserId = req.currentUser.id;
      const { toUserId, currency, amount, note } = req.body;

      if (!toUserId || !currency || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Missing required fields or invalid amount" });
      }

      if (fromUserId === toUserId) {
        return res.status(400).json({ error: "Cannot transfer to yourself" });
      }

      // Verify recipient exists
      const recipient = await storage.getUser(toUserId);
      if (!recipient) {
        return res.status(404).json({ error: "Recipient not found" });
      }

      const transferResult = await walletService.internalTransfer(
        fromUserId,
        toUserId,
        currency,
        amount,
        note
      );

      res.json({ 
        success: true, 
        transfer: transferResult,
        message: `Successfully transferred ${amount} ${currency} to ${recipient.firstName} ${recipient.lastName}`
      });
    } catch (error) {
      console.error("Error processing transfer:", error);
      res.status(500).json({ error: error.message || "Failed to process transfer" });
    }
  });

  // Transfer tokens from user's JCMOVES wallet to treasury (admin, employee, and business_owner only - not customers)
  app.post("/api/wallets/fund-treasury", isAuthenticated, requireTreasuryAccess, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { amount, note } = req.body;

      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      // Get user's JCMOVES wallet
      const userWallets = await walletService.getUserWallets(userId);
      const jcmovesWallet = userWallets.find(w => w.currency.symbol === 'JCMOVES');
      
      if (!jcmovesWallet) {
        return res.status(404).json({ error: "JCMOVES wallet not found" });
      }

      const currentBalance = parseFloat(jcmovesWallet.balance);
      const transferAmount = parseFloat(amount);

      if (transferAmount > currentBalance) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      // 1. Deduct from user's wallet
      const newBalance = currentBalance - transferAmount;
      await storage.updateUserWalletBalance(jcmovesWallet.id, newBalance.toString());

      // 2. Record withdrawal transaction
      await storage.createWalletTransaction({
        userWalletId: jcmovesWallet.id,
        transactionType: 'withdrawal',
        amount: transferAmount.toString(),
        balanceAfter: newBalance.toString(),
        transactionHash: `treasury_funding_${Date.now()}`,
        status: 'confirmed',
        confirmations: 1,
        metadata: {
          treasuryFunding: true,
          note: note || 'Treasury funding',
          fundedAt: new Date().toISOString()
        }
      });

      // 3. Add to treasury funding - get current token price for USD value
      const treasuryService = new (await import('./services/treasury.js')).TreasuryService();
      const priceData = await treasuryService.getCurrentTokenPrice();
      const usdValue = transferAmount * priceData.price;
      
      // Add tokens and USD value to treasury reserve
      await storage.addToReserve(
        transferAmount,
        usdValue,
        `Treasury funding from user wallet: ${note || 'Wallet to Treasury transfer'}`
      );

      res.json({ 
        success: true, 
        message: `Successfully transferred ${transferAmount} JCMOVES ($${usdValue.toFixed(2)}) to treasury`,
        transferredAmount: transferAmount,
        usdValue: usdValue.toFixed(2),
        newWalletBalance: newBalance,
        treasuryFunded: true
      });

    } catch (error) {
      console.error("Error funding treasury from wallet:", error);
      res.status(500).json({ error: "Failed to fund treasury" });
    }
  });

  // Get supported currencies
  app.get("/api/wallets/currencies", isAuthenticated, async (req, res) => {
    try {
      const currencies = await storage.getSupportedCurrencies();
      res.json({ currencies });
    } catch (error) {
      console.error("Error fetching supported currencies:", error);
      res.status(500).json({ error: "Failed to fetch supported currencies" });
    }
  });

  // ============ MINING ENDPOINTS ============
  
  // Start or resume mining session
  app.post("/api/mining/start", isAuthenticated, async (req: any, res) => {
    try {
      console.log("[MINING] Start mining request received");
      
      const userId = (req.session as any).userId;
      if (!userId) {
        console.error("[MINING] No user ID found in session");
        return res.status(401).json({ error: "Authentication required" });
      }
      
      console.log("[MINING] Starting mining for user:", userId);
      
      const { miningService } = await import('./services/mining');
      const result = await miningService.startMining(userId);
      
      console.log("[MINING] Mining started successfully:", result);
      res.json(result);
    } catch (error) {
      console.error("[MINING] Error starting mining:", error);
      console.error("[MINING] Error stack:", error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to start mining" });
    }
  });

  // Get mining status and stats
  app.get("/api/mining/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { miningService } = await import('./services/mining');
      
      const stats = await miningService.getMiningStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error getting mining status:", error);
      res.status(500).json({ error: "Failed to get mining status" });
    }
  });

  // Manually claim accumulated tokens
  app.post("/api/mining/claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { miningService } = await import('./services/mining');
      
      const result = await miningService.claimTokens(userId, 'manual');
      
      if (!result.success) {
        return res.status(400).json({ error: result.error || "Failed to claim tokens" });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error claiming mining tokens:", error);
      res.status(500).json({ error: "Failed to claim tokens" });
    }
  });

  // Auto-claim endpoint (called by cron/scheduler)
  app.post("/api/mining/auto-claim", async (req, res) => {
    try {
      const { miningService } = await import('./services/mining');
      await miningService.autoClaimExpiredSessions();
      res.json({ success: true, message: "Auto-claim completed" });
    } catch (error) {
      console.error("Error in auto-claim:", error);
      res.status(500).json({ error: "Failed to auto-claim" });
    }
  });

  // Request payout - transfer tokens from in-app balance to personal wallet
  app.post("/api/wallet/payout", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      
      // Get user's wallet account balance
      const walletAccount = await storage.getWalletAccount(userId);
      if (!walletAccount) {
        return res.status(400).json({ error: "No wallet account found" });
      }
      
      const availableBalance = parseFloat(walletAccount.tokenBalance || "0");
      if (availableBalance <= 0) {
        return res.status(400).json({ error: "No tokens available for payout" });
      }
      
      // Import fee constants and calculate percentage-based fee
      const { TREASURY_CONFIG } = await import('./constants');
      const feePercent = TREASURY_CONFIG.PAYOUT_FEE_PERCENT;
      const minFee = TREASURY_CONFIG.PAYOUT_MIN_FEE_TOKENS;
      
      // Calculate 1% fee with minimum guard
      const calculatedFee = Math.ceil(availableBalance * (feePercent / 100));
      const feeAmount = Math.max(calculatedFee, minFee);
      
      // Ensure user has enough to cover the fee
      if (availableBalance <= feeAmount) {
        return res.status(400).json({ 
          error: `Minimum payout is ${feeAmount + 1} JCMOVES tokens (includes ${feePercent}% network fee)` 
        });
      }
      
      const netAmount = availableBalance - feeAmount;
      
      // Check for pending payouts (soft check - DB constraint is the real guard)
      const hasPending = await storage.hasPendingPayout(userId);
      if (hasPending) {
        return res.status(400).json({ error: "You already have a pending payout request" });
      }
      
      // Get user's payout address
      const payoutInfo = await storage.getPayoutAddress(userId);
      if (!payoutInfo.address) {
        return res.status(400).json({ error: "Please set up your wallet first in Profile settings" });
      }
      
      // Create payout request and deduct balance ATOMICALLY - unique constraint prevents concurrent duplicates
      let payout;
      const totalRedeemed = parseFloat(walletAccount.totalRedeemed || "0") + availableBalance;
      
      try {
        // Create payout with fee breakdown and net amount
        payout = await storage.createWalletPayout({
          userId,
          tokenAmount: availableBalance.toFixed(8),
          feeAmount: feeAmount.toFixed(8),
          netAmount: netAmount.toFixed(8),
          recipientAddress: payoutInfo.address,
          status: 'pending',
          metadata: { walletMode: payoutInfo.mode, originalBalance: availableBalance, feePercent: feePercent, feeAmount: feeAmount }
        });
        
        // Deduct balance immediately after creating payout record (prevents double-spend)
        await storage.updateWalletAccount(userId, {
          tokenBalance: "0.00000000",
          totalRedeemed: totalRedeemed.toFixed(8)
        });
      } catch (createError: any) {
        // Handle unique constraint violation (concurrent request race)
        if (createError.code === '23505') {
          return res.status(400).json({ error: "You already have a pending payout request" });
        }
        throw createError;
      }
      
      // Try to execute the blockchain transfer
      try {
        const { solanaTransferService } = await import('./services/solana-transfer');
        
        if (!solanaTransferService.isOperational()) {
          // Transfer service not operational - payout will be processed later
          // Balance already deducted, payout remains pending
          return res.json({
            success: true,
            payout,
            message: "Payout request created. It will be processed when treasury wallet is configured.",
            pending: true
          });
        }
        
        // Check treasury balance BEFORE attempting transfer (need netAmount for actual transfer)
        const treasuryBalance = await solanaTransferService.getTreasuryBalance();
        if (treasuryBalance.tokenBalance < netAmount) {
          // Treasury is empty or has insufficient balance - queue as pending
          console.log(`[PAYOUT] Treasury balance (${treasuryBalance.tokenBalance}) insufficient for payout (${netAmount}). Queuing as pending.`);
          return res.json({
            success: true,
            payout,
            message: "Payout request queued. Your tokens have been reserved and will be sent when treasury is funded.",
            pending: true,
            queuedReason: "insufficient_treasury_balance"
          });
        }
        
        // Execute real blockchain transfer with NET amount (after fee deduction)
        const transferResult = await solanaTransferService.transferTokens({
          recipientAddress: payoutInfo.address,
          amount: netAmount,
          memo: `JCMOVES payout to ${userId.slice(0, 8)}`
        });
        
        if (transferResult.success && transferResult.transactionHash) {
          // Update payout with transaction hash - mark as confirmed
          await storage.updateWalletPayout(payout.id, {
            status: 'confirmed',
            transactionHash: transferResult.transactionHash,
            processedAt: new Date(),
            confirmedAt: new Date()
          });
          
          // Transfer the fee to burn wallet for buyback program
          // This is a SECOND blockchain transfer from treasury to burn wallet
          console.log(`[PAYOUT] Initiating fee transfer: ${feeAmount} JCMOVES to burn wallet...`);
          
          try {
            const feeResult = await solanaTransferService.transferFeeToBuybackWallet(feeAmount, transferResult.transactionHash);
            if (feeResult.success) {
              console.log(`[PAYOUT] ✅ Fee of ${feeAmount} JCMOVES burned successfully: ${feeResult.transactionHash}`);
              await storage.recordBuybackFeeContribution(feeAmount, payout.id);
            } else {
              console.warn(`[PAYOUT] ⚠️ Fee transfer to burn wallet failed: ${feeResult.error}`);
            }
          } catch (feeError) {
            console.error('[PAYOUT] Fee transfer error:', feeError);
          }
          
          return res.json({
            success: true,
            transactionHash: transferResult.transactionHash,
            amount: netAmount,
            fee: feeAmount,
            grossAmount: availableBalance,
            recipientAddress: payoutInfo.address,
            message: `Successfully sent ${netAmount.toLocaleString()} JCMOVES to your wallet! (${feeAmount} fee contributed to buyback program)`
          });
        } else {
          // Transfer failed - refund balance and mark payout as failed
          await storage.updateWalletPayout(payout.id, {
            status: 'failed',
            failureReason: transferResult.error || 'Unknown transfer error',
            processedAt: new Date()
          });
          
          // Refund the balance
          await storage.updateWalletAccount(userId, {
            tokenBalance: availableBalance.toFixed(8),
            totalRedeemed: (totalRedeemed - availableBalance).toFixed(8)
          });
          
          return res.status(500).json({
            error: transferResult.error || "Blockchain transfer failed. Your balance has been restored.",
            payoutId: payout.id
          });
        }
      } catch (transferError) {
        console.error("Blockchain transfer error:", transferError);
        
        // Refund balance on error
        await storage.updateWalletAccount(userId, {
          tokenBalance: availableBalance.toFixed(8),
          totalRedeemed: (totalRedeemed - availableBalance).toFixed(8)
        });
        
        await storage.updateWalletPayout(payout.id, {
          status: 'failed',
          failureReason: transferError instanceof Error ? transferError.message : 'Transfer execution failed',
          processedAt: new Date()
        });
        return res.status(500).json({
          error: "Failed to execute blockchain transfer. Your balance has been restored.",
          payoutId: payout.id
        });
      }
    } catch (error) {
      console.error("Error requesting payout:", error);
      res.status(500).json({ error: "Failed to request payout" });
    }
  });
  
  // Get payout configuration (fee info)
  app.get("/api/wallet/payout-config", async (req, res) => {
    try {
      const { TREASURY_CONFIG } = await import('./constants');
      const feePercent = TREASURY_CONFIG.PAYOUT_FEE_PERCENT;
      const minFee = TREASURY_CONFIG.PAYOUT_MIN_FEE_TOKENS;
      res.json({
        feePercent,
        minFee,
        minimumPayout: minFee + 1,
        feeCurrency: "JCMOVES",
        feeDescription: `${feePercent}% fee contributed to the token buyback program (minimum ${minFee} JCMOVES)`
      });
    } catch (error) {
      console.error("Error getting payout config:", error);
      res.status(500).json({ error: "Failed to get payout configuration" });
    }
  });

  // Get user's payout history
  app.get("/api/wallet/payouts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const payouts = await storage.getWalletPayoutsByUser(userId);
      res.json(payouts);
    } catch (error) {
      console.error("Error getting payout history:", error);
      res.status(500).json({ error: "Failed to get payout history" });
    }
  });
  
  // Get payout status for pending payout
  app.get("/api/wallet/payout/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const hasPending = await storage.hasPendingPayout(userId);
      const payouts = await storage.getWalletPayoutsByUser(userId);
      const pendingPayout = payouts.find(p => p.status === 'pending') || null;
      const latestPayout = payouts[0] || null;
      
      res.json({
        hasPendingPayout: hasPending,
        pendingPayout,
        latestPayout
      });
    } catch (error) {
      console.error("Error getting payout status:", error);
      res.status(500).json({ error: "Failed to get payout status" });
    }
  });

  // Cancel a pending payout request - uses transaction to prevent race conditions
  app.post("/api/wallet/payout/:payoutId/cancel", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const { payoutId } = req.params;

      // Use transaction with row locking to prevent race conditions
      const result = await db.transaction(async (tx) => {
        // Lock the payout row for update to prevent concurrent modifications
        const [payout] = await tx
          .select()
          .from(walletPayouts)
          .where(and(
            eq(walletPayouts.id, payoutId),
            eq(walletPayouts.userId, userId)
          ))
          .for('update')
          .limit(1);

        if (!payout) {
          return { error: "Payout request not found", status: 404 };
        }

        if (payout.status !== 'pending') {
          return { error: "Only pending payouts can be cancelled", status: 400 };
        }

        const payoutAmount = parseFloat(payout.tokenAmount);

        // Lock wallet account row and get current balance
        const [walletAccount] = await tx
          .select()
          .from(walletAccounts)
          .where(eq(walletAccounts.userId, userId))
          .for('update')
          .limit(1);

        // Enforce wallet account existence - critical for data integrity
        if (!walletAccount) {
          return { error: "Wallet account not found. Cannot process refund.", status: 400 };
        }

        const currentBalance = parseFloat(walletAccount.tokenBalance || "0");
        const currentRedeemed = parseFloat(walletAccount.totalRedeemed || "0");

        // Validate totalRedeemed has enough to deduct (prevents negative adjustments)
        if (currentRedeemed < payoutAmount) {
          console.warn(`[PAYOUT] Refund amount ${payoutAmount} exceeds totalRedeemed ${currentRedeemed} for user ${userId}`);
        }

        // Calculate new values with underflow protection
        const newBalance = currentBalance + payoutAmount;
        const newRedeemed = Math.max(0, currentRedeemed - payoutAmount);

        // Atomic update: refund tokens and update payout status
        await tx
          .update(walletAccounts)
          .set({
            tokenBalance: newBalance.toFixed(8),
            totalRedeemed: newRedeemed.toFixed(8),
            lastActivity: new Date()
          })
          .where(eq(walletAccounts.userId, userId));

        await tx
          .update(walletPayouts)
          .set({
            status: 'cancelled',
            processedAt: new Date()
          })
          .where(eq(walletPayouts.id, payoutId));

        console.log(`[PAYOUT] User ${userId} cancelled payout ${payoutId}, refunded ${payoutAmount} tokens`);

        return {
          success: true,
          message: "Payout request cancelled and tokens refunded to your balance",
          refundedAmount: payoutAmount
        };
      });

      // Handle transaction result
      if ('error' in result) {
        return res.status(result.status || 500).json({ error: result.error });
      }

      res.json(result);
    } catch (error) {
      console.error("Error cancelling payout:", error);
      res.status(500).json({ error: "Failed to cancel payout request" });
    }
  });

  // ===========================================
  // ADMIN PAYOUT MANAGEMENT ROUTES
  // ===========================================

  // Get all pending payouts (admin only)
  app.get("/api/admin/payouts/pending", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const pendingPayouts = await storage.getPendingPayouts();
      
      // Enrich with user info
      const enrichedPayouts = await Promise.all(
        pendingPayouts.map(async (payout) => {
          const user = await storage.getUser(payout.userId);
          return {
            ...payout,
            userName: user?.name || user?.email || 'Unknown User',
            userEmail: user?.email || 'Unknown'
          };
        })
      );
      
      res.json({ payouts: enrichedPayouts });
    } catch (error) {
      console.error("Error getting pending payouts:", error);
      res.status(500).json({ error: "Failed to get pending payouts" });
    }
  });

  // Get all payouts with optional status filter (admin only)
  app.get("/api/admin/payouts", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { status } = req.query;
      
      let payouts;
      if (status === 'pending') {
        payouts = await storage.getPendingPayouts();
      } else {
        payouts = await db.select().from(walletPayouts).orderBy(desc(walletPayouts.requestedAt)).limit(100);
      }
      
      // Enrich with user info
      const enrichedPayouts = await Promise.all(
        payouts.map(async (payout) => {
          const user = await storage.getUser(payout.userId);
          return {
            ...payout,
            userName: user?.name || user?.email || 'Unknown User',
            userEmail: user?.email || 'Unknown'
          };
        })
      );
      
      res.json({ payouts: enrichedPayouts });
    } catch (error) {
      console.error("Error getting payouts:", error);
      res.status(500).json({ error: "Failed to get payouts" });
    }
  });

  // Process/approve a payout request (admin only)
  app.post("/api/admin/payouts/:payoutId/process", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { payoutId } = req.params;
      const { txHash, executeOnChain } = req.body;
      const adminUserId = (req.session as any).userId;

      // Get the payout
      const payouts = await db.select().from(walletPayouts).where(eq(walletPayouts.id, payoutId)).limit(1);
      const payout = payouts[0];

      if (!payout) {
        return res.status(404).json({ error: "Payout request not found" });
      }

      if (payout.status !== 'pending') {
        return res.status(400).json({ error: "Only pending payouts can be processed" });
      }

      // If executeOnChain is true, attempt real blockchain transfer
      if (executeOnChain) {
        // Validate recipient address before attempting transfer
        const recipientAddr = payout.recipientAddress?.trim();
        const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        
        if (!recipientAddr || !solanaAddressRegex.test(recipientAddr)) {
          console.error(`[PAYOUT] Invalid recipient address for payout ${payoutId}: "${recipientAddr}"`);
          return res.status(400).json({ 
            error: "Invalid recipient wallet address", 
            details: `The wallet address "${recipientAddr || 'empty'}" is not a valid Solana address. The user may need to update their wallet settings.`
          });
        }

        try {
          const result = await solanaTransferService.transferTokens({
            recipientAddress: recipientAddr,
            amount: parseFloat(payout.tokenAmount),
            memo: `Payout for user ${payout.userId}`
          });

          if (!result.success) {
            return res.status(500).json({ 
              error: "Blockchain transfer failed", 
              details: result.error 
            });
          }

          // Update payout with blockchain tx hash
          await storage.updateWalletPayout(payoutId, {
            status: 'completed',
            transactionHash: result.signature,
            processedAt: new Date()
          });

          console.log(`[PAYOUT] Admin ${adminUserId} processed payout ${payoutId} on-chain: ${result.signature}`);

          return res.json({
            success: true,
            message: "Payout processed and tokens sent on blockchain",
            txHash: result.signature,
            amount: payout.tokenAmount,
            destination: payout.recipientAddress
          });

        } catch (transferError: any) {
          console.error("Blockchain transfer error:", transferError);
          return res.status(500).json({ 
            error: "Blockchain transfer failed", 
            details: transferError.message 
          });
        }
      }

      // Record-only mode (manual off-chain processing)
      if (!txHash) {
        return res.status(400).json({ error: "Transaction hash required for manual processing" });
      }

      await storage.updateWalletPayout(payoutId, {
        status: 'completed',
        transactionHash: txHash,
        processedAt: new Date()
      });

      console.log(`[PAYOUT] Admin ${adminUserId} manually processed payout ${payoutId}: ${txHash}`);

      res.json({
        success: true,
        message: "Payout marked as completed",
        txHash,
        amount: payout.tokenAmount,
        destination: payout.recipientAddress
      });

    } catch (error) {
      console.error("Error processing payout:", error);
      res.status(500).json({ error: "Failed to process payout" });
    }
  });

  // Decline/reject a payout request (admin only)
  app.post("/api/admin/payouts/:payoutId/decline", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { payoutId } = req.params;
      const { reason } = req.body;
      const adminUserId = (req.session as any).userId;

      // Use transaction to safely refund tokens
      const result = await db.transaction(async (tx) => {
        const [payout] = await tx
          .select()
          .from(walletPayouts)
          .where(eq(walletPayouts.id, payoutId))
          .for('update')
          .limit(1);

        if (!payout) {
          return { error: "Payout request not found", status: 404 };
        }

        if (payout.status !== 'pending') {
          return { error: "Only pending payouts can be declined", status: 400 };
        }

        const payoutAmount = parseFloat(payout.tokenAmount);

        // Refund tokens to user's wallet
        const [wallet] = await tx
          .select()
          .from(walletAccounts)
          .where(eq(walletAccounts.userId, payout.userId))
          .for('update')
          .limit(1);

        if (wallet) {
          const currentBalance = parseFloat(wallet.tokenBalance || "0");
          await tx
            .update(walletAccounts)
            .set({ tokenBalance: (currentBalance + payoutAmount).toFixed(2) })
            .where(eq(walletAccounts.userId, payout.userId));
        }

        // Update payout status
        await tx
          .update(walletPayouts)
          .set({
            status: 'declined',
            processedAt: new Date()
          })
          .where(eq(walletPayouts.id, payoutId));

        console.log(`[PAYOUT] Admin ${adminUserId} declined payout ${payoutId}, refunded ${payoutAmount} tokens. Reason: ${reason}`);

        return {
          success: true,
          message: "Payout declined and tokens refunded to user",
          refundedAmount: payoutAmount
        };
      });

      if ('error' in result) {
        return res.status(result.status || 500).json({ error: result.error });
      }

      res.json(result);
    } catch (error) {
      console.error("Error declining payout:", error);
      res.status(500).json({ error: "Failed to decline payout" });
    }
  });

  // ===========================================
  // SQUARE INVOICING API ROUTES
  // ===========================================

  // Create an invoice for a lead/job
  app.post("/api/invoices/lead/:leadId", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { leadId } = req.params;
      const { amount, description, dueDate } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
      }

      const lead = await storage.getLead(leadId);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      const { squareInvoiceService } = await import('./services/square-invoice');
      
      if (!squareInvoiceService.isConfigured()) {
        return res.status(503).json({ 
          error: "Square is not configured. Please add SQUARE_ACCESS_TOKEN to your environment secrets." 
        });
      }

      const result = await squareInvoiceService.createInvoiceForLead(
        lead,
        amount,
        description,
        dueDate
      );

      res.json({
        success: true,
        invoiceId: result.invoiceId,
        invoiceUrl: result.invoiceUrl,
        squareInvoiceId: result.squareInvoiceId,
        message: "Invoice created and sent to customer"
      });
    } catch (error: any) {
      console.error("Error creating invoice for lead:", error);
      res.status(500).json({ error: error.message || "Failed to create invoice" });
    }
  });

  // Create a standalone invoice (not linked to a lead)
  app.post("/api/invoices", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { email, name, phone, amount, description, dueDate } = req.body;

      if (!email || !name || !amount || amount <= 0 || !description) {
        return res.status(400).json({ error: "Email, name, amount, and description are required" });
      }

      const { squareInvoiceService } = await import('./services/square-invoice');
      
      if (!squareInvoiceService.isConfigured()) {
        return res.status(503).json({ 
          error: "Square is not configured. Please add SQUARE_ACCESS_TOKEN to your environment secrets." 
        });
      }

      const result = await squareInvoiceService.createStandaloneInvoice(
        email,
        name,
        phone,
        amount,
        description,
        dueDate
      );

      res.json({
        success: true,
        invoiceId: result.invoiceId,
        invoiceUrl: result.invoiceUrl,
        squareInvoiceId: result.squareInvoiceId,
        message: "Invoice created and sent to customer"
      });
    } catch (error: any) {
      console.error("Error creating standalone invoice:", error);
      res.status(500).json({ error: error.message || "Failed to create invoice" });
    }
  });

  // Get all invoices (admin view)
  app.get("/api/invoices", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { leadId, status } = req.query;
      const filters: any = {};
      if (leadId) filters.leadId = leadId as string;
      if (status) filters.status = status as string;
      
      const invoices = await storage.getSquareInvoices(filters, 100);
      res.json(invoices);
    } catch (error) {
      console.error("Error getting invoices:", error);
      res.status(500).json({ error: "Failed to get invoices" });
    }
  });

  // Get invoices for a specific lead
  app.get("/api/invoices/lead/:leadId", isAuthenticated, async (req: any, res) => {
    try {
      const { leadId } = req.params;
      const invoices = await storage.getSquareInvoices({ leadId });
      res.json(invoices);
    } catch (error) {
      console.error("Error getting lead invoices:", error);
      res.status(500).json({ error: "Failed to get invoices" });
    }
  });

  // Sync invoice status from Square
  app.post("/api/invoices/:id/sync", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const invoice = await storage.getSquareInvoice(id);
      if (!invoice || !invoice.squareInvoiceId) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const { squareInvoiceService } = await import('./services/square-invoice');
      
      if (!squareInvoiceService.isConfigured()) {
        return res.status(503).json({ error: "Square is not configured" });
      }

      const newStatus = await squareInvoiceService.syncInvoiceStatus(invoice.squareInvoiceId);
      
      res.json({ success: true, status: newStatus });
    } catch (error: any) {
      console.error("Error syncing invoice:", error);
      res.status(500).json({ error: error.message || "Failed to sync invoice" });
    }
  });

  // Cancel an invoice
  app.post("/api/invoices/:id/cancel", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const invoice = await storage.getSquareInvoice(id);
      if (!invoice || !invoice.squareInvoiceId) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const { squareInvoiceService } = await import('./services/square-invoice');
      
      if (!squareInvoiceService.isConfigured()) {
        return res.status(503).json({ error: "Square is not configured" });
      }

      await squareInvoiceService.cancelInvoice(invoice.squareInvoiceId);
      
      res.json({ success: true, message: "Invoice canceled" });
    } catch (error: any) {
      console.error("Error canceling invoice:", error);
      res.status(500).json({ error: error.message || "Failed to cancel invoice" });
    }
  });

  // Check Square configuration status
  app.get("/api/invoices/config/status", isAuthenticated, requireBusinessOwner, async (req: any, res) => {
    try {
      const { squareInvoiceService } = await import('./services/square-invoice');
      
      res.json({
        configured: squareInvoiceService.isConfigured(),
        environment: process.env.SQUARE_ENVIRONMENT || 'sandbox'
      });
    } catch (error) {
      console.error("Error checking Square config:", error);
      res.status(500).json({ error: "Failed to check configuration" });
    }
  });

  // ===== SNOW REMOVAL ROUTES =====

  // Get all snow customers
  app.get("/api/snow/customers", isAuthenticated, async (req: any, res) => {
    try {
      const activeOnly = req.query.activeOnly !== 'false';
      const customers = await storage.getSnowCustomers(activeOnly);
      res.json(customers);
    } catch (error: any) {
      console.error("Error fetching snow customers:", error);
      res.status(500).json({ error: error.message || "Failed to fetch customers" });
    }
  });

  // Get single snow customer
  app.get("/api/snow/customers/:id", isAuthenticated, async (req: any, res) => {
    try {
      const customer = await storage.getSnowCustomer(req.params.id);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.json(customer);
    } catch (error: any) {
      console.error("Error fetching snow customer:", error);
      res.status(500).json({ error: error.message || "Failed to fetch customer" });
    }
  });

  // Create snow customer
  app.post("/api/snow/customers", isAuthenticated, async (req: any, res) => {
    try {
      const customer = await storage.createSnowCustomer(req.body);
      res.status(201).json(customer);
    } catch (error: any) {
      console.error("Error creating snow customer:", error);
      res.status(500).json({ error: error.message || "Failed to create customer" });
    }
  });

  // Update snow customer
  app.put("/api/snow/customers/:id", isAuthenticated, async (req: any, res) => {
    try {
      const customer = await storage.updateSnowCustomer(req.params.id, req.body);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.json(customer);
    } catch (error: any) {
      console.error("Error updating snow customer:", error);
      res.status(500).json({ error: error.message || "Failed to update customer" });
    }
  });

  // Delete snow customer (soft delete)
  app.delete("/api/snow/customers/:id", isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteSnowCustomer(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting snow customer:", error);
      res.status(500).json({ error: error.message || "Failed to delete customer" });
    }
  });

  // Seed default snow removal customers (admin only)
  app.post("/api/snow/seed-customers", isAuthenticated, async (req: any, res) => {
    try {
      // Allow both admins and employees to seed default customers
      if (req.user?.role !== 'admin' && req.user?.role !== 'employee') {
        return res.status(403).json({ error: "Employee or admin access required" });
      }
      
      const existingCustomers = await storage.getSnowCustomers();
      const existingNames = new Set(existingCustomers.map(c => c.name.toLowerCase()));
      
      const defaultCustomers = [
        { name: 'Paul', pricePerVisit: 30, notes: 'End of Driveway Only', isPrepaid: false },
        { name: 'Rita', pricePerVisit: 0, notes: 'Prepaid - Driveway', isPrepaid: true },
        { name: 'Bank Owned', pricePerVisit: 230, notes: 'The Works - Full service', isPrepaid: false },
        { name: 'Geri + Al', pricePerVisit: 0, notes: 'No visits yet', isPrepaid: false },
        { name: 'Gina', pricePerVisit: 40, notes: 'Driveway Front Steps', isPrepaid: false },
        { name: 'Sandy', pricePerVisit: 45, notes: 'Driveway Front + Back Steps', isPrepaid: false },
        { name: 'Barbara', pricePerVisit: 35, notes: 'Driveway Only', isPrepaid: false },
        { name: 'Bernard', pricePerVisit: 20, notes: 'End of Driveway Only', isPrepaid: false },
      ];
      
      const added: string[] = [];
      for (const customer of defaultCustomers) {
        if (!existingNames.has(customer.name.toLowerCase())) {
          await storage.createSnowCustomer({
            name: customer.name,
            address: '',
            city: '',
            phone: '',
            pricePerVisit: customer.pricePerVisit,
            notes: customer.notes,
            isPrepaid: customer.isPrepaid,
            isActive: true,
          });
          added.push(customer.name);
        }
      }
      
      res.json({ message: `Added ${added.length} customers`, added });
    } catch (error: any) {
      console.error("Error seeding customers:", error);
      res.status(500).json({ error: error.message || "Failed to seed customers" });
    }
  });

  // Import snow customers from CSV
  app.post("/api/snow/import-csv", isAuthenticated, async (req: any, res) => {
    try {
      const allowedRoles = ['admin', 'employee', 'business_owner'];
      if (!allowedRoles.includes(req.user?.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "No data provided" });
      }

      if (rows.length > 100) {
        return res.status(400).json({ error: "Too many rows (max 100)" });
      }

      // Validate row structure
      for (const row of rows) {
        if (typeof row !== 'object' || !row.name || typeof row.name !== 'string') {
          return res.status(400).json({ error: "Invalid row data" });
        }
      }

      const existingCustomers = await storage.getSnowCustomers();
      const existingNames = new Set(existingCustomers.map(c => c.name.toLowerCase()));

      const added: string[] = [];
      const skipped: string[] = [];

      for (const row of rows) {
        const name = row.name?.trim();
        if (!name) continue;

        if (existingNames.has(name.toLowerCase())) {
          skipped.push(name);
          continue;
        }

        await storage.createSnowCustomer({
          name,
          address: row.address?.trim() || '',
          city: row.city?.trim() || '',
          phone: row.phone?.trim() || '',
          pricePerVisit: parseFloat(row.price) || 0,
          notes: row.notes?.trim() || '',
          isPrepaid: row.prepaid === 'true' || row.prepaid === 'yes' || row.prepaid === '1',
          isActive: true,
        });
        added.push(name);
        existingNames.add(name.toLowerCase());
      }

      res.json({ 
        message: `Imported ${added.length} customers, skipped ${skipped.length} duplicates`,
        added,
        skipped
      });
    } catch (error: any) {
      console.error("Error importing CSV:", error);
      res.status(500).json({ error: error.message || "Failed to import CSV" });
    }
  });

  // Import snow service logs from CSV
  app.post("/api/snow/import-logs-csv", isAuthenticated, async (req: any, res) => {
    try {
      const allowedRoles = ['admin', 'employee', 'business_owner'];
      if (!allowedRoles.includes(req.user?.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "No data provided" });
      }

      if (rows.length > 500) {
        return res.status(400).json({ error: "Too many rows (max 500)" });
      }

      // Validate row structure
      for (const row of rows) {
        if (typeof row !== 'object' || !row.date || !row.customer) {
          return res.status(400).json({ error: "Invalid row data - date and customer required" });
        }
      }

      // Get existing customers to map names to IDs
      const customers = await storage.getSnowCustomers();
      const customerMap = new Map(customers.map(c => [c.name.toLowerCase().trim(), c.id]));

      const added: string[] = [];
      const skipped: string[] = [];
      const errors: string[] = [];

      for (const row of rows) {
        const customerName = row.customer?.trim();
        const customerId = customerMap.get(customerName.toLowerCase());
        
        if (!customerId) {
          skipped.push(`${row.date} - ${customerName} (customer not found)`);
          continue;
        }

        // Parse date (MM/DD/YYYY format)
        const dateParts = row.date.split('/');
        let serviceDate: Date;
        if (dateParts.length === 3) {
          serviceDate = new Date(parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
        } else {
          serviceDate = new Date(row.date);
        }
        
        if (isNaN(serviceDate.getTime())) {
          errors.push(`Invalid date: ${row.date}`);
          continue;
        }

        try {
          await storage.createSnowServiceLog({
            customerId,
            serviceDate,
            serviceType: row.serviceType?.trim() || 'Snow Removal',
            notes: row.notes?.trim() || '',
            price: parseFloat(row.price) || 0,
            isPaid: row.notes?.toLowerCase().includes('paid') || false,
            monthKey: serviceDate.toISOString().slice(0, 7).replace('-', '/') + '/01',
          });
          added.push(`${row.date} - ${customerName}`);
        } catch (err: any) {
          errors.push(`Failed to add ${row.date} - ${customerName}: ${err.message}`);
        }
      }

      res.json({ 
        message: `Imported ${added.length} logs, skipped ${skipped.length}, errors ${errors.length}`,
        added: added.length,
        skipped,
        errors
      });
    } catch (error: any) {
      console.error("Error importing logs CSV:", error);
      res.status(500).json({ error: error.message || "Failed to import logs" });
    }
  });

  // Get snow service types
  app.get("/api/snow/service-types", isAuthenticated, async (req: any, res) => {
    try {
      const activeOnly = req.query.activeOnly !== 'false';
      const types = await storage.getSnowServiceTypes(activeOnly);
      res.json(types);
    } catch (error: any) {
      console.error("Error fetching service types:", error);
      res.status(500).json({ error: error.message || "Failed to fetch service types" });
    }
  });

  // Create snow service type
  app.post("/api/snow/service-types", isAuthenticated, async (req: any, res) => {
    try {
      const serviceType = await storage.createSnowServiceType(req.body);
      res.status(201).json(serviceType);
    } catch (error: any) {
      console.error("Error creating service type:", error);
      res.status(500).json({ error: error.message || "Failed to create service type" });
    }
  });

  // Update snow service type
  app.put("/api/snow/service-types/:id", isAuthenticated, async (req: any, res) => {
    try {
      const serviceType = await storage.updateSnowServiceType(req.params.id, req.body);
      if (!serviceType) {
        return res.status(404).json({ error: "Service type not found" });
      }
      res.json(serviceType);
    } catch (error: any) {
      console.error("Error updating service type:", error);
      res.status(500).json({ error: error.message || "Failed to update service type" });
    }
  });

  // Get snow service logs
  app.get("/api/snow/logs", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId, monthKey, date } = req.query;
      const logs = await storage.getSnowServiceLogs({ customerId, monthKey, date });
      res.json(logs);
    } catch (error: any) {
      console.error("Error fetching service logs:", error);
      res.status(500).json({ error: error.message || "Failed to fetch service logs" });
    }
  });

  // Get single service log
  app.get("/api/snow/logs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const log = await storage.getSnowServiceLog(req.params.id);
      if (!log) {
        return res.status(404).json({ error: "Service log not found" });
      }
      res.json(log);
    } catch (error: any) {
      console.error("Error fetching service log:", error);
      res.status(500).json({ error: error.message || "Failed to fetch service log" });
    }
  });

  // Create snow service log
  app.post("/api/snow/logs", isAuthenticated, async (req: any, res) => {
    try {
      // Auto-generate monthKey from serviceDate if not provided
      const logData = { ...req.body };
      if (logData.serviceDate && !logData.monthKey) {
        const date = new Date(logData.serviceDate);
        logData.monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }
      // Convert empty serviceTypeId to null (foreign key constraint)
      if (logData.serviceTypeId === "" || logData.serviceTypeId === undefined) {
        logData.serviceTypeId = null;
      }
      const log = await storage.createSnowServiceLog(logData);
      res.status(201).json(log);
    } catch (error: any) {
      console.error("Error creating service log:", error);
      res.status(500).json({ error: error.message || "Failed to create service log" });
    }
  });

  // Update snow service log
  app.put("/api/snow/logs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const updateData = { ...req.body };
      // Convert empty serviceTypeId to null (foreign key constraint)
      if (updateData.serviceTypeId === "" || updateData.serviceTypeId === undefined) {
        updateData.serviceTypeId = null;
      }
      const log = await storage.updateSnowServiceLog(req.params.id, updateData);
      if (!log) {
        return res.status(404).json({ error: "Service log not found" });
      }
      res.json(log);
    } catch (error: any) {
      console.error("Error updating service log:", error);
      res.status(500).json({ error: error.message || "Failed to update service log" });
    }
  });

  // Delete snow service log
  app.delete("/api/snow/logs/:id", isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteSnowServiceLog(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting service log:", error);
      res.status(500).json({ error: error.message || "Failed to delete service log" });
    }
  });

  // Get monthly summary
  app.get("/api/snow/summary/:monthKey", isAuthenticated, async (req: any, res) => {
    try {
      const summary = await storage.getSnowMonthlySummary(req.params.monthKey);
      res.json(summary);
    } catch (error: any) {
      console.error("Error fetching monthly summary:", error);
      res.status(500).json({ error: error.message || "Failed to fetch summary" });
    }
  });

  // ==================== JEWELRY ITEMS API ====================
  
  // Get all jewelry items (public)
  app.get("/api/jewelry", async (req: any, res) => {
    try {
      const { status, category, search } = req.query;
      let items: any[];
      if (status) {
        items = await storage.getJewelryItems(status, category || undefined);
      } else {
        const activeItems = await storage.getJewelryItems('active', category || undefined);
        const soldItems = await storage.getJewelryItems('sold', category || undefined);
        items = [...activeItems, ...soldItems];
        items.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      items = items.filter((item: any) => {
        if (item.soldAt) {
          return new Date(item.soldAt) > thirtyDaysAgo;
        }
        return true;
      });

      if (search) {
        const searchLower = search.toLowerCase();
        items = items.filter((item: any) => 
          item.title?.toLowerCase().includes(searchLower) ||
          item.description?.toLowerCase().includes(searchLower) ||
          item.shortDescription?.toLowerCase().includes(searchLower) ||
          item.materials?.toLowerCase().includes(searchLower) ||
          item.category?.toLowerCase().includes(searchLower)
        );
      }
      
      res.json(items);
    } catch (error: any) {
      console.error("Error fetching jewelry items:", error);
      res.status(500).json({ error: error.message || "Failed to fetch jewelry items" });
    }
  });
  
  // Get single jewelry item (public)
  app.get("/api/jewelry/:id", async (req: any, res) => {
    try {
      const item = await storage.getJewelryItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json(item);
    } catch (error: any) {
      console.error("Error fetching jewelry item:", error);
      res.status(500).json({ error: error.message || "Failed to fetch jewelry item" });
    }
  });
  
  app.post("/api/jewelry/upload-photo", isAuthenticated, async (req: any, res) => {
    try {
      const allowedRoles = ['admin', 'business_owner', 'employee'];
      if (!allowedRoles.includes(req.user?.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { image, extension } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Image data is required" });
      }

      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorage = new ObjectStorageService();
      const url = await objectStorage.saveBase64Image(image, extension || 'jpg');
      res.json({ url });
    } catch (error: any) {
      console.error("Error uploading jewelry photo:", error);
      res.status(500).json({ error: "Failed to upload photo" });
    }
  });

  app.post("/api/jewelry/upload-video", isAuthenticated, async (req: any, res) => {
    try {
      const allowedRoles = ['admin', 'business_owner', 'employee'];
      if (!allowedRoles.includes(req.user?.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { video, extension } = req.body;
      if (!video) {
        return res.status(400).json({ error: "Video data is required" });
      }

      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorage = new ObjectStorageService();
      const url = await objectStorage.saveBase64Video(video, extension || 'mp4');
      res.json({ url });
    } catch (error: any) {
      console.error("Error uploading jewelry video:", error);
      res.status(500).json({ error: "Failed to upload video" });
    }
  });

  // Create jewelry item (requires auth - admin/business_owner/employee)
  app.post("/api/jewelry", isAuthenticated, async (req: any, res) => {
    try {
      const allowedRoles = ['admin', 'business_owner', 'employee'];
      if (!allowedRoles.includes(req.user?.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const { title, price, ...rest } = req.body;
      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }
      
      const cleanedData = {
        ...rest,
        title,
        price: price && price !== '' ? price : '0.00',
        postedBy: req.user.id,
      };
      
      const item = await storage.createJewelryItem(cleanedData);
      res.status(201).json(item);
    } catch (error: any) {
      console.error("Error creating jewelry item:", error);
      res.status(500).json({ error: error.message || "Failed to create jewelry item" });
    }
  });
  
  app.patch("/api/jewelry/:id", isAuthenticated, async (req: any, res) => {
    try {
      const existing = await storage.getJewelryItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const isOwner = existing.postedBy === req.user.id;
      const isAdmin = req.user.role === 'admin' || req.user.role === 'business_owner';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Only the item owner or admin can edit this item" });
      }
      
      const item = await storage.updateJewelryItem(req.params.id, req.body);
      res.json(item);
    } catch (error: any) {
      console.error("Error updating jewelry item:", error);
      res.status(500).json({ error: error.message || "Failed to update jewelry item" });
    }
  });
  
  app.delete("/api/jewelry/:id", isAuthenticated, async (req: any, res) => {
    try {
      const existing = await storage.getJewelryItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const isOwner = existing.postedBy === req.user.id;
      const isAdmin = req.user.role === 'admin' || req.user.role === 'business_owner';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Only the item owner or admin can delete this item" });
      }
      
      await storage.deleteJewelryItem(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting jewelry item:", error);
      res.status(500).json({ error: error.message || "Failed to delete jewelry item" });
    }
  });

  app.patch("/api/jewelry/:id/sold", isAuthenticated, async (req: any, res) => {
    try {
      const existing = await storage.getJewelryItem(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Item not found" });
      }

      const isOwner = existing.postedBy === req.user.id;
      const isAdmin = req.user.role === 'admin' || req.user.role === 'business_owner';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "Only the item owner or admin can update this item" });
      }

      const { sold } = req.body;
      if (typeof sold !== 'boolean') {
        return res.status(400).json({ error: "sold must be a boolean" });
      }
      const updates: any = {
        inStock: !sold,
        soldAt: sold ? new Date() : null,
        status: sold ? 'sold' : 'active',
      };

      const updated = await storage.updateJewelryItem(req.params.id, updates);
      res.json(updated);
    } catch (error: any) {
      console.error("Error marking jewelry item sold:", error);
      res.status(500).json({ error: error.message || "Failed to update item" });
    }
  });

  // Square Checkout API - Create payment link for jewelry purchases
  app.post("/api/square/create-checkout", async (req: any, res) => {
    try {
      const { itemId } = req.body;

      if (!itemId) {
        return res.status(400).json({ error: "Missing required field: itemId" });
      }

      const dbItem = await storage.getJewelryItem(itemId);
      if (!dbItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      if (!dbItem.inStock) {
        return res.status(400).json({ error: "This item is no longer available" });
      }
      if (!dbItem.price) {
        return res.status(400).json({ error: "This item does not have a price set" });
      }

      const parsedAmount = parseFloat(dbItem.price);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Invalid price amount" });
      }

      const squareToken = process.env.SQUARE_ACCESS_TOKEN;
      if (!squareToken) {
        return res.status(500).json({ error: "Square payment is not configured yet. Please contact us to purchase this item." });
      }

      const { SquareClient, SquareEnvironment } = await import("square");
      const { randomUUID } = await import("crypto");

      const client = new SquareClient({
        token: squareToken,
        environment: SquareEnvironment.Production,
      });

      const locationsResponse = await client.locations.list();
      const locations = locationsResponse.locations;
      if (!locations || locations.length === 0) {
        return res.status(500).json({ error: "No Square locations found. Please configure your Square account." });
      }
      const locationId = locations[0].id!;

      const amountCents = BigInt(Math.round(parsedAmount * 100));

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      const paymentLinkResponse = await client.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        quickPay: {
          name: `Nature Made Jewls - ${dbItem.title}`,
          priceMoney: {
            amount: amountCents,
            currency: "USD",
          },
          locationId,
        },
        checkoutOptions: {
          redirectUrl: `${baseUrl}/payment-success?itemId=${itemId}`,
          allowTipping: false,
          merchantSupportEmail: "upmichiganstatemovers@gmail.com",
        },
        paymentNote: `Jewelry purchase: ${dbItem.title} (ID: ${itemId})`,
      });

      const paymentLink = paymentLinkResponse.result?.paymentLink || paymentLinkResponse.paymentLink;
      if (!paymentLink?.url) {
        return res.status(500).json({ error: "Failed to create payment link" });
      }

      console.log(`Square checkout link created for ${dbItem.title} ($${dbItem.price}) - ${paymentLink.url}`);

      res.json({
        success: true,
        checkoutUrl: paymentLink.url,
        linkId: paymentLink.id,
      });
    } catch (error: any) {
      console.error("Error creating Square checkout:", error);
      const errorMsg = error?.errors?.[0]?.detail || error.message || "Failed to create checkout link";
      res.status(500).json({ error: errorMsg });
    }
  });

  // Promo Half Day Package - Creates lead + Square Checkout
  app.post("/api/promo/half-day-checkout", async (req: any, res) => {
    try {
      const { firstName, lastName, email, phone, fromAddress, toAddress, moveDate, details } = req.body;

      if (!firstName || !lastName || !email || !phone || !fromAddress || !moveDate) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const squareToken = process.env.SQUARE_ACCESS_TOKEN;
      if (!squareToken) {
        return res.status(500).json({ error: "Payment processing is not configured. Please call us at 906-285-9312 to book." });
      }

      const lead = await storage.createLead({
        firstName,
        lastName,
        email,
        phone,
        serviceType: "residential",
        fromAddress,
        toAddress: toAddress || "",
        moveDate,
        details: `[HALF DAY PROMO - $600] 3 Movers, 4 Hours, Travel Included. ${details || ""}`.trim(),
        propertySize: "half-day-promo",
        crewSize: 3,
        truckConfig: "company_truck",
        basePrice: "600.00",
        totalPrice: "600.00",
      });

      const { SquareClient, SquareEnvironment } = await import("square");
      const { randomUUID } = await import("crypto");

      const client = new SquareClient({
        token: squareToken,
        environment: SquareEnvironment.Production,
      });

      const locationsResponse = await client.locations.list();
      const locations = locationsResponse.locations;
      if (!locations || locations.length === 0) {
        return res.status(500).json({ error: "Payment setup incomplete. Please call us at 906-285-9312." });
      }
      const locationId = locations[0].id!;

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;

      const paymentLinkResponse = await client.checkout.paymentLinks.create({
        idempotencyKey: randomUUID(),
        quickPay: {
          name: "Half Day Loading/Unloading - 3 Movers, 4 Hours",
          priceMoney: {
            amount: BigInt(60000),
            currency: "USD",
          },
          locationId,
        },
        checkoutOptions: {
          redirectUrl: `${baseUrl}/payment-success?type=promo&leadId=${lead.id}`,
          allowTipping: false,
          merchantSupportEmail: "upmichiganstatemovers@gmail.com",
        },
        paymentNote: `Half Day Promo - ${firstName} ${lastName} - ${moveDate} - Lead ID: ${lead.id}`,
      });

      const paymentLink = paymentLinkResponse.result?.paymentLink || paymentLinkResponse.paymentLink;
      if (!paymentLink?.url) {
        return res.status(500).json({ error: "Failed to create payment link" });
      }

      // Send confirmation email to customer
      try {
        await sendEmail({
          to: email,
          from: process.env.COMPANY_EMAIL || "upmichiganstatemovers@gmail.com",
          subject: "JC ON THE MOVE - Half Day Move Booking Confirmation",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1e293b; color: #e2e8f0; padding: 30px; border-radius: 12px;">
              <h1 style="color: #facc15; text-align: center; margin-bottom: 20px;">JC ON THE MOVE LLC</h1>
              <h2 style="color: white; text-align: center;">Half Day Move — Booking Confirmed</h2>
              
              <div style="background: #334155; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #facc15; margin-top: 0;">Package Details</h3>
                <p><strong>Service:</strong> Half Day Loading/Unloading</p>
                <p><strong>Crew:</strong> 3 Professional Movers</p>
                <p><strong>Duration:</strong> 4 Hours (travel time included)</p>
                <p><strong>Price:</strong> $600.00</p>
              </div>
              
              <div style="background: #334155; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #60a5fa; margin-top: 0;">Your Move Info</h3>
                <p><strong>Name:</strong> ${firstName} ${lastName}</p>
                <p><strong>Date:</strong> ${moveDate}</p>
                <p><strong>Pickup:</strong> ${fromAddress}</p>
                ${toAddress ? `<p><strong>Drop-off:</strong> ${toAddress}</p>` : ""}
                ${details ? `<p><strong>Notes:</strong> ${details}</p>` : ""}
              </div>
              
              <div style="background: #7f1d1d40; border: 1px solid #ef444480; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #fca5a5; margin-top: 0; font-size: 14px;">Cancellation Policy</h3>
                <p style="font-size: 13px; margin: 5px 0;">• More than 48 hours: $10 processing fee or $100, whichever is greater</p>
                <p style="font-size: 13px; margin: 5px 0;">• Within 48 hours: 25% fee ($150)</p>
                <p style="font-size: 13px; margin: 5px 0;">• Within 24 hours: 50% fee ($300)</p>
              </div>
              
              <p style="text-align: center; color: #94a3b8; font-size: 13px; margin-top: 25px;">
                Questions? Call us at <a href="tel:906-285-9312" style="color: #60a5fa;">906-285-9312</a> or email 
                <a href="mailto:upmichiganstatemovers@gmail.com" style="color: #60a5fa;">upmichiganstatemovers@gmail.com</a>
              </p>
            </div>
          `,
          text: `JC ON THE MOVE - Half Day Move Booking\n\nHi ${firstName},\n\nYour Half Day Loading/Unloading booking is confirmed!\n\nPackage: 3 Movers, 4 Hours, Travel Included\nPrice: $600.00\nDate: ${moveDate}\nPickup: ${fromAddress}\n${toAddress ? `Drop-off: ${toAddress}\n` : ""}${details ? `Notes: ${details}\n` : ""}\nCancellation Policy:\n- More than 48 hours: $10 or $100 fee (whichever is greater)\n- Within 48 hours: 25% ($150)\n- Within 24 hours: 50% ($300)\n\nCall 906-285-9312 with questions.`,
        });
      } catch (emailErr) {
        console.error("Failed to send promo booking email:", emailErr);
      }

      // Notify business
      try {
        await sendEmail({
          to: process.env.COMPANY_EMAIL || "upmichiganstatemovers@gmail.com",
          from: process.env.COMPANY_EMAIL || "upmichiganstatemovers@gmail.com",
          subject: `New Half Day Promo Booking - ${firstName} ${lastName} - ${moveDate}`,
          html: `<h2>New Half Day Promo Booking</h2><p><strong>${firstName} ${lastName}</strong></p><p>Phone: ${phone}</p><p>Email: ${email}</p><p>Date: ${moveDate}</p><p>From: ${fromAddress}</p>${toAddress ? `<p>To: ${toAddress}</p>` : ""}<p>Price: $600</p>${details ? `<p>Notes: ${details}</p>` : ""}<p>Lead ID: ${lead.id}</p>`,
          text: `New Half Day Promo Booking\n${firstName} ${lastName}\nPhone: ${phone}\nEmail: ${email}\nDate: ${moveDate}\nFrom: ${fromAddress}\n${toAddress ? `To: ${toAddress}\n` : ""}Price: $600\nLead ID: ${lead.id}`,
        });
      } catch (emailErr) {
        console.error("Failed to send business notification:", emailErr);
      }

      console.log(`Half Day Promo checkout created for ${firstName} ${lastName} (${moveDate}) - Lead: ${lead.id} - ${paymentLink.url}`);

      res.json({
        success: true,
        checkoutUrl: paymentLink.url,
        leadId: lead.id,
      });
    } catch (error: any) {
      console.error("Error creating promo checkout:", error);
      const errorMsg = error?.errors?.[0]?.detail || error.message || "Failed to create checkout";
      res.status(500).json({ error: errorMsg });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
