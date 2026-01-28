import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Gem, Leaf, Heart, Sparkles, Mail, Phone } from "lucide-react";

export default function NatureMadeJewls() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 via-emerald-900 to-stone-900">
      <header className="p-6">
        <Link href="/">
          <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to JC ON THE MOVE
          </Button>
        </Link>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-3 mb-6">
            <Leaf className="w-10 h-10 text-emerald-400" />
            <Gem className="w-12 h-12 text-amber-400" />
            <Leaf className="w-10 h-10 text-emerald-400 transform scale-x-[-1]" />
          </div>
          
          <h1 className="text-5xl md:text-7xl font-serif font-bold text-white mb-4">
            Nature Made Jewls
          </h1>
          
          <p className="text-xl text-emerald-200 max-w-2xl mx-auto mb-8">
            Handcrafted jewelry inspired by the beauty of nature. Each piece is uniquely designed with love and natural elements.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            <a href="mailto:upmichiganstatemovers@gmail.com">
              <Button className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white px-8 py-6 text-lg">
                <Mail className="mr-2 h-5 w-5" />
                Contact Us
              </Button>
            </a>
            <a href="tel:906-285-9312">
              <Button variant="outline" className="border-emerald-400 text-emerald-300 hover:bg-emerald-400/10 px-8 py-6 text-lg">
                <Phone className="mr-2 h-5 w-5" />
                Call Now
              </Button>
            </a>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-16">
          <Card className="bg-white/5 border-emerald-500/20 backdrop-blur">
            <CardContent className="pt-8 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 flex items-center justify-center mb-4">
                <Leaf className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Natural Materials</h3>
              <p className="text-emerald-200">
                Featuring genuine stones, crystals, wood, and natural elements from Michigan's Upper Peninsula.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-emerald-500/20 backdrop-blur">
            <CardContent className="pt-8 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center mb-4">
                <Heart className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Handcrafted with Love</h3>
              <p className="text-emerald-200">
                Every piece is carefully handmade, making each item one-of-a-kind and special.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-emerald-500/20 backdrop-blur">
            <CardContent className="pt-8 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-r from-purple-400 to-pink-500 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Unique Designs</h3>
              <p className="text-emerald-200">
                Original designs that celebrate the beauty of nature and bring joy to those who wear them.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="text-center mb-16">
          <h2 className="text-3xl font-serif font-bold text-white mb-6">Our Collections</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              { name: "Earrings", icon: "✨" },
              { name: "Necklaces", icon: "💎" },
              { name: "Bracelets", icon: "🌿" },
              { name: "Rings", icon: "💍" },
            ].map((item) => (
              <div 
                key={item.name}
                className="p-6 rounded-xl bg-gradient-to-br from-emerald-800/50 to-stone-800/50 border border-emerald-500/30 hover:border-amber-400/50 transition-colors cursor-pointer"
              >
                <span className="text-4xl mb-3 block">{item.icon}</span>
                <h3 className="text-lg font-medium text-white">{item.name}</h3>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-2xl mx-auto text-center p-8 rounded-2xl bg-gradient-to-r from-amber-500/10 to-emerald-500/10 border border-amber-500/30">
          <Gem className="w-12 h-12 mx-auto text-amber-400 mb-4" />
          <h2 className="text-2xl font-serif font-bold text-white mb-4">Custom Orders Welcome</h2>
          <p className="text-emerald-200 mb-6">
            Looking for something special? We create custom pieces tailored to your vision. Contact us to discuss your dream jewelry piece.
          </p>
          <a href="mailto:upmichiganstatemovers@gmail.com?subject=Custom Jewelry Inquiry">
            <Button className="bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700">
              Request Custom Order
            </Button>
          </a>
        </div>

        <footer className="text-center mt-16 pt-8 border-t border-emerald-500/20">
          <p className="text-emerald-300 mb-2">Nature Made Jewls</p>
          <p className="text-emerald-400/60 text-sm">
            Part of the <Link href="/"><span className="text-amber-400 hover:underline cursor-pointer">JC ON THE MOVE</span></Link> family
          </p>
          <p className="text-emerald-400/60 text-sm mt-2">
            Upper Peninsula, Michigan
          </p>
        </footer>
      </main>
    </div>
  );
}
