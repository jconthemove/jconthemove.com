import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { treasuryKeyManager } from './solana-transfer';

const JUPITER_API_BASE = 'https://quote-api.jup.ag/v6';

export const SUPPORTED_TOKENS = {
  JCMOVES: process.env.MOONSHOT_TOKEN_ADDRESS || 'BHZW4jds7NSe5Fqvw9Z4pvt423EJSx63k8MT11F2moon',
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
} as const;

export const TOKEN_DECIMALS: Record<string, number> = {
  [SUPPORTED_TOKENS.JCMOVES]: 9,
  [SUPPORTED_TOKENS.SOL]: 9,
  [SUPPORTED_TOKENS.USDC]: 6,
  [SUPPORTED_TOKENS.USDT]: 6,
};

export const TOKEN_SYMBOLS: Record<string, string> = {
  [SUPPORTED_TOKENS.JCMOVES]: 'JCMOVES',
  [SUPPORTED_TOKENS.SOL]: 'SOL',
  [SUPPORTED_TOKENS.USDC]: 'USDC',
  [SUPPORTED_TOKENS.USDT]: 'USDT',
};

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  inputSymbol: string;
  outputSymbol: string;
  priceImpactPct: number;
  slippageBps: number;
  routePlan: any[];
  otherAmountThreshold: string;
  estimatedFeeInSol: number;
}

export interface SwapResult {
  success: boolean;
  transactionHash?: string;
  inputAmount?: string;
  outputAmount?: string;
  inputSymbol?: string;
  outputSymbol?: string;
  error?: string;
}

class JupiterSwapService {
  private connection: Connection;

  constructor() {
    const envRpcUrl = process.env.VITE_SOLANA_RPC_URL?.trim();
    const isValidUrl = envRpcUrl && (envRpcUrl.startsWith('http://') || envRpcUrl.startsWith('https://'));
    const rpcUrl = isValidUrl ? envRpcUrl : 'https://api.mainnet-beta.solana.com';
    
    this.connection = new Connection(rpcUrl, 'confirmed');
    console.log('🔄 JupiterSwapService initialized');
  }

  async getSwapQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 50
  ): Promise<SwapQuote | null> {
    try {
      if (!amount || amount <= 0 || isNaN(amount)) {
        console.error('Invalid swap amount:', amount);
        return null;
      }

      const inputDecimals = TOKEN_DECIMALS[inputMint] || 9;
      const amountInSmallestUnit = BigInt(Math.round(amount * Math.pow(10, inputDecimals)));

      if (amountInSmallestUnit <= BigInt(0)) {
        console.error('Amount too small for swap');
        return null;
      }

      const url = `${JUPITER_API_BASE}/quote?` +
        `inputMint=${inputMint}&` +
        `outputMint=${outputMint}&` +
        `amount=${amountInSmallestUnit.toString()}&` +
        `slippageBps=${slippageBps}`;

      console.log(`📊 Fetching Jupiter quote: ${TOKEN_SYMBOLS[inputMint] || 'Unknown'} -> ${TOKEN_SYMBOLS[outputMint] || 'Unknown'}`);
      console.log(`   Amount: ${amount} (${amountInSmallestUnit.toString()} base units)`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Jupiter API error:', errorText);
        return null;
      }

      const quoteResponse = await response.json();

      if (!quoteResponse || !quoteResponse.outAmount) {
        console.error('Invalid quote response:', quoteResponse);
        return null;
      }

      const outputDecimals = TOKEN_DECIMALS[outputMint] || 9;
      const outputAmount = parseInt(quoteResponse.outAmount) / Math.pow(10, outputDecimals);

      return {
        inputMint,
        outputMint,
        inputAmount: amount.toString(),
        outputAmount: outputAmount.toFixed(outputDecimals),
        inputSymbol: TOKEN_SYMBOLS[inputMint] || 'Unknown',
        outputSymbol: TOKEN_SYMBOLS[outputMint] || 'Unknown',
        priceImpactPct: parseFloat(quoteResponse.priceImpactPct || '0'),
        slippageBps,
        routePlan: quoteResponse.routePlan || [],
        otherAmountThreshold: quoteResponse.otherAmountThreshold || '0',
        estimatedFeeInSol: 0.000005,
      };
    } catch (error) {
      console.error('Error getting swap quote:', error);
      return null;
    }
  }

  async executeSwap(
    inputMint: string,
    outputMint: string,
    amount: number,
    userWalletAddress: string,
    slippageBps: number = 50
  ): Promise<SwapResult> {
    try {
      if (!amount || amount <= 0 || isNaN(amount)) {
        return {
          success: false,
          error: 'Invalid swap amount',
        };
      }

      const quote = await this.getSwapQuote(inputMint, outputMint, amount, slippageBps);
      
      if (!quote) {
        return {
          success: false,
          error: 'Failed to get swap quote from Jupiter',
        };
      }

      const inputDecimals = TOKEN_DECIMALS[inputMint] || 9;
      const amountInSmallestUnit = BigInt(Math.round(amount * Math.pow(10, inputDecimals)));

      const quoteUrl = `${JUPITER_API_BASE}/quote?` +
        `inputMint=${inputMint}&` +
        `outputMint=${outputMint}&` +
        `amount=${amountInSmallestUnit.toString()}&` +
        `slippageBps=${slippageBps}`;

      const quoteResponse = await fetch(quoteUrl).then(res => res.json());

      const swapResponse = await fetch(`${JUPITER_API_BASE}/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: userWalletAddress,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
        }),
      });

      if (!swapResponse.ok) {
        const errorText = await swapResponse.text();
        console.error('Jupiter swap API error:', errorText);
        return {
          success: false,
          error: 'Failed to create swap transaction',
        };
      }

      const swapData = await swapResponse.json();

      console.log(`✅ Swap transaction created for user ${userWalletAddress}`);
      console.log(`📤 ${quote.inputAmount} ${quote.inputSymbol} -> ${quote.outputAmount} ${quote.outputSymbol}`);

      return {
        success: true,
        transactionHash: 'pending_user_signature',
        inputAmount: quote.inputAmount,
        outputAmount: quote.outputAmount,
        inputSymbol: quote.inputSymbol,
        outputSymbol: quote.outputSymbol,
      };

    } catch (error) {
      console.error('Error executing swap:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown swap error',
      };
    }
  }

  async getSwapTransaction(
    inputMint: string,
    outputMint: string,
    amount: number,
    userWalletAddress: string,
    slippageBps: number = 50
  ): Promise<{ transaction: string; quote: SwapQuote } | null> {
    try {
      if (!amount || amount <= 0 || isNaN(amount)) {
        console.error('Invalid swap amount:', amount);
        return null;
      }

      const inputDecimals = TOKEN_DECIMALS[inputMint] || 9;
      const amountInSmallestUnit = BigInt(Math.round(amount * Math.pow(10, inputDecimals)));

      if (amountInSmallestUnit <= BigInt(0)) {
        console.error('Amount too small for swap transaction');
        return null;
      }

      const quoteUrl = `${JUPITER_API_BASE}/quote?` +
        `inputMint=${inputMint}&` +
        `outputMint=${outputMint}&` +
        `amount=${amountInSmallestUnit.toString()}&` +
        `slippageBps=${slippageBps}`;

      const quoteResponse = await fetch(quoteUrl).then(res => res.json());

      if (!quoteResponse || quoteResponse.error) {
        console.error('Quote error:', quoteResponse?.error || 'Unknown error');
        return null;
      }

      const swapResponse = await fetch(`${JUPITER_API_BASE}/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: userWalletAddress,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
        }),
      });

      if (!swapResponse.ok) {
        return null;
      }

      const swapData = await swapResponse.json();

      const outputDecimals = TOKEN_DECIMALS[outputMint] || 9;
      const outputAmount = parseInt(quoteResponse.outAmount) / Math.pow(10, outputDecimals);

      const quote: SwapQuote = {
        inputMint,
        outputMint,
        inputAmount: amount.toString(),
        outputAmount: outputAmount.toFixed(outputDecimals),
        inputSymbol: TOKEN_SYMBOLS[inputMint] || 'Unknown',
        outputSymbol: TOKEN_SYMBOLS[outputMint] || 'Unknown',
        priceImpactPct: parseFloat(quoteResponse.priceImpactPct || '0'),
        slippageBps,
        routePlan: quoteResponse.routePlan || [],
        otherAmountThreshold: quoteResponse.otherAmountThreshold || '0',
        estimatedFeeInSol: 0.000005,
      };

      return {
        transaction: swapData.swapTransaction,
        quote,
      };

    } catch (error) {
      console.error('Error getting swap transaction:', error);
      return null;
    }
  }

  getSupportedTokens() {
    return Object.entries(SUPPORTED_TOKENS).map(([symbol, address]) => ({
      symbol,
      address,
      decimals: TOKEN_DECIMALS[address] || 9,
    }));
  }

  async getTokenPrice(tokenMint: string): Promise<number | null> {
    try {
      const quote = await this.getSwapQuote(tokenMint, SUPPORTED_TOKENS.USDC, 1, 50);
      if (quote) {
        return parseFloat(quote.outputAmount);
      }
      return null;
    } catch (error) {
      console.error('Error getting token price:', error);
      return null;
    }
  }
}

export const jupiterSwapService = new JupiterSwapService();
