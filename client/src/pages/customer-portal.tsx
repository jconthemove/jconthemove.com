import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Package, Wallet, User, Coins, ShoppingBag, Gift, Users, CheckCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

interface ShopItem {
  id: string;
  title: string;
  description?: string;
  price: string;
  photos: string[];
  status: string;
}

export default function CustomerPortal() {
  const [activeTab, setActiveTab] = useState("shop");

  const { data: shopItems = [] } = useQuery<ShopItem[]>({
    queryKey: ["/api/shop"],
  });

  const activeShopItems = shopItems.filter(item => item.status === 'active');

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">My Portal</h1>
          <p className="text-muted-foreground">Welcome to your customer dashboard</p>
        </div>

        {/* Tabbed Interface */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="shop" data-testid="tab-shop">
              <ShoppingBag className="h-4 w-4 mr-2" />
              Shop
            </TabsTrigger>
            <TabsTrigger value="mining" data-testid="tab-mining">
              <Coins className="h-4 w-4 mr-2" />
              Mining
            </TabsTrigger>
            <TabsTrigger value="wallet" data-testid="tab-wallet">
              <Wallet className="h-4 w-4 mr-2" />
              Wallet
            </TabsTrigger>
            <TabsTrigger value="profile" data-testid="tab-profile">
              <User className="h-4 w-4 mr-2" />
              Profile
            </TabsTrigger>
          </TabsList>

          <TabsContent value="shop" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" />
                  Shop Marketplace
                </CardTitle>
                <CardDescription>Browse items available for purchase</CardDescription>
              </CardHeader>
              <CardContent>
                {activeShopItems.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">No items available at the moment</p>
                    <p className="text-sm text-muted-foreground">Check back soon for new listings!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeShopItems.map((item) => (
                      <Link href={`/shop/${item.id}`} key={item.id}>
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                          {item.photos.length > 0 && (
                            <div className="aspect-square overflow-hidden rounded-t-lg">
                              <img
                                src={item.photos[0]}
                                alt={item.title}
                                className="w-full h-full object-cover hover:scale-105 transition-transform"
                              />
                            </div>
                          )}
                          <CardContent className="p-4">
                            <h4 className="font-semibold mb-1 line-clamp-1">{item.title}</h4>
                            {item.description && (
                              <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{item.description}</p>
                            )}
                            <p className="text-lg text-primary font-bold">${item.price}</p>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
                {activeShopItems.length > 0 && (
                  <div className="mt-6 text-center">
                    <Link href="/shop">
                      <Button variant="outline" size="lg" data-testid="button-view-all-shop">
                        View All Items
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mining" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Coins className="h-5 w-5" />
                  Mining & Rewards
                </CardTitle>
                <CardDescription>Earn JCMOVES tokens through daily check-ins and actions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center py-4">
                  <Link href="/rewards">
                    <Button size="lg" data-testid="button-go-to-mining">
                      <Coins className="h-5 w-5 mr-2" />
                      Go to Mining Dashboard
                    </Button>
                  </Link>
                </div>
                
                <div className="border-t pt-6">
                  <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Gift className="h-5 w-5 text-primary" />
                    Ways to Earn JCMOVES
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">1 JCMOVES = $0.01</p>
                  
                  <div className="grid gap-4">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                      <div>
                        <p className="font-medium">Daily Mining Check-in</p>
                        <p className="text-sm text-muted-foreground">Earn tokens daily with streak bonuses</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                      <div>
                        <p className="font-medium">Book a Service</p>
                        <p className="text-sm text-muted-foreground">Earn <span className="font-semibold text-primary">1,500 JCMOVES ($15)</span> when your job completes</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <Users className="h-5 w-5 text-blue-500 mt-0.5" />
                      <div>
                        <p className="font-medium">Refer Friends</p>
                        <p className="text-sm text-muted-foreground">
                          Earn <span className="font-semibold text-primary">50 JCMOVES ($0.50)</span> when someone uses your code
                          <br />
                          Plus <span className="font-semibold text-primary">2,500 JCMOVES ($25)</span> when their first job completes!
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="wallet" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  My Wallet
                </CardTitle>
                <CardDescription>View your token balance and transactions</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-8">
                <Link href="/profile">
                  <Button size="lg" data-testid="button-go-to-wallet">
                    <Wallet className="h-5 w-5 mr-2" />
                    Go to Wallet & Profile
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  My Profile
                </CardTitle>
                <CardDescription>Manage your account settings and information</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-8">
                <Link href="/profile">
                  <Button size="lg" data-testid="button-go-to-profile">
                    <User className="h-5 w-5 mr-2" />
                    Go to Profile Settings
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
