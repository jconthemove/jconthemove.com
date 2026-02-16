import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { type ShopItem } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ChevronLeft, ChevronRight, Eye } from "lucide-react";

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

  return (
    <Link href={`/shop/${item.id}`}>
    <Card className="overflow-hidden transition-all cursor-pointer border border-slate-700/50 bg-gradient-to-br from-slate-800/80 to-slate-900/80 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-900/20 hover:scale-[1.02] group" data-testid={`card-shop-item-${item.id}`}>
      <CardHeader className="p-0">
        {/* Photo Slideshow */}
        <div className="relative bg-slate-900 aspect-square overflow-hidden">
          {photos && photos.length > 0 ? (
            <>
              <img
                src={photos[currentPhotoIndex]}
                alt={item.title}
                className="w-full h-full object-cover group-hover:brightness-110 transition-all"
                data-testid={`img-shop-item-${item.id}-${currentPhotoIndex}`}
              />
              
              {/* Navigation Arrows */}
              {photos.length > 1 && (
                <>
                  <button
                    onClick={handlePrevPhoto}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition-colors border border-white/20"
                    data-testid={`button-prev-photo-${item.id}`}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleNextPhoto}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition-colors border border-white/20"
                    data-testid={`button-next-photo-${item.id}`}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  
                  {/* Photo Indicators */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                    {photos.map((_, index) => (
                      <div
                        key={index}
                        className={`h-1.5 rounded-full transition-all ${
                          index === currentPhotoIndex
                            ? "w-6 bg-orange-400"
                            : "w-1.5 bg-white/50"
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
              
              {/* Status Badge */}
              {item.status !== "active" && (
                <div className="absolute top-2 left-2">
                  <Badge className="capitalize bg-slate-800/80 text-slate-200 border border-slate-600">
                    {item.status}
                  </Badge>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500">
              No Image
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="p-4">
        <h3 className="font-semibold text-lg mb-1 truncate text-slate-100" data-testid={`text-title-${item.id}`}>
          {item.title}
        </h3>
        <p className="text-sm text-slate-400 mb-2 line-clamp-2" data-testid={`text-description-${item.id}`}>
          {item.description}
        </p>
        
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold text-orange-400" data-testid={`text-price-${item.id}`}>
            ${parseFloat(item.price).toFixed(2)}
          </span>
          <div className="flex items-center gap-1 text-sm text-slate-500">
            <Eye className="h-4 w-4" />
            <span data-testid={`text-views-${item.id}`}>{item.views}</span>
          </div>
        </div>
        
        {item.category && (
          <div className="mt-2">
            <Badge variant="outline" className="text-xs border-slate-600 text-slate-300" data-testid={`badge-category-${item.id}`}>
              {item.category}
            </Badge>
          </div>
        )}
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

export function ShopCatalogPage() {
  const [statusFilter, setStatusFilter] = useState<string>("active");
  
  const { data: items, isLoading } = useQuery<ShopItem[]>({
    queryKey: ["/api/shop", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      const url = `/api/shop${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch shop items");
      }
      return response.json();
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-20">
      <div className="container mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-orange-500/10 to-blue-600/20 blur-3xl -z-10"></div>
            <h1 className="text-4xl font-black bg-gradient-to-r from-blue-400 via-orange-400 to-blue-400 bg-clip-text text-transparent tracking-tight" data-testid="heading-shop">Shop</h1>
            <p className="text-slate-400 mt-1">
              Browse items from our community
            </p>
          </div>
          
          <Link href="/shop/create">
            <Button className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/25" data-testid="button-post-item">
              <Plus className="h-4 w-4 mr-2" />
              Post Item
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="status-filter" className="text-sm font-medium text-slate-300">
              Status:
            </label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="status-filter" className="w-[150px] bg-slate-800/50 border-slate-600 text-slate-200" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="active" className="text-slate-200 focus:bg-slate-700">Active</SelectItem>
                <SelectItem value="all" className="text-slate-200 focus:bg-slate-700">All</SelectItem>
                <SelectItem value="draft" className="text-slate-200 focus:bg-slate-700">Draft</SelectItem>
                <SelectItem value="sold" className="text-slate-200 focus:bg-slate-700">Sold</SelectItem>
                <SelectItem value="archived" className="text-slate-200 focus:bg-slate-700">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

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
        ) : items && items.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {items.map((item) => (
              <ShopItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-slate-400 mb-4" data-testid="text-no-items">
              No items found. Be the first to post!
            </p>
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
