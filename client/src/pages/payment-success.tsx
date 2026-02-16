import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { CheckCircle, ShoppingBag, ArrowLeft } from "lucide-react";

export default function PaymentSuccessPage() {
  const params = new URLSearchParams(window.location.search);
  const itemId = params.get("itemId");

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-400 via-purple-300 to-gray-500 flex items-center justify-center p-4">
      <Card className="max-w-md w-full shadow-2xl">
        <CardContent className="pt-8 pb-6 px-6 text-center space-y-5">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="h-12 w-12 text-green-500" />
          </div>

          <div>
            <h1 className="text-2xl font-serif font-bold text-stone-800">Payment Successful!</h1>
            <p className="text-stone-500 mt-2">
              Thank you for your purchase from Nature Made Jewls. You'll receive a confirmation from Square shortly.
            </p>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <p className="text-sm text-purple-700 font-medium">
              Your handcrafted jewelry will be prepared with care. We'll reach out about shipping details.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <Link href="/nature-made-jewls">
              <Button className="w-full bg-purple-600 hover:bg-purple-700 py-5">
                <ShoppingBag className="h-5 w-5 mr-2" />
                Continue Shopping
              </Button>
            </Link>
            <Link href="/">
              <Button variant="outline" className="w-full py-5">
                <ArrowLeft className="h-5 w-5 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>

          <p className="text-xs text-stone-400">
            Questions? Contact us at upmichiganstatemovers@gmail.com or call 906-285-9312
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
