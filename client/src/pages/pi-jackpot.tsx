import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Coins, Zap, Shield, Users } from "lucide-react";

export default function PiJackpot() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-violet-800 to-indigo-900">
      {/* Header */}
      <header className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 flex items-center justify-center">
            <Coins className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Pi Lottery Jackpot</h1>
            <p className="text-purple-200 text-sm">Powered by JC ON THE MOVE</p>
          </div>
        </div>
        <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/50">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Testnet
        </Badge>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-6 py-12">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-purple-500/20 border border-purple-400/30 rounded-full px-4 py-2 mb-6">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-purple-200 text-sm">Pi Network Integration</span>
          </div>
          
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Win Big with
            <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent"> Pi</span>
          </h2>
          
          <p className="text-xl text-purple-200 max-w-2xl mx-auto mb-8">
            The first lottery system powered by Pi Network. Use your Pi tokens for a chance to win amazing prizes.
          </p>

          <Card className="max-w-lg mx-auto bg-white/10 border-purple-400/30 backdrop-blur-lg">
            <CardHeader>
              <CardTitle className="text-white flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-yellow-400" />
                Integration In Progress
              </CardTitle>
              <CardDescription className="text-purple-200">
                Pi SDK Testnet Build
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-purple-100 mb-4">
                We're currently integrating the Pi JavaScript SDK to enable seamless Pi payments and authentication.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Badge className="bg-green-500/20 text-green-300 border-green-500/50">
                  <Shield className="w-3 h-3 mr-1" />
                  Secure
                </Badge>
                <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/50">
                  <Users className="w-3 h-3 mr-1" />
                  Community Driven
                </Badge>
                <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/50">
                  <Coins className="w-3 h-3 mr-1" />
                  Pi Powered
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <Card className="bg-white/5 border-purple-400/20 backdrop-blur">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-yellow-400 to-orange-500 flex items-center justify-center mb-3">
                <Coins className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-white">Pi Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-purple-200">
                Buy lottery tickets using your Pi tokens directly from your Pi wallet.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-purple-400/20 backdrop-blur">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-green-400 to-emerald-500 flex items-center justify-center mb-3">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-white">Transparent & Fair</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-purple-200">
                Verifiable random number generation ensures every draw is completely fair.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-purple-400/20 backdrop-blur">
            <CardHeader>
              <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-blue-400 to-cyan-500 flex items-center justify-center mb-3">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <CardTitle className="text-white">Instant Wins</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-purple-200">
                Winnings are automatically sent to your Pi wallet - no delays, no hassle.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 pt-8 border-t border-purple-400/20">
          <p className="text-purple-300 text-sm">
            Part of the <a href="/" className="text-yellow-400 hover:underline">JC ON THE MOVE</a> ecosystem
          </p>
          <p className="text-purple-400 text-xs mt-2">
            JCMOVES → Pi App → Real Business → Loyalty + Rewards
          </p>
        </div>
      </main>
    </div>
  );
}
