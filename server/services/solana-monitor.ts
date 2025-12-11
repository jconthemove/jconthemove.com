import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { storage } from '../storage';
import { treasuryService } from './treasury';
import { moonshotService } from './moonshot';
import { treasuryKeyManager } from './solana-transfer';

/**
 * Solana Blockchain Transaction Monitor
 * Automatically detects incoming JCMOVES token transfers to treasury wallet
 */
export class SolanaMonitor {
  private connection: Connection;
  private isMonitoring: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastCheckedSignature: string | null = null;
  private treasuryWalletAddress: string | null = null;
  private jcmovesTokenAddress: string;

  constructor() {
    // Validate and get RPC URL with proper fallback
    const envRpcUrl = process.env.VITE_SOLANA_RPC_URL?.trim();
    const isValidUrl = envRpcUrl && (envRpcUrl.startsWith('http://') || envRpcUrl.startsWith('https://'));
    const rpcUrl = isValidUrl ? envRpcUrl : 'https://api.mainnet-beta.solana.com';
    
    if (!isValidUrl && process.env.VITE_SOLANA_RPC_URL) {
      console.warn('⚠️ Invalid VITE_SOLANA_RPC_URL (must start with http:// or https://). Using fallback: https://api.mainnet-beta.solana.com');
    } else if (!envRpcUrl) {
      console.warn('⚠️ VITE_SOLANA_RPC_URL not set. Using public Solana RPC endpoint (rate limited). Set VITE_SOLANA_RPC_URL in deployment secrets for better performance.');
    }
    
    this.connection = new Connection(rpcUrl, 'confirmed');
    // Use consistent token address - JCMOVES on Moonshot
    this.jcmovesTokenAddress = process.env.MOONSHOT_TOKEN_ADDRESS || 'BHZW4jds7NSe5Fqvw9Z4pvt423EJSx63k8MT11F2moon';
  }

  /**
   * Initialize treasury wallet address from TreasuryKeyManager (private key)
   */
  async initializeTreasuryAddress(): Promise<void> {
    try {
      console.log('🔍 Initializing treasury address from KeyManager...');
      
      // First try to get address from TreasuryKeyManager (derived from private key)
      const keyManagerAddress = treasuryKeyManager.getAddress();
      if (keyManagerAddress) {
        this.treasuryWalletAddress = keyManagerAddress;
        console.log(`✅ Treasury wallet initialized from KeyManager: ${this.treasuryWalletAddress}`);
        return;
      }
      
      // Fallback to database if KeyManager not ready
      console.log('⚠️ KeyManager not ready, falling back to database...');
      const treasuryWallets = await storage.getTreasuryWallets('admin');
      console.log(`📊 Found ${treasuryWallets.length} treasury wallet(s) with admin scope`);
      
      const mainTreasury = treasuryWallets.find(w => w.purpose === 'treasury');
      
      if (mainTreasury) {
        this.treasuryWalletAddress = mainTreasury.walletAddress;
        console.log(`✅ Treasury wallet initialized from DB: ${this.treasuryWalletAddress}`);
      } else {
        // Try without role scope as fallback
        const allTreasuryWallets = await storage.getTreasuryWallets();
        const fallbackTreasury = allTreasuryWallets.find(w => w.purpose === 'treasury');
        if (fallbackTreasury) {
          this.treasuryWalletAddress = fallbackTreasury.walletAddress;
          console.log(`✅ Treasury wallet initialized (fallback): ${this.treasuryWalletAddress}`);
        }
      }
    } catch (error) {
      console.error('❌ Error initializing treasury address:', error);
      throw error;
    }
  }

  /**
   * Start monitoring for incoming transactions
   */
  async startMonitoring(intervalMs: number = 30000): Promise<void> {
    if (this.isMonitoring) {
      console.log('⚠️ Monitoring already active');
      return;
    }

    await this.initializeTreasuryAddress();

    if (!this.treasuryWalletAddress) {
      throw new Error('Treasury wallet address not found');
    }

    this.isMonitoring = true;
    console.log(`🚀 Starting Solana transaction monitoring (every ${intervalMs / 1000}s)`);

    // Initial check
    await this.checkForNewTransactions();

    // Set up periodic checking
    this.monitoringInterval = setInterval(async () => {
      await this.checkForNewTransactions();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('🛑 Solana transaction monitoring stopped');
  }

  /**
   * Check for new transactions to treasury wallet
   */
  private async checkForNewTransactions(): Promise<void> {
    if (!this.treasuryWalletAddress) {
      console.warn('⚠️ Cannot check transactions: No treasury wallet address');
      return;
    }

    try {
      const publicKey = new PublicKey(this.treasuryWalletAddress);
      
      // Get recent transaction signatures
      const signatures = await this.connection.getSignaturesForAddress(publicKey, {
        limit: 10
      });

      if (signatures.length === 0) {
        console.log('📭 No transactions found');
        return;
      }

      // Process only new transactions (ones we haven't seen before)
      const newSignatures = this.lastCheckedSignature
        ? signatures.filter(sig => sig.signature !== this.lastCheckedSignature).slice(0, signatures.findIndex(sig => sig.signature === this.lastCheckedSignature))
        : [signatures[0]]; // On first run, only check the most recent

      if (newSignatures.length > 0) {
        console.log(`📨 Found ${newSignatures.length} new transaction(s) to check`);
        
        for (const sigInfo of newSignatures.reverse()) { // Process oldest first
          await this.processTransaction(sigInfo.signature);
        }

        // Update last checked signature
        this.lastCheckedSignature = signatures[0].signature;
      }
    } catch (error) {
      console.error('Error checking transactions:', error);
    }
  }

  /**
   * Process a single transaction and auto-record if it's a JCMOVES deposit
   */
  private async processTransaction(signature: string): Promise<void> {
    try {
      const transaction = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });

      if (!transaction || !transaction.meta || transaction.meta.err) {
        console.log(`⏭️  Skipping transaction ${signature.slice(0, 8)}... (failed or null)`);
        return;
      }

      // Check if this is a token transfer
      const tokenTransfer = this.findJCMOVESTransfer(transaction, this.treasuryWalletAddress!);

      if (tokenTransfer) {
        const { amount, fromAddress } = tokenTransfer;
        
        console.log(`✅ Detected JCMOVES deposit: ${amount} tokens from ${fromAddress.slice(0, 8)}...`);
        console.log(`   Transaction: ${signature}`);

        // Check if we've already recorded this transaction
        const existingDeposit = await this.checkIfAlreadyRecorded(signature);
        
        if (existingDeposit) {
          console.log(`   ⏭️  Already recorded, skipping`);
          return;
        }

        // Auto-record the deposit
        await this.autoRecordDeposit(amount, signature, fromAddress);
      } else {
        console.log(`⏭️  Transaction ${signature.slice(0, 8)}... is not a JCMOVES deposit`);
      }
    } catch (error) {
      console.error(`Error processing transaction ${signature}:`, error);
    }
  }

  /**
   * Find JCMOVES token transfer in transaction
   */
  private findJCMOVESTransfer(
    transaction: ParsedTransactionWithMeta,
    treasuryAddress: string
  ): { amount: number; fromAddress: string } | null {
    if (!transaction.meta?.postTokenBalances || !transaction.meta?.preTokenBalances) {
      return null;
    }

    // Look for token balance changes to treasury wallet
    for (const postBalance of transaction.meta.postTokenBalances) {
      if (postBalance.mint !== this.jcmovesTokenAddress) continue;

      const preBalance = transaction.meta.preTokenBalances.find(
        pre => pre.accountIndex === postBalance.accountIndex
      );

      const postAmount = postBalance.uiTokenAmount.uiAmount || 0;
      const preAmount = preBalance?.uiTokenAmount.uiAmount || 0;
      const change = postAmount - preAmount;

      // If treasury received tokens (positive change)
      if (change > 0 && postBalance.owner === treasuryAddress) {
        // Find the sender
        const fromAddress = transaction.transaction.message.accountKeys[0].pubkey.toString();
        
        return {
          amount: change,
          fromAddress
        };
      }
    }

    return null;
  }

  /**
   * Check if transaction is already recorded in database
   */
  private async checkIfAlreadyRecorded(transactionHash: string): Promise<boolean> {
    try {
      const deposits = await storage.getFundingDeposits();
      return deposits.some(d => d.externalTransactionId === transactionHash);
    } catch (error) {
      console.error('Error checking for existing deposit:', error);
      return false;
    }
  }

  /**
   * Automatically record a detected deposit
   * Returns true if deposit was successfully recorded, false otherwise
   */
  private async autoRecordDeposit(
    tokenAmount: number,
    transactionHash: string,
    fromAddress: string
  ): Promise<boolean> {
    try {
      // Get admin user for system deposits (required by foreign key constraint)
      const allUsers = await storage.getAllUsers();
      const adminUser = allUsers.find(u => u.role === 'admin');
      
      if (!adminUser) {
        console.error('❌ No admin user found - cannot record deposit without valid depositedBy user ID');
        return false;
      }

      // Get current token price
      const tokenPrice = await moonshotService.getTokenPrice();
      const usdValue = tokenAmount * tokenPrice;

      // Use treasury service to record deposit
      const result = await treasuryService.depositTokensFromMoonshot(
        adminUser.id, // Use admin user ID (required by database foreign key)
        tokenAmount,
        transactionHash,
        fromAddress,
        `Auto-detected blockchain deposit from ${fromAddress.slice(0, 8)}...`
      );

      if (result.success && result.deposit) {
        console.log(`💰 Auto-recorded deposit: ${tokenAmount.toLocaleString()} JCMOVES ($${usdValue.toFixed(2)})`);
        console.log(`   Deposit ID: ${result.deposit.id}`);
        return true;
      } else {
        console.error(`❌ Failed to auto-record deposit: ${result.error}`);
        return false;
      }
    } catch (error) {
      console.error('Error auto-recording deposit:', error);
      return false;
    }
  }

  /**
   * Scan historical transactions (for finding missed deposits)
   */
  async scanHistoricalTransactions(limit: number = 50): Promise<{
    success: boolean;
    scanned: number;
    found: number;
    recorded: number;
    transactions: Array<{ signature: string; amount: number; status: string }>;
  }> {
    await this.initializeTreasuryAddress();
    
    if (!this.treasuryWalletAddress) {
      throw new Error('Treasury wallet address not found');
    }

    console.log(`🔍 Scanning last ${limit} transactions for treasury wallet...`);
    
    const publicKey = new PublicKey(this.treasuryWalletAddress);
    const signatures = await this.connection.getSignaturesForAddress(publicKey, {
      limit
    });

    const results: Array<{ signature: string; amount: number; status: string }> = [];
    let found = 0;
    let recorded = 0;

    for (const sigInfo of signatures) {
      try {
        const transaction = await this.connection.getParsedTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0
        });

        if (!transaction || !transaction.meta || transaction.meta.err) {
          continue;
        }

        const tokenTransfer = this.findJCMOVESTransfer(transaction, this.treasuryWalletAddress);

        if (tokenTransfer) {
          found++;
          const { amount, fromAddress } = tokenTransfer;
          
          // Check if already recorded
          const alreadyRecorded = await this.checkIfAlreadyRecorded(sigInfo.signature);
          
          if (alreadyRecorded) {
            results.push({ signature: sigInfo.signature, amount, status: 'already_recorded' });
          } else {
            // Auto-record the deposit
            const success = await this.autoRecordDeposit(amount, sigInfo.signature, fromAddress);
            if (success) {
              recorded++;
              results.push({ signature: sigInfo.signature, amount, status: 'newly_recorded' });
            } else {
              results.push({ signature: sigInfo.signature, amount, status: 'failed_to_record' });
            }
          }
        }
      } catch (error) {
        console.error(`Error processing transaction ${sigInfo.signature}:`, error);
      }
    }

    console.log(`✅ Scan complete: Scanned ${signatures.length}, Found ${found} JCMOVES deposits, Recorded ${recorded} new deposits`);

    return {
      success: true,
      scanned: signatures.length,
      found,
      recorded,
      transactions: results
    };
  }

  /**
   * Get live JCMOVES token balance from Solana blockchain
   */
  async getLiveTokenBalance(): Promise<{
    success: boolean;
    balance: number;
    walletAddress: string;
    error?: string;
  }> {
    try {
      await this.initializeTreasuryAddress();
      
      if (!this.treasuryWalletAddress) {
        return {
          success: false,
          balance: 0,
          walletAddress: '',
          error: 'Treasury wallet address not found'
        };
      }

      const publicKey = new PublicKey(this.treasuryWalletAddress);
      const tokenMint = new PublicKey(this.jcmovesTokenAddress);

      // Get all token accounts for this wallet
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(publicKey, {
        mint: tokenMint
      });

      if (tokenAccounts.value.length === 0) {
        return {
          success: true,
          balance: 0,
          walletAddress: this.treasuryWalletAddress
        };
      }

      // Get the balance from the first token account
      const accountInfo = tokenAccounts.value[0].account.data.parsed.info;
      const balance = parseFloat(accountInfo.tokenAmount.uiAmount || '0');

      console.log(`💰 Live blockchain balance: ${balance.toLocaleString()} JCMOVES`);

      return {
        success: true,
        balance,
        walletAddress: this.treasuryWalletAddress
      };
    } catch (error) {
      console.error('Error fetching live token balance:', error);
      return {
        success: false,
        balance: 0,
        walletAddress: this.treasuryWalletAddress || '',
        error: error instanceof Error ? error.message : 'Failed to fetch balance'
      };
    }
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      treasuryWallet: this.treasuryWalletAddress,
      lastCheckedSignature: this.lastCheckedSignature,
      jcmovesTokenAddress: this.jcmovesTokenAddress
    };
  }
}

// Singleton instance
export const solanaMonitor = new SolanaMonitor();
