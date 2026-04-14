import { ShieldCheck } from "lucide-react";

export default function WalletNotice() {
  return (
    <div className="flex items-start gap-3 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-4 py-3 mb-5">
      <ShieldCheck className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
        <span className="font-semibold text-zinc-700 dark:text-zinc-300">JCMOVES are earned for service activity.</span>{" "}
        Connecting a wallet is optional — JC ON THE MOVE never holds your keys or seed phrases.
      </p>
    </div>
  );
}
