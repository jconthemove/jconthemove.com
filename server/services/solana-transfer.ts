import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createTransferInstruction, getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import { storage } from '../storage';
import { TREASURY_CONFIG } from '../constants';
import { db } from '../db';
import { transferFees, buybackFund } from '@shared/schema';
import { sql } from 'drizzle-orm';

// Platform fee configuration (2x base Solana fee ~0.000005 SOL)
const PLATFORM_FEE_SOL = 0.00001; // 2x base fee
const BASE_FEE_SOL = 0.000005; // Base Solana transaction fee

export interface TransferResult {
  success: boolean;
  transactionHash?: string;
  amount?: number;
  recipientAddress?: string;
  error?: string;
  timestamp?: Date;
}

export interface TransferRequest {
  recipientAddress: string;
  amount: number;
  memo?: string;
}

export type TreasuryWalletType = 'primary' | 'jcmoves_banks' | 'in_god_we_trust';

interface WalletConfig {
  envVar: string;
  name: string;
  description: string;
  purpose: 'operations' | 'buybacks' | 'general';
}

const WALLET_CONFIGS: Record<TreasuryWalletType, WalletConfig> = {
  primary: {
    envVar: 'TREASURY_WALLET_PRIVATE_KEY',
    name: 'Primary Treasury',
    description: 'Original treasury wallet for token operations',
    purpose: 'general'
  },
  jcmoves_banks: {
    envVar: 'JCMOVES_BANKS_PRIVATE_KEY',
    name: 'JC MOVES BANKS',
    description: 'Main operations wallet for employee rewards and transfers',
    purpose: 'operations'
  },
  in_god_we_trust: {
    envVar: 'IN_GOD_WE_TRUST_PRIVATE_KEY',
    name: 'IN GOD WE TRUST',
    description: 'Dedicated wallet for token buybacks and swaps',
    purpose: 'buybacks'
  }
};

class TreasuryKeyManager {
  private keypairs: Map<TreasuryWalletType, Keypair> = new Map();
  private activeWallet: TreasuryWalletType = 'jcmoves_banks';
  private initialized: boolean = false;
  private initErrors: Map<TreasuryWalletType, string> = new Map();

  initialize(): boolean {
    if (this.initialized) {
      return this.keypairs.size > 0;
    }

    this.initialized = true;
    
    for (const [walletType, config] of Object.entries(WALLET_CONFIGS) as [TreasuryWalletType, WalletConfig][]) {
      const privateKeyBase58 = process.env[config.envVar]?.trim();
      
      if (!privateKeyBase58) {
        this.initErrors.set(walletType, `${config.envVar} not set`);
        console.warn(`⚠️ ${config.name}: ${config.envVar} not configured`);
        continue;
      }

      try {
        const secretKey = bs58.decode(privateKeyBase58);
        
        if (secretKey.length !== 64) {
          this.initErrors.set(walletType, 'Invalid private key length');
          console.error(`❌ ${config.name}: Invalid key length`);
          continue;
        }

        const keypair = Keypair.fromSecretKey(secretKey);
        this.keypairs.set(walletType, keypair);
        console.log(`✅ ${config.name} initialized: ${keypair.publicKey.toBase58()}`);
      } catch (error) {
        this.initErrors.set(walletType, `Failed to decode: ${error instanceof Error ? error.message : 'Unknown'}`);
        console.error(`❌ ${config.name}: Failed to initialize`);
      }
    }

    if (!this.keypairs.has(this.activeWallet) && this.keypairs.size > 0) {
      this.activeWallet = Array.from(this.keypairs.keys())[0];
      console.log(`📍 Active wallet set to: ${this.activeWallet}`);
    }

    return this.keypairs.size > 0;
  }

  setActiveWallet(walletType: TreasuryWalletType): boolean {
    if (this.keypairs.has(walletType)) {
      this.activeWallet = walletType;
      console.log(`🔄 Switched active treasury to: ${WALLET_CONFIGS[walletType].name}`);
      return true;
    }
    return false;
  }

  getActiveWalletType(): TreasuryWalletType {
    return this.activeWallet;
  }

  getAvailableWallets(): { type: TreasuryWalletType; name: string; address: string; isActive: boolean }[] {
    if (!this.initialized) this.initialize();
    
    return Array.from(this.keypairs.entries()).map(([type, keypair]) => ({
      type,
      name: WALLET_CONFIGS[type].name,
      address: keypair.publicKey.toBase58(),
      isActive: type === this.activeWallet
    }));
  }

  getKeypair(walletType?: TreasuryWalletType): Keypair | null {
    if (!this.initialized) {
      this.initialize();
    }
    const type = walletType || this.activeWallet;
    return this.keypairs.get(type) || null;
  }

  getPublicKey(walletType?: TreasuryWalletType): PublicKey | null {
    const keypair = this.getKeypair(walletType);
    return keypair?.publicKey || null;
  }

  getAddress(walletType?: TreasuryWalletType): string | null {
    const keypair = this.getKeypair(walletType);
    return keypair?.publicKey.toBase58() || null;
  }

  isReady(walletType?: TreasuryWalletType): boolean {
    if (!this.initialized) {
      this.initialize();
    }
    const type = walletType || this.activeWallet;
    return this.keypairs.has(type);
  }

  getError(walletType?: TreasuryWalletType): string | null {
    const type = walletType || this.activeWallet;
    return this.initErrors.get(type) || null;
  }
}

export const treasuryKeyManager = new TreasuryKeyManager();

export class SolanaTransferService {
  private connection: Connection;
  private tokenMintAddress: string;

  constructor() {
    const envRpcUrl = process.env.VITE_SOLANA_RPC_URL?.trim();
    const isValidUrl = envRpcUrl && (envRpcUrl.startsWith('http://') || envRpcUrl.startsWith('https://'));
    const rpcUrl = isValidUrl ? envRpcUrl : 'https://api.mainnet-beta.solana.com';
    
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.tokenMintAddress = process.env.MOONSHOT_TOKEN_ADDRESS || 'BHZW4jds7NSe5Fqvw9Z4pvt423EJSx63k8MT11F2moon';
    
    console.log('🔗 SolanaTransferService initialized');
    console.log(`📍 RPC: ${rpcUrl}`);
    console.log(`🪙 Token Mint: ${this.tokenMintAddress}`);
    
    treasuryKeyManager.initialize();
  }

  isOperational(): boolean {
    return treasuryKeyManager.isReady();
  }

  getStatus(): { 
    operational: boolean; 
    address?: string; 
    error?: string;
    activeWallet?: TreasuryWalletType;
    availableWallets?: { type: TreasuryWalletType; name: string; address: string; isActive: boolean }[];
  } {
    if (treasuryKeyManager.isReady()) {
      return {
        operational: true,
        address: treasuryKeyManager.getAddress() || undefined,
        activeWallet: treasuryKeyManager.getActiveWalletType(),
        availableWallets: treasuryKeyManager.getAvailableWallets()
      };
    }
    return {
      operational: false,
      error: treasuryKeyManager.getError() || 'Treasury wallet not configured'
    };
  }

  switchActiveWallet(walletType: TreasuryWalletType): boolean {
    return treasuryKeyManager.setActiveWallet(walletType);
  }

  async getTreasuryBalance(): Promise<{ solBalance: number; tokenBalance: number }> {
    const keypair = treasuryKeyManager.getKeypair();
    
    if (!keypair) {
      return { solBalance: 0, tokenBalance: 0 };
    }

    try {
      const solBalance = await this.connection.getBalance(keypair.publicKey);
      
      const mintPubkey = new PublicKey(this.tokenMintAddress);
      const ata = await getAssociatedTokenAddress(mintPubkey, keypair.publicKey);
      
      let tokenBalance = 0;
      try {
        const tokenAccountInfo = await this.connection.getTokenAccountBalance(ata);
        tokenBalance = parseFloat(tokenAccountInfo.value.uiAmountString || '0');
      } catch (e) {
        console.log('Treasury token account may not exist yet');
      }

      return {
        solBalance: solBalance / 1e9,
        tokenBalance
      };
    } catch (error) {
      console.error('Error getting treasury balance:', error);
      return { solBalance: 0, tokenBalance: 0 };
    }
  }

  async transferTokens(request: TransferRequest): Promise<TransferResult> {
    const { recipientAddress, amount, memo } = request;

    const keypair = treasuryKeyManager.getKeypair();
    
    if (!keypair) {
      return {
        success: false,
        error: treasuryKeyManager.getError() || 'Treasury wallet not configured for real transfers'
      };
    }

    const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!solanaAddressRegex.test(recipientAddress)) {
      return {
        success: false,
        error: 'Invalid Solana wallet address format'
      };
    }

    if (amount <= 0) {
      return {
        success: false,
        error: 'Transfer amount must be greater than zero'
      };
    }

    if (amount > TREASURY_CONFIG.MAX_TRANSFER_PER_TX) {
      return {
        success: false,
        error: `Transfer amount exceeds per-transaction limit of ${TREASURY_CONFIG.MAX_TRANSFER_PER_TX} tokens`
      };
    }

    try {
      const { tokenBalance } = await this.getTreasuryBalance();
      if (tokenBalance < amount) {
        return {
          success: false,
          error: `Insufficient treasury balance. Available: ${tokenBalance.toFixed(2)}, Requested: ${amount}`
        };
      }

      if (tokenBalance - amount < TREASURY_CONFIG.MIN_TREASURY_RESERVE) {
        return {
          success: false,
          error: `Transfer would bring treasury below minimum reserve of ${TREASURY_CONFIG.MIN_TREASURY_RESERVE} tokens`
        };
      }

      const mintPubkey = new PublicKey(this.tokenMintAddress);
      const recipientPubkey = new PublicKey(recipientAddress);

      const sourceAta = await getAssociatedTokenAddress(mintPubkey, keypair.publicKey);

      let destinationAta: PublicKey;
      try {
        const destAccount = await getOrCreateAssociatedTokenAccount(
          this.connection,
          keypair,
          mintPubkey,
          recipientPubkey
        );
        destinationAta = destAccount.address;
      } catch (ataError) {
        console.error('Error creating/getting destination ATA:', ataError);
        return {
          success: false,
          error: 'Failed to create recipient token account. They may need SOL for rent.'
        };
      }

      // JCMOVES token has 6 decimals (verified from on-chain mint data)
      const decimals = 6;
      const amountInSmallestUnits = BigInt(Math.floor(amount * Math.pow(10, decimals)));

      const transferInstruction = createTransferInstruction(
        sourceAta,
        destinationAta,
        keypair.publicKey,
        amountInSmallestUnits,
        [],
        TOKEN_PROGRAM_ID
      );

      const transaction = new Transaction().add(transferInstruction);

      console.log(`📤 Sending ${amount} JCMOVES to ${recipientAddress}...`);
      if (memo) {
        console.log(`📝 Memo: ${memo}`);
      }
      
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [keypair],
        {
          commitment: 'confirmed',
          maxRetries: 3
        }
      );

      console.log(`✅ Transfer successful! TX: ${signature}`);

      // Record transfer fee for buyback fund
      await this.recordTransferFee({
        transactionHash: signature,
        fromWallet: keypair.publicKey.toBase58(),
        toWallet: recipientAddress,
        tokenAmount: amount
      });

      return {
        success: true,
        transactionHash: signature,
        amount,
        recipientAddress,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('❌ Transfer failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown transfer error'
      };
    }
  }

  private async recordTransferFee(params: {
    transactionHash: string;
    fromWallet: string;
    toWallet: string;
    tokenAmount: number;
  }): Promise<void> {
    try {
      const totalFee = BASE_FEE_SOL + PLATFORM_FEE_SOL;

      // Record the fee
      await db.insert(transferFees).values({
        transactionHash: params.transactionHash,
        fromWallet: params.fromWallet,
        toWallet: params.toWallet,
        tokenAmount: params.tokenAmount.toString(),
        baseFee: BASE_FEE_SOL.toString(),
        platformFee: PLATFORM_FEE_SOL.toString(),
        totalFee: totalFee.toString(),
        status: 'collected'
      });

      // Update or create the buyback fund
      const existingFund = await db.query.buybackFund.findFirst();
      
      if (existingFund) {
        await db.update(buybackFund)
          .set({
            solBalance: sql`${buybackFund.solBalance} + ${PLATFORM_FEE_SOL}`,
            totalCollected: sql`${buybackFund.totalCollected} + ${PLATFORM_FEE_SOL}`,
            lastUpdated: new Date()
          });
      } else {
        await db.insert(buybackFund).values({
          solBalance: PLATFORM_FEE_SOL.toString(),
          totalCollected: PLATFORM_FEE_SOL.toString(),
          totalUsedForBuyback: "0",
          totalTokensBought: "0",
          buybackCount: 0
        });
      }

      console.log(`💰 Fee collected: ${PLATFORM_FEE_SOL} SOL for buyback fund`);
    } catch (error) {
      // Don't fail the transfer if fee recording fails
      console.error('Warning: Failed to record transfer fee:', error);
    }
  }

  /**
   * Transfer JCMOVES tokens to the IN GOD WE TRUST wallet for the token buyback program.
   * This is called after a successful payout to collect the network fee for buybacks.
   */
  async transferFeeToBuybackWallet(feeAmount: number, payoutTransactionHash: string): Promise<TransferResult> {
    try {
      // Get the IN GOD WE TRUST wallet address for buybacks
      const buybackWalletAddress = treasuryKeyManager.getAddress('in_god_we_trust');
      
      if (!buybackWalletAddress) {
        console.warn('⚠️ IN GOD WE TRUST wallet not configured - fee retained in treasury');
        return {
          success: false,
          error: 'Buyback wallet not configured'
        };
      }

      // Don't transfer to self if IN GOD WE TRUST is the active wallet
      const activeWalletAddress = treasuryKeyManager.getAddress();
      if (activeWalletAddress === buybackWalletAddress) {
        console.log('📌 Active wallet is already IN GOD WE TRUST - fee retained');
        return {
          success: true,
          amount: feeAmount,
          recipientAddress: buybackWalletAddress,
          timestamp: new Date()
        };
      }

      // Execute the fee transfer to buyback wallet
      console.log(`💸 Transferring ${feeAmount} JCMOVES fee to buyback wallet...`);
      const result = await this.transferTokens({
        recipientAddress: buybackWalletAddress,
        amount: feeAmount,
        memo: `Payout fee for buyback program (ref: ${payoutTransactionHash.slice(0, 8)})`
      });

      if (result.success) {
        console.log(`✅ Fee transferred to IN GOD WE TRUST wallet for buyback: ${result.transactionHash}`);
        
        // Update buyback fund with JCMOVES tokens instead of SOL
        const existingFund = await db.query.buybackFund.findFirst();
        
        if (existingFund) {
          await db.update(buybackFund)
            .set({
              totalTokensBought: sql`${buybackFund.totalTokensBought} + ${feeAmount}`,
              totalCollected: sql`${buybackFund.totalCollected} + ${feeAmount}`,
              lastUpdated: new Date()
            });
        }
      } else {
        console.warn(`⚠️ Fee transfer to buyback wallet failed: ${result.error}`);
      }

      return result;
    } catch (error) {
      console.error('Error transferring fee to buyback wallet:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to transfer fee to buyback wallet'
      };
    }
  }

  async sendRewardToUser(userId: string, amount: number, rewardType: string): Promise<TransferResult> {
    try {
      const payoutInfo = await storage.getPayoutAddress(userId);
      
      if (!payoutInfo.address) {
        return {
          success: false,
          error: 'User has no wallet configured for receiving rewards'
        };
      }

      const result = await this.transferTokens({
        recipientAddress: payoutInfo.address,
        amount,
        memo: `Reward: ${rewardType} for user ${userId}`
      });

      if (result.success) {
        console.log(`✅ Sent ${amount} JCMOVES to user ${userId} (${payoutInfo.mode} wallet)`);
      }

      return result;
    } catch (error) {
      console.error(`Error sending reward to user ${userId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send reward'
      };
    }
  }

  async batchTransfer(transfers: { recipientAddress: string; amount: number }[]): Promise<{
    successful: TransferResult[];
    failed: TransferResult[];
    totalTransferred: number;
  }> {
    const successful: TransferResult[] = [];
    const failed: TransferResult[] = [];
    let totalTransferred = 0;

    for (const transfer of transfers) {
      const result = await this.transferTokens(transfer);
      
      if (result.success) {
        successful.push(result);
        totalTransferred += transfer.amount;
      } else {
        failed.push({
          ...result,
          recipientAddress: transfer.recipientAddress,
          amount: transfer.amount
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return {
      successful,
      failed,
      totalTransferred
    };
  }
}

export const solanaTransferService = new SolanaTransferService();
