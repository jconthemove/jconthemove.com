import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const TREASURY_ADDRESS = "34e5eAwb6Eh6zgyARSrk7RX1bkK2rVX5bazCHYXKtRM7";
const MOONSHOT_TOKEN = process.env.MOONSHOT_TOKEN_ADDRESS || "";

async function checkWalletBalance() {
  console.log("\n🔍 CHECKING TREASURY WALLET BALANCE");
  console.log("=".repeat(80));
  console.log(`\n📍 Wallet Address: ${TREASURY_ADDRESS}`);
  
  try {
    // Connect to Solana mainnet
    const rpcUrl = process.env.VITE_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    
    console.log(`\n🌐 Connected to: ${rpcUrl}`);
    
    // Check SOL balance
    const publicKey = new PublicKey(TREASURY_ADDRESS);
    const balance = await connection.getBalance(publicKey);
    const solBalance = balance / LAMPORTS_PER_SOL;
    
    console.log(`\n💰 SOL Balance: ${solBalance.toFixed(4)} SOL`);
    
    // Check token accounts
    console.log(`\n🪙 Checking for token accounts...`);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
    });
    
    console.log(`\n📊 Found ${tokenAccounts.value.length} token account(s):`);
    console.log("=".repeat(80));
    
    if (tokenAccounts.value.length === 0) {
      console.log("\n⚠️  No token accounts found in this wallet.");
      console.log("This wallet has never held any SPL tokens.");
    }
    
    for (const { account, pubkey } of tokenAccounts.value) {
      const parsedInfo = account.data.parsed.info;
      const mintAddress = parsedInfo.mint;
      const tokenAmount = parsedInfo.tokenAmount;
      const decimals = tokenAmount.decimals;
      const balance = tokenAmount.uiAmount;
      
      console.log(`\n🎫 Token Account: ${pubkey.toBase58()}`);
      console.log(`   Mint Address: ${mintAddress}`);
      console.log(`   Balance: ${balance?.toLocaleString() || '0'} tokens`);
      console.log(`   Decimals: ${decimals}`);
      
      if (MOONSHOT_TOKEN && mintAddress === MOONSHOT_TOKEN) {
        console.log(`   ⭐ THIS IS YOUR JCMOVES TOKEN!`);
      }
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("\n🔗 View on Solscan:");
    console.log(`   https://solscan.io/account/${TREASURY_ADDRESS}\n`);
    
  } catch (error: any) {
    console.error("\n❌ Error checking wallet balance:");
    console.error(error.message);
  }
}

checkWalletBalance();
