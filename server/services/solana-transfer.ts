import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createTransferInstruction, getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import { storage } from '../storage';
import { TREASURY_CONFIG } from '../constants';

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

class TreasuryKeyManager {
  private keypair: Keypair | null = null;
  private initialized: boolean = false;
  private initError: string | null = null;

  initialize(): boolean {
    if (this.initialized) {
      return this.keypair !== null;
    }

    this.initialized = true;
    
    const privateKeyBase58 = process.env.TREASURY_WALLET_PRIVATE_KEY?.trim();
    
    if (!privateKeyBase58) {
      this.initError = 'TREASURY_WALLET_PRIVATE_KEY environment variable not set. Real blockchain transfers disabled.';
      console.warn(`⚠️ ${this.initError}`);
      return false;
    }

    try {
      const secretKey = bs58.decode(privateKeyBase58);
      
      if (secretKey.length !== 64) {
        this.initError = 'Invalid private key length. Expected 64 bytes.';
        console.error(`❌ ${this.initError}`);
        return false;
      }

      this.keypair = Keypair.fromSecretKey(secretKey);
      console.log(`✅ Treasury KeyManager initialized: ${this.keypair.publicKey.toBase58()}`);
      return true;
    } catch (error) {
      this.initError = `Failed to decode treasury private key: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ ${this.initError}`);
      return false;
    }
  }

  getKeypair(): Keypair | null {
    if (!this.initialized) {
      this.initialize();
    }
    return this.keypair;
  }

  getPublicKey(): PublicKey | null {
    return this.keypair?.publicKey || null;
  }

  getAddress(): string | null {
    return this.keypair?.publicKey.toBase58() || null;
  }

  isReady(): boolean {
    if (!this.initialized) {
      this.initialize();
    }
    return this.keypair !== null;
  }

  getError(): string | null {
    return this.initError;
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

  getStatus(): { operational: boolean; address?: string; error?: string } {
    if (treasuryKeyManager.isReady()) {
      return {
        operational: true,
        address: treasuryKeyManager.getAddress() || undefined
      };
    }
    return {
      operational: false,
      error: treasuryKeyManager.getError() || 'Treasury wallet not configured'
    };
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

      const decimals = 8;
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
