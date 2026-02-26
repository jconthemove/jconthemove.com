import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, Truck, Star, Zap, Gift, CheckCircle } from "lucide-react";

interface WelcomeModalProps {
  open: boolean;
  onClose: () => void;
  firstName?: string;
  bonus?: number;
}

export function WelcomeModal({ open, onClose, firstName, bonus = 250 }: WelcomeModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-blue-500/30 text-white p-0 overflow-hidden">
        {/* Header glow */}
        <div className="relative bg-gradient-to-r from-blue-600/30 via-purple-600/30 to-green-600/30 px-6 pt-8 pb-6 text-center">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10 to-transparent pointer-events-none" />
          <div className="relative flex justify-center mb-3">
            <div className="p-4 rounded-full bg-gradient-to-br from-yellow-400/20 to-orange-500/20 border border-yellow-400/40">
              <Coins className="h-10 w-10 text-yellow-400" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-white mb-1">
            Welcome{firstName ? `, ${firstName}` : ""}!
          </h2>
          <p className="text-slate-300 text-sm">You just joined JC ON THE MOVE</p>
        </div>

        {/* Bonus badge */}
        <div className="px-6 py-4 text-center border-b border-slate-700/50">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/40 rounded-full px-5 py-2">
            <Gift className="h-4 w-4 text-green-400" />
            <span className="font-black text-green-300 text-lg">+{bonus.toLocaleString()} JCMOVES</span>
            <span className="text-slate-400 text-sm">credited!</span>
          </div>
          <p className="text-slate-400 text-xs mt-2">Your welcome bonus is already in your wallet.</p>
        </div>

        {/* About JCMOVES */}
        <div className="px-6 py-4 space-y-3">
          <h3 className="font-bold text-slate-200 text-sm uppercase tracking-wide">What is JCMOVES?</h3>
          <p className="text-slate-300 text-sm leading-relaxed">
            JCMOVES is our loyalty token that rewards you for every interaction with JC ON THE MOVE.
            Earn tokens, stake them to grow your balance, and redeem them for discounts on future services.
          </p>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="text-center p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <Truck className="h-5 w-5 text-blue-400 mx-auto mb-1" />
              <p className="text-xs text-slate-300 font-medium">Helpful</p>
              <p className="text-xs text-slate-500">Expert movers ready for any job</p>
            </div>
            <div className="text-center p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <Star className="h-5 w-5 text-purple-400 mx-auto mb-1" />
              <p className="text-xs text-slate-300 font-medium">Reliable</p>
              <p className="text-xs text-slate-500">Show up on time, every time</p>
            </div>
            <div className="text-center p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <Zap className="h-5 w-5 text-green-400 mx-auto mb-1" />
              <p className="text-xs text-slate-300 font-medium">Affordable</p>
              <p className="text-xs text-slate-500">Fair prices, no surprises</p>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
              <span>Earn tokens daily just by logging in</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
              <span>Get 1,500 JCMOVES when your first job completes</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
              <span>Refer friends and earn 50–2,500 JCMOVES per referral</span>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          <Button
            onClick={onClose}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-3"
          >
            Let's Go! 🚀
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
