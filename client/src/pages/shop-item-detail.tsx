import { useState } from "react";
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
import { ChevronLeft, ChevronRight, ArrowLeft, Eye, MessageCircle, DollarSign, X, Phone, Trash2, CheckCircle2, Pencil, ShoppingCart, Plus, Upload, ImageIcon, Coins } from "lucide-react";
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPhotos, setEditPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
                  <Dialog open={isZoomOpen} onOpenChange={setIsZoomOpen}>
                    <DialogTrigger asChild>
                      <img
                        src={currentMedia}
                        alt={item.title}
                        className="w-full max-h-[500px] object-contain cursor-zoom-in"
                        data-testid={`img-detail-${item.id}`}
                      />
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] max-h-[95vh] p-2">
                      <div className="relative w-full h-full flex items-center justify-center">
                        <img
                          src={currentMedia}
                          alt={item.title}
                          className="max-w-full max-h-[90vh] object-contain"
                          data-testid="img-zoomed"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2"
                          onClick={() => setIsZoomOpen(false)}
                        >
                          <X className="h-5 w-5" />
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
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
                <h2 className="text-3xl font-bold text-primary mb-1" data-testid="text-price">
                  ${item.price}
                </h2>
                <div className="flex gap-2 items-center">
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
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Eye className="h-4 w-4" />
                <span className="text-sm" data-testid="text-views">{item.views || 0}</span>
              </div>
            </div>

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
                  {isInCart(`shop-${item.id}`) ? (
                    <Button
                      size="lg"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => {
                        removeItem(`shop-${item.id}`);
                        toast({ title: "Removed from cart" });
                      }}
                    >
                      <ShoppingCart className="h-5 w-5 mr-2" />
                      In Cart — Remove
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => {
                        const photos = Array.isArray(item.photos) ? item.photos : [];
                        addItem({
                          id: `shop-${item.id}`,
                          name: item.title,
                          price: parseFloat(item.price),
                          image: photos[0] || "",
                          type: "shop",
                        });
                        toast({
                          title: "Added to cart!",
                          description: itemCount > 0 ? "10% stacking discount on additional items!" : undefined,
                        });
                      }}
                      data-testid="button-add-to-cart"
                    >
                      <ShoppingCart className="h-5 w-5 mr-2" />
                      Add to Cart{itemCount > 0 ? " — Save 10%" : ""}
                    </Button>
                  )}
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
                  {itemCount > 0 && (
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full border-yellow-500/50 text-yellow-300 hover:bg-yellow-900/30"
                      onClick={() => setLocation("/cart")}
                    >
                      <ShoppingCart className="h-5 w-5 mr-2" />
                      View Cart ({itemCount} item{itemCount > 1 ? "s" : ""})
                    </Button>
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
