import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Gem, ChevronLeft, ChevronRight, Mail, Phone, CreditCard, Pencil, Trash2, Video, Loader2, Tag, RotateCcw, ShoppingCart, Check } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { FloatingCartButton } from "@/components/cart-button";

const isVideoUrl = (url: string) => /\.(mp4|webm|ogg|mov)$/i.test(url);

function MediaItem({ src, alt, className }: { src: string; alt: string; className?: string }) {
  if (isVideoUrl(src)) {
    return <video src={src} className={className} controls playsInline muted loop />;
  }
  return <img src={src} alt={alt} className={className} />;
}

interface JewelryItem {
  id: string;
  postedBy?: string;
  title: string;
  description?: string;
  shortDescription?: string;
  price?: string;
  category?: string;
  materials?: string;
  imageUrl?: string;
  photos?: string[];
  inStock?: boolean;
  featured?: boolean;
  status: string;
  createdAt: string;
}

function DetailCartButtons({ item, onCheckout, checkoutLoading }: { item: JewelryItem; onCheckout: () => void; checkoutLoading: boolean }) {
  const { addItem, removeItem, isInCart, itemCount } = useCart();
  const cartId = `jewelry-${item.id}`;
  const inCart = isInCart(cartId);

  if (!item.price || item.inStock === false) return null;

  return (
    <div className="pt-3 border-t space-y-2.5">
      <Button
        className="w-full bg-purple-600 hover:bg-purple-700 py-5 text-base font-semibold"
        onClick={onCheckout}
        disabled={checkoutLoading}
      >
        {checkoutLoading ? (
          <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Processing...</>
        ) : (
          <><CreditCard className="h-5 w-5 mr-2" /> Buy Now - ${item.price}</>
        )}
      </Button>
      <Button
        variant={inCart ? "default" : "outline"}
        className={`w-full py-4 text-sm font-medium ${
          inCart
            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
            : "border-emerald-500 text-emerald-600 hover:bg-emerald-50"
        }`}
        onClick={() => {
          if (inCart) {
            removeItem(cartId);
          } else {
            addItem({
              id: cartId,
              name: item.title,
              price: parseFloat(item.price!),
              image: item.imageUrl || "",
              type: "jewelry",
            });
          }
        }}
      >
        {inCart ? (
          <><Check className="h-4 w-4 mr-2" /> In Cart{itemCount > 1 ? " — 10% Bundle!" : ""}</>
        ) : (
          <><ShoppingCart className="h-4 w-4 mr-2" /> Add to Cart{itemCount > 0 ? " — Save 10%" : ""}</>
        )}
      </Button>
    </div>
  );
}

export default function JewelryDetailPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<JewelryItem | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'business_owner';

  const canEditItem = (item: JewelryItem) => {
    if (!user) return false;
    if (isAdmin) return true;
    return item.postedBy === user.id;
  };

  const { data: item, isLoading } = useQuery<JewelryItem>({
    queryKey: ["/api/jewelry", id],
    queryFn: async () => {
      const res = await fetch(`/api/jewelry/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch item");
      return res.json();
    },
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => await apiRequest("DELETE", `/api/jewelry/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/jewelry"] });
      toast({ title: "Item Deleted" });
      navigate("/nature-made-jewls");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => await apiRequest("PATCH", `/api/jewelry/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/jewelry", id] });
      qc.invalidateQueries({ queryKey: ["/api/jewelry"] });
      setIsEditOpen(false);
      toast({ title: "Item Updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const soldMutation = useMutation({
    mutationFn: async ({ id, sold }: { id: string; sold: boolean }) => {
      return await apiRequest("PATCH", `/api/jewelry/${id}/sold`, { sold });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/jewelry", id] });
      qc.invalidateQueries({ queryKey: ["/api/jewelry"] });
      toast({ title: "Item updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCheckout = async () => {
    if (!item) return;
    setCheckoutLoading(true);
    try {
      const res = await apiRequest("POST", "/api/square/create-checkout", { itemId: item.id });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({ title: "Error", description: "Could not create checkout link", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Payment Error", description: error.message || "Failed to start checkout. Please try again.", variant: "destructive" });
    } finally {
      setCheckoutLoading(false);
    }
  };

  const getPhotos = (item: JewelryItem) => {
    const photos: string[] = [];
    if (item.imageUrl) photos.push(item.imageUrl);
    if (item.photos && Array.isArray(item.photos)) {
      photos.push(...item.photos.filter((p: string) => p && !photos.includes(p)));
    }
    return photos;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-400 via-purple-300 to-gray-500 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-400 via-purple-300 to-gray-500 flex flex-col items-center justify-center p-4">
        <Gem className="h-16 w-16 text-stone-300 mb-4" />
        <p className="text-stone-600 text-lg">Item not found</p>
        <Link href="/nature-made-jewls">
          <Button variant="outline" className="mt-4"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Shop</Button>
        </Link>
      </div>
    );
  }

  const photos = getPhotos(item);

  const nextPhoto = () => setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
  const prevPhoto = () => setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);

  const startEdit = () => {
    setEditItem({ ...item });
    setIsEditOpen(true);
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-400 via-purple-300 to-gray-500">
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-purple-200/50 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/nature-made-jewls">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <span className="font-serif text-sm font-bold text-purple-700 truncate mx-2">{item.title}</span>
          <div className="w-16" />
        </div>
      </div>

      <div className="relative w-full bg-stone-100" style={{ height: '60vh' }}>
        {item.inStock === false && (
          <div className="absolute top-4 left-4 z-20">
            <span className="bg-red-500 text-white font-bold text-sm px-4 py-1.5 rounded-full shadow-lg uppercase tracking-wider">
              Sold
            </span>
          </div>
        )}
        {photos.length > 0 ? (
          <>
            <MediaItem
              src={photos[currentPhotoIndex]}
              alt={item.title}
              className="w-full h-full object-contain"
            />
            {photos.length > 1 && (
              <>
                <button onClick={prevPhoto} className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2.5 shadow-lg">
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button onClick={nextPhoto} className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2.5 shadow-lg">
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                  {photos.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPhotoIndex(i)}
                      className={`w-3 h-3 rounded-full transition-colors shadow ${i === currentPhotoIndex ? 'bg-purple-500 scale-110' : 'bg-white/70'}`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Gem className="w-24 h-24 text-stone-300" />
          </div>
        )}
      </div>

      <div className="bg-white rounded-t-3xl -mt-4 relative z-10 min-h-[40vh]">
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h1 className="text-2xl font-serif font-bold text-stone-800">{item.title}</h1>
              {item.category && (
                <p className="text-purple-600 capitalize text-sm mt-0.5">{item.category}</p>
              )}
            </div>
            {item.price && (
              <p className="text-2xl font-bold text-purple-600">${item.price}</p>
            )}
          </div>

          {item.materials && (
            <div className="bg-purple-50 rounded-lg p-3">
              <p className="text-xs font-medium text-purple-500 uppercase tracking-wide">Materials</p>
              <p className="text-stone-700 text-sm mt-0.5">{item.materials}</p>
            </div>
          )}

          {item.description && (
            <div>
              <p className="text-xs font-medium text-stone-400 uppercase tracking-wide">About this piece</p>
              <p className="text-stone-600 text-sm whitespace-pre-wrap mt-1">{item.description}</p>
            </div>
          )}

          <DetailCartButtons item={item} onCheckout={handleCheckout} checkoutLoading={checkoutLoading} />

            {!item.inStock && (
              <div className="bg-stone-100 rounded-lg p-3 text-center">
                <p className="text-stone-500 font-medium">This item has been sold</p>
              </div>
            )}

            <div className="flex gap-2">
              <a href={`mailto:upmichiganstatemovers@gmail.com?subject=Inquiry: ${item.title}`} className="flex-1">
                <Button variant="outline" className="w-full border-purple-600 text-purple-600 hover:bg-purple-50 text-sm py-4">
                  <Mail className="h-4 w-4 mr-2" />
                  Ask a Question
                </Button>
              </a>
              <a href="tel:906-285-9312">
                <Button variant="outline" className="border-stone-300 py-4">
                  <Phone className="h-4 w-4" />
                </Button>
              </a>
            </div>

            {canEditItem(item) && (
              <div className="space-y-2 pt-2 border-t border-stone-200">
                <Button
                  variant={item.inStock === false ? "outline" : "default"}
                  size="sm"
                  className={item.inStock === false
                    ? "w-full border-green-400 text-green-600 hover:bg-green-50"
                    : "w-full bg-amber-500 hover:bg-amber-600 text-white"}
                  onClick={() => soldMutation.mutate({ id: item.id, sold: item.inStock !== false })}
                  disabled={soldMutation.isPending}
                >
                  {item.inStock === false ? (
                    <><RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Mark Available</>
                  ) : (
                    <><Tag className="h-3.5 w-3.5 mr-1.5" /> Mark as Sold</>
                  )}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 border-purple-400 text-purple-600" onClick={startEdit}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 border-red-300 text-red-600" onClick={() => setDeleteConfirmOpen(true)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                  </Button>
                </div>
              </div>
            )}
        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={editItem.title} onChange={(e) => setEditItem({ ...editItem, title: e.target.value })} />
              </div>
              <div>
                <Label>Price</Label>
                <Input value={editItem.price || ""} onChange={(e) => setEditItem({ ...editItem, price: e.target.value })} placeholder="25.00" />
              </div>
              <div>
                <Label>Category</Label>
                <Input value={editItem.category || ""} onChange={(e) => setEditItem({ ...editItem, category: e.target.value })} />
              </div>
              <div>
                <Label>Materials</Label>
                <Input value={editItem.materials || ""} onChange={(e) => setEditItem({ ...editItem, materials: e.target.value })} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={editItem.description || ""} onChange={(e) => setEditItem({ ...editItem, description: e.target.value })} rows={4} />
              </div>
              <Button
                onClick={() => updateMutation.mutate({ title: editItem.title, price: editItem.price, category: editItem.category, materials: editItem.materials, description: editItem.description })}
                disabled={updateMutation.isPending}
                className="w-full"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <FloatingCartButton />
    </div>
  );
}
