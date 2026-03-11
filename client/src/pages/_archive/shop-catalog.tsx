import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { type ShopItem, type JewelryItem } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ChevronLeft, ChevronRight, Eye, Gem, ArrowRight, Package, Gift, Coins, Tag } from "lucide-react";

function ShopItemCard({ item }: { item: ShopItem }) {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const photos = item.photos as string[];

  const handlePrevPhoto = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentPhotoIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  };

  const handleNextPhoto = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentPhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  };

  const itemTypeBadge = () => {
    if (item.itemType === 'gift_card') return { label: '🎁 Gift Card', cls: 'bg-purple-600 text-white' };
    if (item.itemType === 'moving_supplies') return { label: '📦 Moving Supply', cls: 'bg-blue-600 text-white' };
    if (item.itemType === 'official') return { label: '⭐ Official', cls: 'bg-orange-600 text-white' };
    return null;
  };

  const badge = itemTypeBadge();

  return (
    <Link href={`/shop/${item.id}`}>
    <Card className="overflow-hidden transition-all cursor-pointer border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-900/20 hover:scale-[1.02] group h-full flex flex-col" data-testid={`card-shop-item-${item.id}`}>
      <CardHeader className="p-0">
        <div className="relative bg-slate-900 aspect-square overflow-hidden">
          {photos && photos.length > 0 ? (
            <>
              <img
                src={photos[currentPhotoIndex]}
                alt={item.title}
                className="w-full h-full object-cover group-hover:brightness-110 transition-all"
                data-testid={`img-shop-item-${item.id}-${currentPhotoIndex}`}
              />

              {photos.length > 1 && (
                <>
                  <button onClick={handlePrevPhoto} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition-colors border border-white/20" data-testid={`button-prev-photo-${item.id}`}>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button onClick={handleNextPhoto} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition-colors border border-white/20" data-testid={`button-next-photo-${item.id}`}>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                    {photos.map((_, index) => (
                      <div key={index} className={`h-1.5 rounded-full transition-all ${index === currentPhotoIndex ? "w-6 bg-orange-400" : "w-1.5 bg-white/50"}`} />
                    ))}
                  </div>
                </>
              )}

              {/* Type badge overlay */}
              {badge && (
                <div className="absolute top-2 left-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                </div>
              )}

              {item.status !== "active" && (
                <div className="absolute top-2 right-2">
                  <Badge className="capitalize bg-slate-800/80 text-slate-200 border border-slate-600">{item.status}</Badge>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500">No Image</div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 flex-1">
        <h3 className="font-semibold text-lg mb-1 truncate text-slate-100" data-testid={`text-title-${item.id}`}>{item.title}</h3>
        <p className="text-sm text-slate-400 mb-2 line-clamp-2" data-testid={`text-description-${item.id}`}>{item.description}</p>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-2xl font-bold text-orange-400" data-testid={`text-price-${item.id}`}>
              ${parseFloat(item.price).toFixed(2)}
            </span>
            {item.itemType === 'gift_card' && item.giftCardValue && (
              <span className="ml-2 text-sm text-purple-300 font-medium">(${parseFloat(item.giftCardValue).toFixed(2)} credit)</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-sm text-slate-500">
            <Eye className="h-4 w-4" />
            <span data-testid={`text-views-${item.id}`}>{item.views}</span>
          </div>
        </div>

        {/* JCMOVES indicators */}
        <div className="mt-2 flex flex-wrap gap-1">
          {item.jcmovesPrice && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-yellow-900/40 border border-yellow-700/40 text-yellow-300 px-2 py-0.5 rounded-full">
              <Coins className="h-3 w-3" />{parseFloat(item.jcmovesPrice).toLocaleString()} JCMOVES
            </span>
          )}
          {item.jcmovesDiscountPercent && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-green-900/40 border border-green-700/40 text-green-300 px-2 py-0.5 rounded-full">
              <Tag className="h-3 w-3" />{item.jcmovesDiscountPercent}% off w/ JCMOVES
            </span>
          )}
          {item.category && (
            <Badge variant="outline" className="text-xs border-slate-600 text-slate-300" data-testid={`badge-category-${item.id}`}>{item.category}</Badge>
          )}
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0">
        <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold" data-testid={`button-view-details-${item.id}`}>
          View Details
        </Button>
      </CardFooter>
    </Card>
    </Link>
  );
}

function FeaturedJewelryBanner() {
  const { data: jewelryItems } = useQuery<JewelryItem[]>({ queryKey: ["/api/jewelry"] });

  const featured = useMemo(() => {
    if (!jewelryItems || jewelryItems.length === 0) return null;
    const available = jewelryItems.filter((j) => j.status === "active" && j.inStock);
    if (available.length === 0) return null;
    const markedFeatured = available.filter((j) => j.featured);
    const pool = markedFeatured.length > 0 ? markedFeatured : available;
    return pool[Math.floor(Math.random() * pool.length)];
  }, [jewelryItems]);

  if (!featured) return null;
  const photos = featured.photos as string[];
  const imageUrl = photos && photos.length > 0 ? photos[0] : featured.imageUrl;

  return (
    <Link href={`/nature-made-jewls/${featured.id}`}>
      <div className="mb-6 rounded-xl overflow-hidden border border-purple-500/30 bg-gradient-to-r from-purple-900/40 via-slate-800/60 to-purple-900/40 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-500/10 transition-all cursor-pointer group">
        <div className="flex items-center gap-4 p-4">
          {imageUrl && (
            <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border border-purple-500/30">
              <img src={imageUrl} alt={featured.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Gem className="h-4 w-4 text-purple-400 flex-shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">Featured from Nature Made Jewls</span>
            </div>
            <h3 className="text-lg font-bold text-white truncate">{featured.title}</h3>
            {featured.shortDescription && <p className="text-sm text-slate-400 line-clamp-1">{featured.shortDescription}</p>}
            {featured.price && <span className="text-lg font-bold text-purple-300 mt-1 inline-block">${parseFloat(featured.price).toFixed(2)}</span>}
          </div>
          <div className="flex-shrink-0 hidden sm:flex items-center">
            <Button variant="outline" size="sm" className="border-purple-500/50 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200 gap-1">
              Shop Jewls <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </Link>
  );
}

const ITEM_TYPE_TABS = [
  { value: "all", label: "All Items" },
  { value: "moving_supplies", label: "📦 Moving Supplies" },
  { value: "gift_card", label: "🎁 Gift Cards" },
  { value: "community", label: "Community" },
];

export function ShopCatalogPage() {
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: items, isLoading } = useQuery<ShopItem[]>({
    queryKey: ["/api/shop", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") params.append("status", statusFilter);
      const url = `/api/shop${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch shop items");
      return response.json();
    },
  });

  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (typeFilter === "all") return items;
    return items.filter((i) => i.itemType === typeFilter);
  }, [items, typeFilter]);

  const giftCards = useMemo(() => items?.filter((i) => i.itemType === 'gift_card') ?? [], [items]);
  const movingSupplies = useMemo(() => items?.filter((i) => i.itemType === 'moving_supplies') ?? [], [items]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-20">
      <div className="container mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-orange-500/10 to-blue-600/20 blur-3xl -z-10"></div>
            <h1 className="text-4xl font-black bg-gradient-to-r from-blue-400 via-orange-400 to-blue-400 bg-clip-text text-transparent tracking-tight" data-testid="heading-shop">Shop</h1>
            <p className="text-slate-400 mt-1">Moving supplies, gift cards, and community finds</p>
          </div>
          <Link href="/shop/create">
            <Button className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/25" data-testid="button-post-item">
              <Plus className="h-4 w-4 mr-2" />
              Post Item
            </Button>
          </Link>
        </div>

        {/* JCMOVES Redemption Info Banner */}
        <div className="mb-6 rounded-xl border border-yellow-500/25 bg-gradient-to-r from-yellow-950/30 via-amber-950/20 to-yellow-950/30 p-4 flex items-start gap-3">
          <Coins className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-yellow-300">Spend JCMOVES in the Shop</p>
            <p className="text-xs text-yellow-200/70 mt-0.5">
              Use your JCMOVES tokens to buy items outright or unlock a percentage discount. Gift cards can be purchased with JCMOVES and redeemed toward any JC ON THE MOVE service.
            </p>
          </div>
        </div>

        {/* Category tabs */}
        <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-1">
          {ITEM_TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setTypeFilter(tab.value)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                typeFilter === tab.value
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-auto flex-shrink-0">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] bg-slate-800/50 border-slate-600 text-slate-200 text-sm h-8" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="active" className="text-slate-200 focus:bg-slate-700">Active</SelectItem>
                <SelectItem value="all" className="text-slate-200 focus:bg-slate-700">All</SelectItem>
                <SelectItem value="sold" className="text-slate-200 focus:bg-slate-700">Sold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Featured Jewelry Banner */}
        <FeaturedJewelryBanner />

        {/* Gift Cards spotlight (shown when viewing all or gift cards) */}
        {(typeFilter === 'all' || typeFilter === 'gift_card') && giftCards.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Gift className="h-5 w-5 text-purple-400" />
              <h2 className="text-xl font-bold text-slate-100">Gift Cards</h2>
              <span className="text-xs text-slate-500 ml-1">Redeemable for any JC ON THE MOVE service</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {giftCards.map((item) => <ShopItemCard key={item.id} item={item} />)}
            </div>
          </div>
        )}

        {/* Moving Supplies spotlight (shown when viewing all or moving_supplies) */}
        {(typeFilter === 'all' || typeFilter === 'moving_supplies') && movingSupplies.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-5 w-5 text-blue-400" />
              <h2 className="text-xl font-bold text-slate-100">Moving Supplies</h2>
              <span className="text-xs text-slate-500 ml-1">Boxes, packing materials & equipment</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {movingSupplies.map((item) => <ShopItemCard key={item.id} item={item} />)}
            </div>
          </div>
        )}

        {/* Community items / all items */}
        {typeFilter === 'all' && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xl font-bold text-slate-100">Community Listings</h2>
            </div>
          </div>
        )}

        {/* Items Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <Card key={i} className="border border-slate-700/50 bg-slate-800/50">
                <Skeleton className="aspect-square w-full bg-slate-700" />
                <CardContent className="p-4">
                  <Skeleton className="h-6 w-3/4 mb-2 bg-slate-700" />
                  <Skeleton className="h-4 w-full mb-2 bg-slate-700" />
                  <Skeleton className="h-8 w-1/2 bg-slate-700" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredItems
              .filter((i) => typeFilter !== 'all' || (i.itemType === 'community' || !i.itemType))
              .map((item) => <ShopItemCard key={item.id} item={item} />)}
          </div>
        ) : typeFilter !== 'all' ? (
          <div className="text-center py-8">
            <p className="text-slate-400">No {typeFilter === 'gift_card' ? 'gift cards' : typeFilter === 'moving_supplies' ? 'moving supplies' : 'items'} found.</p>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-slate-400 mb-4" data-testid="text-no-items">No community items yet. Be the first to post!</p>
            <Link href="/shop/create">
              <Button variant="outline" className="border-slate-600 text-slate-300 hover:bg-blue-500/20 hover:border-blue-500/50" data-testid="button-post-first-item">
                <Plus className="h-4 w-4 mr-2" />
                Post Item
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
