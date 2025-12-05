import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Heart, Building2, Handshake, Mail } from "lucide-react";
import { Link } from "wouter";

export default function SponsorsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <Link href="/">
          <Button variant="ghost" className="text-white hover:bg-white/10 mb-6" data-testid="button-back">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4" data-testid="heading-sponsors">
            Our Sponsors
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            We're grateful for the support of our amazing sponsors who help us serve the community better.
          </p>
        </div>

        {/* Become a Sponsor CTA */}
        <Card className="bg-gradient-to-br from-primary/20 to-blue-600/20 border-primary/30 mb-12">
          <CardContent className="p-8 text-center">
            <Handshake className="h-16 w-16 text-primary mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-3">Become a Sponsor</h2>
            <p className="text-slate-300 mb-6 max-w-xl mx-auto">
              Partner with JC ON THE MOVE and reach thousands of customers in our service area. 
              We offer various sponsorship packages to fit your business needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="mailto:upmichiganstatemovers@gmail.com?subject=Sponsorship%20Inquiry">
                <Button className="bg-primary hover:bg-primary/90 text-white px-8 py-3" data-testid="button-sponsor-email">
                  <Mail className="mr-2 h-5 w-5" />
                  Contact Us About Sponsorship
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Sponsorship Tiers */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-white text-center mb-8">Sponsorship Levels</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Bronze */}
            <Card className="bg-gradient-to-br from-orange-900/50 to-orange-800/30 border-orange-700/50">
              <CardContent className="p-6 text-center">
                <div className="bg-orange-600/20 p-4 rounded-full w-fit mx-auto mb-4">
                  <Heart className="h-10 w-10 text-orange-400" />
                </div>
                <h3 className="text-xl font-bold text-orange-300 mb-2">Bronze Sponsor</h3>
                <p className="text-slate-300 text-sm mb-4">
                  Logo on our website and social media shoutouts
                </p>
                <p className="text-2xl font-bold text-white">$100<span className="text-sm text-slate-400">/month</span></p>
              </CardContent>
            </Card>

            {/* Silver */}
            <Card className="bg-gradient-to-br from-slate-600/50 to-slate-500/30 border-slate-500/50">
              <CardContent className="p-6 text-center">
                <div className="bg-slate-400/20 p-4 rounded-full w-fit mx-auto mb-4">
                  <Building2 className="h-10 w-10 text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-200 mb-2">Silver Sponsor</h3>
                <p className="text-slate-300 text-sm mb-4">
                  All Bronze benefits plus truck decal placement
                </p>
                <p className="text-2xl font-bold text-white">$250<span className="text-sm text-slate-400">/month</span></p>
              </CardContent>
            </Card>

            {/* Gold */}
            <Card className="bg-gradient-to-br from-yellow-700/50 to-yellow-600/30 border-yellow-600/50 ring-2 ring-yellow-500/30">
              <CardContent className="p-6 text-center">
                <div className="bg-yellow-500/20 p-4 rounded-full w-fit mx-auto mb-4">
                  <Handshake className="h-10 w-10 text-yellow-400" />
                </div>
                <h3 className="text-xl font-bold text-yellow-300 mb-2">Gold Sponsor</h3>
                <p className="text-slate-300 text-sm mb-4">
                  All Silver benefits plus featured partner status
                </p>
                <p className="text-2xl font-bold text-white">$500<span className="text-sm text-slate-400">/month</span></p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Current Sponsors Section */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-6">Current Sponsors</h2>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-12">
              <p className="text-slate-400 text-lg">
                Be the first to sponsor JC ON THE MOVE!
              </p>
              <p className="text-slate-500 mt-2">
                Your logo could be featured here.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Contact */}
        <div className="mt-12 text-center text-slate-300">
          <p className="mb-2">Questions about sponsorship?</p>
          <a href="tel:(906) 285-9312" className="text-xl font-bold text-primary hover:text-primary/80 transition-colors">
            Call (906) 285-9312
          </a>
        </div>
      </div>
    </div>
  );
}
