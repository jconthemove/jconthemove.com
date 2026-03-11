import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, ArrowLeft, Eye, MessageCircle, DollarSign, X, Phone, Trash2, CheckCircle2, Pencil, ShoppingCart, Plus, Upload, ImageIcon, Coins, Bitcoin, Check, Gift, Tag, Package, ZoomIn, ZoomOut, RotateCcw, Maximize2 } from "lucide-react";
import { type ShopItem } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCart } from "@/hooks/useCart";
import { FloatingCartButton } from "@/components/cart-button";

export function ShopItemDetailPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { addItem, isInCart, removeItem, itemCount } = useCart();
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchRef = useRef<number | null>(null);
  const zoomImgRef = useRef<HTMLDivElement>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPhotos, setEditPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [giftCardCode, setGiftCardCode] = useState<string | null>(null);
  const [discountedPrice, setDiscountedPrice] = useState<number | null>(null);

  // Fetch shop item details
  const { data: item, isLoading } = useQuery<ShopItem>({
    queryKey: ["/api/shop", id],
    enabled: !!id,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/shop/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shop"] });
      toast({
        title: "Item Deleted",
        description: "Your shop item has been removed.",
      });
      setLocation("/shop");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete item",
        variant: "destructive",
      });
    },
  });

  // Mark as sold mutation — now uses reward endpoint
  const markAsSoldMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/shop/${id}/mark-sold`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shop", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/shop"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      toast({
        title: "Item Sold! +300 JCMOVES",
        description: data?.message || "Congratulations on your sale! Tokens credited to your wallet.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update item status",
        variant: "destructive",
      });
    },
  });


  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("PATCH", `/api/shop/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shop", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/shop"] });
      setIsEditOpen(false);
      toast({ title: "Item Updated", description: "Your changes have been saved." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update item", variant: "destructive" });
    },
  });

  // Buy entirely with JCMOVES
  const buyWithJcmovesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/shop/${id}/redeem-jcmoves`);
      return await res.json();
    },
    onSuccess: (data: any) => {
      if (data.giftCardCode) setGiftCardCode(data.giftCardCode);
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      toast({ title: "Purchase Successful!", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Purchase Failed", description: error.message || "Failed to purchase with JCMOVES", variant: "destructive" });
    },
  });

  // Unlock partial JCMOVES discount
  const discountWithJcmovesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/shop/${id}/discount-jcmoves`);
      return await res.json();
    },
    onSuccess: (data: any) => {
      setDiscountedPrice(data.discountedPrice);
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      toast({ title: `${data.discountPercent}% Discount Unlocked!`, description: `New price: $${data.discountedPrice.toFixed(2)}` });
    },
    onError: (error: any) => {
      toast({ title: "Discount Failed", description: error.message || "Failed to unlock discount", variant: "destructive" });
    },
  });

  const startEdit = () => {
    if (!item) return;
    setEditTitle(item.title);
    setEditDescription(item.description);
    setEditPrice(item.price);
    setEditCategory(item.category || "");
    setEditPhotos(Array.isArray(item.photos) ? [...item.photos as string[]] : []);
    setIsEditOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingPhoto(true);
    try {
      const newPhotos: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          toast({ title: `${file.name} is too large (max 10MB)`, variant: "destructive" });
          continue;
        }
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target?.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
        newPhotos.push(base64);
      }
      setEditPhotos((prev) => [...prev, ...newPhotos]);
    } catch {
      toast({ title: "Failed to upload photo", variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const removeEditPhoto = (index: number) => {
    setEditPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdate = () => {
    updateMutation.mutate({
      title: editTitle,
      description: editDescription,
      price: editPrice,
      category: editCategory || undefined,
      photos: editPhotos,
    });
  };

  // Check if user can manage this item (creator or admin)
  const canManageItem = item && user && (item.postedBy === user.id || user.role === 'admin');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Skeleton className="h-8 w-32 mb-4" />
        <Skeleton className="h-96 w-full mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Item Not Found</h1>
          <p className="text-muted-foreground mb-4">The item you're looking for doesn't exist.</p>
          <Button onClick={() => setLocation("/shop")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Shop
          </Button>
        </div>
      </div>
    );
  }

  const media = Array.isArray(item.photos) ? item.photos : [];
  const hasMultipleMedia = media.length > 1;
  const currentMedia = media[currentMediaIndex];
  const isVideo = currentMedia?.startsWith("data:video/") || currentMedia?.match(/\.(mp4|webm|ogg|mov)(\?|$)/i);

  const nextMedia = () => {
    setCurrentMediaIndex((prev) => (prev + 1) % media.length);
  };

  const prevMedia = () => {
    setCurrentMediaIndex((prev) => (prev - 1 + media.length) % media.length);
  };

  const handleContactSeller = () => {
    toast({
      title: "Contact Seller",
      description: "Contact functionality coming soon! You'll be able to message the seller directly.",
    });
  };

  const handleMakeOffer = () => {
    toast({
      title: "Make an Offer",
      description: "Payment integration coming soon! You'll be able to purchase items directly.",
    });
  };

  const openZoom = () => {
    setZoomScale(1);
    setPanX(0);
    setPanY(0);
    setIsZoomOpen(true);
  };

  const resetZoom = () => { setZoomScale(1); setPanX(0); setPanY(0); };

  const clampPan = useCallback((scale: number, dx: number, dy: number) => {
    const el = zoomImgRef.current;
    if (!el) return { x: dx, y: dy };
    const maxPanX = Math.max(0, (el.clientWidth * (scale - 1)) / 2);
    const maxPanY = Math.max(0, (el.clientHeight * (scale - 1)) / 2);
    return { x: Math.min(maxPanX, Math.max(-maxPanX, dx)), y: Math.min(maxPanY, Math.max(-maxPanY, dy)) };
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoomScale(prev => {
      const next = Math.min(5, Math.max(1, prev + delta));
      if (next === 1) { setPanX(0); setPanY(0); }
      return next;
    });
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomScale <= 1) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX, panY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart.current) return;
    const dx = panX + (e.clientX - dragStart.current.x);
    const dy = panY + (e.clientY - dragStart.current.y);
    const clamped = clampPan(zoomScale, dx, dy);
    setPanX(clamped.x);
    setPanY(clamped.y);
  };

  const handleMouseUp = () => { setIsDragging(false); dragStart.current = null; };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = Math.sqrt(dx * dx + dy * dy);
    } else if (e.touches.length === 1 && zoomScale > 1) {
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX, panY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2 && pinchRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = dist / pinchRef.current;
      pinchRef.current = dist;
      setZoomScale(prev => Math.min(5, Math.max(1, prev * ratio)));
    } else if (e.touches.length === 1 && dragStart.current) {
      const ndx = panX + (e.touches[0].clientX - dragStart.current.x);
      const ndy = panY + (e.touches[0].clientY - dragStart.current.y);
      const clamped = clampPan(zoomScale, ndx, ndy);
      setPanX(clamped.x);
      setPanY(clamped.y);
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX: clamped.x, panY: clamped.y };
    }
  };

  const handleTouchEnd = () => { pinchRef.current = null; dragStart.current = null; };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b p-4 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/shop")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold flex-1 truncate" data-testid="text-page-title">
          {item.title}
        </h1>
      </div>

      <div className="p-4 space-y-4">
        {/* Media Gallery */}
        {media.length > 0 && (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="relative bg-muted min-h-[300px] max-h-[500px] flex items-center justify-center">
                {isVideo ? (
                  <video
                    src={currentMedia}
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                    data-testid={`video-detail-${item.id}`}
                  />
                ) : (
                  <div className="relative w-full group">
                    <img
                      src={currentMedia}
                      alt={item.title}
                      className="w-full max-h-[500px] object-contain cursor-zoom-in"
                      data-testid={`img-detail-${item.id}`}
                      onClick={openZoom}
                    />
                    {/* Zoom hint overlay */}
                    <button
                      onClick={openZoom}
                      className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 backdrop-blur-sm transition-all opacity-80 group-hover:opacity-100 shadow-lg"
                      title="Click to zoom"
                    >
                      <ZoomIn className="h-5 w-5" />
                    </button>
                    <div className="absolute bottom-3 left-3 bg-black/50 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-80 transition-opacity pointer-events-none">
                      Click to zoom
                    </div>
                  </div>
                )}

                {/* ── Full-screen zoom lightbox ── */}
                {isZoomOpen && !isVideo && (
                  <div
                    className="fixed inset-0 z-50 bg-black/95 flex flex-col"
                    onClick={(e) => { if (e.target === e.currentTarget) { setIsZoomOpen(false); resetZoom(); } }}
                  >
                    {/* Toolbar */}
                    <div className="flex items-center justify-between px-4 py-3 bg-black/80 shrink-0 z-10">
                      <span className="text-white/60 text-sm font-medium truncate max-w-[200px]">{item.title}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-white/50 text-xs mr-1">{Math.round(zoomScale * 100)}%</span>
                        <button
                          onClick={() => setZoomScale(s => Math.min(5, +(s + 0.5).toFixed(1)))}
                          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                          title="Zoom in"
                        >
                          <ZoomIn className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { const next = Math.max(1, +(zoomScale - 0.5).toFixed(1)); setZoomScale(next); if (next === 1) { setPanX(0); setPanY(0); } }}
                          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                          title="Zoom out"
                        >
                          <ZoomOut className="h-4 w-4" />
                        </button>
                        <button
                          onClick={resetZoom}
                          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                          title="Reset zoom"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { setIsZoomOpen(false); resetZoom(); }}
                          className="w-8 h-8 rounded-full bg-white/10 hover:bg-red-500/60 text-white flex items-center justify-center transition-colors ml-1"
                          title="Close"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Zoom canvas */}
                    <div
                      ref={zoomImgRef}
                      className="flex-1 overflow-hidden flex items-center justify-center"
                      style={{ cursor: zoomScale > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in" }}
                      onWheel={handleWheel}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onClick={(e) => { if (!isDragging && zoomScale === 1) setZoomScale(2); else if (!isDragging && zoomScale >= 4) resetZoom(); }}
                    >
                      <img
                        src={currentMedia}
                        alt={item.title}
                        data-testid="img-zoomed"
                        draggable={false}
                        style={{
                          transform: `scale(${zoomScale}) translate(${panX / zoomScale}px, ${panY / zoomScale}px)`,
                          transition: isDragging ? "none" : "transform 0.15s ease",
                          maxWidth: "100%",
                          maxHeight: "100%",
                          objectFit: "contain",
                          userSelect: "none",
                          WebkitUserSelect: "none",
                        }}
                      />
                    </div>

                    {/* Bottom hint */}
                    <div className="text-center py-2 text-white/30 text-xs shrink-0">
                      {zoomScale === 1
                        ? "Scroll or click to zoom · Pinch on mobile"
                        : "Drag to pan · Scroll to adjust zoom · Click reset to fit"}
                    </div>

                    {/* Thumbnail strip if multiple images */}
                    {media.length > 1 && (
                      <div className="flex justify-center gap-2 px-4 pb-3 shrink-0">
                        {media.map((m, i) => (
                          <button
                            key={i}
                            onClick={() => { setCurrentMediaIndex(i); resetZoom(); }}
                            className={`w-12 h-12 rounded overflow-hidden border-2 transition-all ${i === currentMediaIndex ? "border-white scale-105" : "border-white/20 opacity-60 hover:opacity-100"}`}
                          >
                            <img src={m} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Navigation for multiple media */}
                {hasMultipleMedia && (
                  <>
                    <button
                      onClick={prevMedia}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
                      data-testid="button-prev-media"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                      onClick={nextMedia}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
                      data-testid="button-next-media"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>

                    {/* Media counter and indicators */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                      {currentMediaIndex + 1} / {media.length}
                    </div>

                    {/* Thumbnail strip */}
                    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-2 max-w-full overflow-x-auto px-4">
                      {media.map((mediaUrl, index) => {
                        const isThumbVideo = mediaUrl.startsWith("data:video/") || mediaUrl.match(/\.(mp4|webm|ogg|mov)(\?|$)/i);
                        return (
                          <button
                            key={index}
                            onClick={() => setCurrentMediaIndex(index)}
                            className={`flex-shrink-0 h-12 w-12 rounded overflow-hidden border-2 ${
                              index === currentMediaIndex ? "border-white" : "border-white/30"
                            }`}
                            data-testid={`button-thumb-${index}`}
                          >
                            {isThumbVideo ? (
                              <div className="w-full h-full bg-black/80 flex items-center justify-center text-white text-xs">
                                📹
                              </div>
                            ) : (
                              <img
                                src={mediaUrl}
                                alt={`Thumbnail ${index + 1}`}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Price and Status */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className={`text-3xl font-bold mb-1 ${discountedPrice ? "line-through text-muted-foreground text-2xl" : "text-primary"}`} data-testid="text-price">
                    ${parseFloat(item.price).toFixed(2)}
                  </h2>
                  {discountedPrice && (
                    <span className="text-3xl font-bold text-emerald-400">${discountedPrice.toFixed(2)}</span>
                  )}
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  {item.itemType && item.itemType !== 'community' && (
                    <Badge className={`text-xs ${item.itemType === 'gift_card' ? 'bg-purple-600 text-white' : item.itemType === 'moving_supplies' ? 'bg-blue-600 text-white' : 'bg-orange-600 text-white'}`}>
                      {item.itemType === 'gift_card' ? '🎁 Gift Card' : item.itemType === 'moving_supplies' ? '📦 Moving Supplies' : '⭐ Official'}
                    </Badge>
                  )}
                  {item.category && (
                    <Badge variant="secondary" data-testid="badge-category">
                      {item.category}
                    </Badge>
                  )}
                  {item.status !== "active" && (
                    <Badge variant="outline" data-testid="badge-status">
                      {item.status}
                    </Badge>
                  )}
                </div>
                {/* Gift card value badge */}
                {item.itemType === 'gift_card' && item.giftCardValue && (
                  <p className="text-sm text-purple-300 mt-1 font-medium">
                    <Gift className="h-3.5 w-3.5 inline mr-1" />
                    ${parseFloat(item.giftCardValue).toFixed(2)} service credit
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Eye className="h-4 w-4" />
                <span className="text-sm" data-testid="text-views">{item.views || 0}</span>
              </div>
            </div>

            {/* Gift card code display after JCMOVES purchase */}
            {giftCardCode && (
              <div className="mb-4 p-4 rounded-xl bg-gradient-to-br from-purple-950/60 to-pink-950/60 border border-purple-500/40">
                <div className="flex items-center gap-2 mb-2">
                  <Gift className="h-5 w-5 text-purple-400" />
                  <span className="font-bold text-purple-200">Your Gift Card Code</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-2xl font-mono font-bold text-white tracking-widest bg-black/30 px-4 py-2 rounded-lg flex-1 text-center">
                    {giftCardCode}
                  </code>
                  <Button size="sm" variant="outline" className="border-purple-500/40 text-purple-300 hover:bg-purple-500/20" onClick={() => { navigator.clipboard.writeText(giftCardCode); toast({ title: "Copied!" }); }}>
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-purple-300/70 mt-2 text-center">Save this code — use it to redeem ${item.giftCardValue && parseFloat(item.giftCardValue).toFixed(2)} off any JC ON THE MOVE service</p>
              </div>
            )}

            {/* Phone Number */}
            {item.phoneNumber && (
              <div className="mb-4 p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Phone className="h-4 w-4" />
                  <span>Contact Seller</span>
                </div>
                <a 
                  href={`tel:${item.phoneNumber}`}
                  className="text-lg font-semibold text-primary hover:underline"
                  data-testid="link-phone-number"
                >
                  {item.phoneNumber}
                </a>
              </div>
            )}

            {/* JCMOVES Rewards Info Banner */}
            {user && item.status === "active" && item.postedBy !== user.id && (
              <div className="mb-3 rounded-lg bg-gradient-to-r from-yellow-950/60 to-amber-950/60 border border-yellow-700/40 px-3 py-2 flex items-center gap-2">
                <Coins className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                <p className="text-xs text-yellow-200/90">
                  Earn <span className="font-bold text-yellow-300">150 JCMOVES</span> automatically when you purchase this item through checkout!
                </p>
              </div>
            )}
            {user && item.status === "active" && item.postedBy === user.id && (
              <div className="mb-3 rounded-lg bg-gradient-to-r from-green-950/60 to-emerald-950/60 border border-green-700/40 px-3 py-2 flex items-center gap-2">
                <Coins className="h-4 w-4 text-green-400 flex-shrink-0" />
                <p className="text-xs text-green-200/90">
                  Earn <span className="font-bold text-green-300">300 JCMOVES</span> automatically when this item sells!
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 mb-4">
              {item.status === "active" && (
                <>
                  <Button
                    size="lg"
                    className={`w-full font-semibold ${
                      isInCart(`shop-${item.id}`)
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "bg-emerald-500 hover:bg-emerald-600 text-white"
                    }`}
                    onClick={() => {
                      if (isInCart(`shop-${item.id}`)) {
                        removeItem(`shop-${item.id}`);
                        toast({ title: "Removed from cart" });
                      } else {
                        const photos = Array.isArray(item.photos) ? item.photos : [];
                        addItem({
                          id: `shop-${item.id}`,
                          name: item.title,
                          price: discountedPrice ?? parseFloat(item.price),
                          image: photos[0] || "",
                          type: "shop",
                        });
                        toast({ title: "Added to cart!" });
                      }
                    }}
                    data-testid="button-add-to-cart"
                  >
                    {isInCart(`shop-${item.id}`) ? (
                      <><Check className="h-5 w-5 mr-2" /> In Cart</>
                    ) : (
                      <><ShoppingCart className="h-5 w-5 mr-2" /> Add to Cart — ${(discountedPrice ?? parseFloat(item.price)).toFixed(2)}</>
                    )}
                  </Button>

                  {/* JCMOVES purchase options */}
                  {user && (item.jcmovesPrice || item.jcmovesDiscountPercent) && (
                    <div className="rounded-xl border border-yellow-500/30 bg-gradient-to-br from-yellow-950/40 to-amber-950/40 p-3 space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Coins className="h-4 w-4 text-yellow-400" />
                        <span className="text-sm font-semibold text-yellow-300">Pay with JCMOVES</span>
                      </div>

                      {item.jcmovesPrice && !giftCardCode && (
                        <Button
                          size="sm"
                          className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                          onClick={() => buyWithJcmovesMutation.mutate()}
                          disabled={buyWithJcmovesMutation.isPending}
                          data-testid="button-buy-jcmoves"
                        >
                          {buyWithJcmovesMutation.isPending ? "Processing..." : (
                            <>{item.itemType === 'gift_card' ? <Gift className="h-4 w-4 mr-2" /> : <Coins className="h-4 w-4 mr-2" />}
                            Buy with {parseFloat(item.jcmovesPrice).toLocaleString()} JCMOVES</>
                          )}
                        </Button>
                      )}

                      {item.jcmovesDiscountPercent && item.jcmovesDiscountTokens && !discountedPrice && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/20"
                          onClick={() => discountWithJcmovesMutation.mutate()}
                          disabled={discountWithJcmovesMutation.isPending}
                          data-testid="button-discount-jcmoves"
                        >
                          {discountWithJcmovesMutation.isPending ? "Applying..." : (
                            <><Tag className="h-4 w-4 mr-2" />Use {parseFloat(item.jcmovesDiscountTokens).toLocaleString()} JCMOVES for {item.jcmovesDiscountPercent}% off</>
                          )}
                        </Button>
                      )}

                      {discountedPrice && (
                        <div className="flex items-center gap-2 text-xs text-emerald-300">
                          <Check className="h-3.5 w-3.5" />
                          {item.jcmovesDiscountPercent}% discount applied — add to cart at ${discountedPrice.toFixed(2)}
                        </div>
                      )}
                    </div>
                  )}

                  <a href="/bitcoin-payment" className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 transition-colors">
                    <Bitcoin className="h-4 w-4 text-orange-400" />
                    <span className="text-orange-300 text-sm font-medium">Pay with Bitcoin</span>
                    <span className="inline-flex items-center bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Save 10%</span>
                  </a>

                  {isInCart(`shop-${item.id}`) && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-950/40 border border-orange-500/30">
                      <Bitcoin className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
                      <p className="text-orange-300/90 text-xs">Added! Pay with Bitcoin at checkout to <span className="font-bold text-orange-300">save 10%</span></p>
                    </div>
                  )}
                </>
              )}
              {item.status !== "active" && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full"
                    onClick={() => setLocation("/shop")}
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    Browse More Items
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full"
                    onClick={handleContactSeller}
                    data-testid="button-contact-seller"
                  >
                    <MessageCircle className="h-5 w-5 mr-2" />
                    Contact
                  </Button>
                </div>
              )}
            </div>

            {/* Item Management Buttons (Creator & Admin Only) */}
            {canManageItem && (
              <div className="space-y-2 pt-4 border-t">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={startEdit}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit Item
                  </Button>
                  {item.status !== "sold" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => markAsSoldMutation.mutate()}
                      disabled={markAsSoldMutation.isPending}
                      data-testid="button-mark-as-sold"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Mark as Sold
                    </Button>
                  )}
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-item"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Item
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Description */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold mb-2">Description</h3>
            <p className="text-foreground whitespace-pre-wrap" data-testid="text-full-description">
              {item.description}
            </p>
          </CardContent>
        </Card>

        {/* Payment Options Info */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold mb-2">Payment Options</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>💳 Cash on delivery</p>
              <p>💵 Bank transfer</p>
              <p>🪙 Cryptocurrency (coming soon)</p>
              <p className="pt-2 border-t">
                <strong>Safe Transaction Tips:</strong> Meet in public places, inspect items before payment,
                and use secure payment methods.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Item Details */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold mb-2">Item Details</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Posted</span>
                <span>{new Date(item.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Item ID</span>
                <span className="font-mono text-xs">{item.id.slice(0, 8)}...</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <Label>Price</Label>
              <Input value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="Optional category" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={4} />
            </div>
            <div>
              <Label className="mb-2 block">Photos</Label>
              {editPhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {editPhotos.map((photo, index) => (
                    <div key={index} className="relative group">
                      <img src={photo} alt={`Photo ${index + 1}`} className="w-full aspect-square object-cover rounded-lg border" />
                      <button
                        type="button"
                        onClick={() => removeEditPhoto(index)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                {uploadingPhoto ? (
                  <span className="text-sm text-muted-foreground">Uploading...</span>
                ) : (
                  <>
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Add or replace photos</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                  disabled={uploadingPhoto}
                />
              </label>
            </div>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="w-full">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shop Item?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteMutation.mutate();
                setDeleteConfirmOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FloatingCartButton />
    </div>
  );
}
