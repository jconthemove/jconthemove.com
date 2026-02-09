import { useState, useCallback, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowLeft, Gem, Leaf, Search, Plus, ChevronLeft, ChevronRight, Mail, Phone, ShoppingCart, ImagePlus, X, Heart, Pencil, Trash2 } from "lucide-react";

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

const categories = [
  { value: "all", label: "All" },
  { value: "earrings", label: "Earrings" },
  { value: "necklaces", label: "Necklaces" },
  { value: "bracelets", label: "Bracelets" },
  { value: "rings", label: "Rings" },
  { value: "custom", label: "Custom" },
];

export default function NatureMadeJewls() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedItem, setSelectedItem] = useState<JewelryItem | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [newPhotoUrl, setNewPhotoUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hoveredItem, setHoveredItem] = useState<JewelryItem | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    };
  }, []);

  const [newItem, setNewItem] = useState({
    title: "",
    shortDescription: "",
    description: "",
    price: "",
    category: "",
    materials: "",
    imageUrl: "",
  });

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<JewelryItem | null>(null);
  const [editPhotoUrls, setEditPhotoUrls] = useState<string[]>([]);
  const [editPhotoUrl, setEditPhotoUrl] = useState("");
  const [isEditUploading, setIsEditUploading] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<JewelryItem | null>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'business_owner';
  const canAdd = isAdmin || user?.role === 'employee';

  const canEditItem = (item: JewelryItem) => {
    if (!user) return false;
    if (isAdmin) return true;
    return item.postedBy === user.id;
  };

  const { data: items = [], isLoading } = useQuery<JewelryItem[]>({
    queryKey: ["/api/jewelry", { category: selectedCategory !== "all" ? selectedCategory : undefined, search: searchQuery }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== "all") params.append("category", selectedCategory);
      if (searchQuery) params.append("search", searchQuery);
      const res = await fetch(`/api/jewelry?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (item: any) => apiRequest("POST", "/api/jewelry", item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jewelry"] });
      setIsCreateOpen(false);
      setNewItem({ title: "", shortDescription: "", description: "", price: "", category: "", materials: "", imageUrl: "" });
      setPhotoUrls([]);
      toast({ title: "Item added!" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/jewelry/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jewelry"] });
      setIsEditOpen(false);
      setEditItem(null);
      setSelectedItem(null);
      toast({ title: "Item updated!" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/jewelry/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jewelry"] });
      setSelectedItem(null);
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
      toast({ title: "Item deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const startEdit = (item: JewelryItem) => {
    setEditItem({ ...item });
    setEditPhotoUrls(getItemPhotos(item));
    setSelectedItem(null);
    setIsEditOpen(true);
  };

  const handleUpdate = () => {
    if (!editItem) return;
    const updateData = {
      title: editItem.title,
      shortDescription: editItem.shortDescription,
      description: editItem.description,
      price: editItem.price && editItem.price !== '' ? editItem.price : '0.00',
      category: editItem.category,
      materials: editItem.materials,
      imageUrl: editPhotoUrls[0] || editItem.imageUrl,
      photos: editPhotoUrls,
    };
    updateMutation.mutate({ id: editItem.id, data: updateData });
  };

  const handleEditFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remaining = 10 - editPhotoUrls.length;
    const filesToUpload = Array.from(files).slice(0, remaining);
    setIsEditUploading(true);
    try {
      for (const file of filesToUpload) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const res = await fetch('/api/jewelry/upload-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ image: base64, extension: ext }),
        });
        if (!res.ok) throw new Error('Upload failed');
        const { url } = await res.json();
        setEditPhotoUrls(prev => [...prev, url]);
      }
      toast({ title: `${filesToUpload.length} photo(s) uploaded` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsEditUploading(false);
      if (editFileInputRef.current) editFileInputRef.current.value = '';
    }
  };

  const handleCreate = () => {
    if (!newItem.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    const itemData = {
      ...newItem,
      imageUrl: photoUrls[0] || newItem.imageUrl,
      photos: photoUrls,
    };
    createMutation.mutate(itemData);
  };

  const addPhotoUrl = () => {
    if (newPhotoUrl.trim() && photoUrls.length < 10) {
      setPhotoUrls([...photoUrls, newPhotoUrl.trim()]);
      setNewPhotoUrl("");
    }
  };

  const removePhotoUrl = (index: number) => {
    setPhotoUrls(photoUrls.filter((_, i) => i !== index));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const remaining = 10 - photoUrls.length;
    const filesToUpload = Array.from(files).slice(0, remaining);
    
    setIsUploading(true);
    try {
      for (const file of filesToUpload) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        const res = await fetch('/api/jewelry/upload-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ image: base64, extension: ext }),
        });
        
        if (!res.ok) throw new Error('Upload failed');
        const { url } = await res.json();
        setPhotoUrls(prev => [...prev, url]);
      }
      toast({ title: `${filesToUpload.length} photo(s) uploaded` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getItemPhotos = (item: JewelryItem) => {
    const photos: string[] = [];
    if (item.imageUrl) photos.push(item.imageUrl);
    if (item.photos && Array.isArray(item.photos)) {
      photos.push(...item.photos.filter((p: string) => p && !photos.includes(p)));
    }
    return photos.length > 0 ? photos : [];
  };

  const nextPhoto = () => {
    if (selectedItem) {
      const photos = getItemPhotos(selectedItem);
      setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
    }
  };

  const prevPhoto = () => {
    if (selectedItem) {
      const photos = getItemPhotos(selectedItem);
      setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
    }
  };

  const openItem = (item: JewelryItem) => {
    setSelectedItem(item);
    setCurrentPhotoIndex(0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-400 via-purple-300 to-gray-500">
      <header className="sticky top-0 z-50 bg-gradient-to-r from-slate-100/95 via-purple-50/95 to-slate-200/95 backdrop-blur border-b border-purple-200/50 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-stone-600">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Leaf className="w-5 h-5 text-purple-600" />
            <h1 className="font-serif text-xl font-bold bg-gradient-to-r from-slate-700 via-purple-700 to-slate-600 bg-clip-text text-transparent">Nature Made Jewls</h1>
            <Gem className="w-5 h-5 text-slate-400" />
          </div>
          <div className="flex items-center gap-2">
            {!user && (
              <Link href="/employee-login?redirect=/nature-made-jewls">
                <Button variant="ghost" size="sm" className="text-purple-600 font-semibold">
                  Login
                </Button>
              </Link>
            )}
            <a href="mailto:upmichiganstatemovers@gmail.com">
              <Button variant="ghost" size="sm"><Mail className="h-4 w-4 text-stone-600" /></Button>
            </a>
            <a href="tel:906-285-9312">
              <Button variant="ghost" size="sm"><Phone className="h-4 w-4 text-stone-600" /></Button>
            </a>
          </div>
        </div>
      </header>

      <div className="sticky top-14 z-40 bg-gradient-to-r from-slate-100/95 via-purple-50/95 to-slate-200/95 backdrop-blur border-b border-purple-200/50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input
                placeholder="Search handcrafted jewelry..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white/70 border-purple-200"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <Button
                  key={cat.value}
                  variant={selectedCategory === cat.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(cat.value)}
                  className={selectedCategory === cat.value 
                    ? "bg-gradient-to-r from-purple-600 to-slate-600 hover:from-purple-700 hover:to-slate-700 whitespace-nowrap" 
                    : "border-purple-300 text-purple-800 hover:bg-purple-50 whitespace-nowrap"}
                >
                  {cat.label}
                </Button>
              ))}
            </div>
            {canAdd ? (
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-purple-500 to-slate-600 hover:from-purple-600 hover:to-slate-700 whitespace-nowrap">
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Piece</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Title *</Label>
                      <Input
                        value={newItem.title}
                        onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                        placeholder="e.g., Turquoise Drop Earrings"
                      />
                    </div>
                    
                    <div>
                      <Label>Photos</Label>
                      <div className="space-y-2">
                        {photoUrls.map((url, index) => (
                          <div key={index} className="flex gap-2 items-center">
                            <img src={url} alt="" className="w-12 h-12 object-cover rounded" />
                            <span className="text-sm text-stone-600 truncate flex-1">{url.split('/').pop()}</span>
                            <Button type="button" variant="ghost" size="sm" onClick={() => removePhotoUrl(index)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <Input
                            value={newPhotoUrl}
                            onChange={(e) => setNewPhotoUrl(e.target.value)}
                            placeholder="Paste image URL..."
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPhotoUrl(); } }}
                            className="flex-1"
                          />
                          <Button type="button" variant="outline" onClick={addPhotoUrl} disabled={!newPhotoUrl.trim() || photoUrls.length >= 10} title="Add URL">
                            <Plus className="h-4 w-4" />
                          </Button>
                          <label
                            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 cursor-pointer ${photoUrls.length >= 10 || isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                            title="Upload from device"
                          >
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleFileUpload}
                              accept="image/*"
                              multiple
                              className="sr-only"
                            />
                            {isUploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ImagePlus className="h-4 w-4" />}
                          </label>
                        </div>
                        <p className="text-xs text-stone-500">{photoUrls.length}/10 photos</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Price</Label>
                        <Input
                          value={newItem.price}
                          onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                          placeholder="25.00"
                        />
                      </div>
                      <div>
                        <Label>Category</Label>
                        <Select value={newItem.category} onValueChange={(v) => setNewItem({ ...newItem, category: v })}>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            {categories.filter(c => c.value !== "all").map((cat) => (
                              <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label>Short Description</Label>
                      <Input
                        value={newItem.shortDescription}
                        onChange={(e) => setNewItem({ ...newItem, shortDescription: e.target.value })}
                        placeholder="One line for thumbnail"
                      />
                    </div>

                    <div>
                      <Label>Materials</Label>
                      <Input
                        value={newItem.materials}
                        onChange={(e) => setNewItem({ ...newItem, materials: e.target.value })}
                        placeholder="Sterling silver, turquoise..."
                      />
                    </div>

                    <div>
                      <Label>Full Description</Label>
                      <Textarea
                        value={newItem.description}
                        onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                        placeholder="Tell the story of this piece..."
                        rows={3}
                      />
                    </div>

                    <Button onClick={handleCreate} disabled={createMutation.isPending} className="w-full bg-purple-600 hover:bg-purple-700">
                      {createMutation.isPending ? "Adding..." : "Add Item"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : (
              <Link href="/employee-login?redirect=/nature-made-jewls">
                <Button className="bg-gradient-to-r from-purple-500 to-slate-600 hover:from-purple-600 hover:to-slate-700 whitespace-nowrap">
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <main className="container mx-auto px-2 py-6">
        {isLoading ? (
          <div className="text-center text-stone-500 py-16">Loading beautiful pieces...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Gem className="w-16 h-16 mx-auto text-stone-300 mb-4" />
            <p className="text-stone-500 text-lg">No items found</p>
            <p className="text-stone-400 text-sm mt-2">
              {searchQuery ? "Try a different search" : "New pieces coming soon!"}
            </p>
            {canAdd && (
              <Button 
                onClick={() => setIsCreateOpen(true)}
                className="mt-6 bg-gradient-to-r from-purple-500 to-slate-600 hover:from-purple-600 hover:to-slate-700"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Your First Item
              </Button>
            )}
            {!user && (
              <div className="mt-6">
                <Link href="/employee-login?redirect=/nature-made-jewls">
                  <Button variant="outline" className="border-purple-600 text-purple-600">
                    Login to Add Items
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <>
          <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-3 space-y-3">
            {items.map((item) => {
              const photos = getItemPhotos(item);
              const randomHeight = Math.random() > 0.5 ? 'aspect-[3/4]' : 'aspect-square';
              
              return (
                <Card
                  key={item.id}
                  className="break-inside-avoid mb-3 overflow-hidden cursor-pointer group hover:shadow-xl transition-all border-0 bg-white/90 backdrop-blur-sm shadow-md shadow-purple-100/50"
                  onClick={() => openItem(item)}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const viewportW = window.innerWidth;
                    const popupW = 320;
                    let x = rect.right + 12;
                    if (x + popupW > viewportW) x = rect.left - popupW - 12;
                    if (x < 8) x = rect.left + rect.width / 2 - popupW / 2;
                    let y = rect.top;
                    if (y + 400 > window.innerHeight) y = window.innerHeight - 410;
                    if (y < 8) y = 8;
                    setHoverPos({ x, y });
                    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
                    hoverTimeout.current = setTimeout(() => setHoveredItem(item), 400);
                  }}
                  onMouseLeave={() => {
                    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
                    setHoveredItem(null);
                  }}
                >
                  <div className={`${randomHeight} relative overflow-hidden bg-stone-100`}>
                    {photos.length > 0 ? (
                      <img
                        src={photos[0]}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Gem className="w-12 h-12 text-stone-300" />
                      </div>
                    )}
                    {photos.length > 1 && (
                      <span className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                        +{photos.length - 1}
                      </span>
                    )}
                    {item.featured && (
                      <Heart className="absolute top-2 left-2 w-5 h-5 text-rose-500 fill-rose-500" />
                    )}
                    {!item.inStock && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="bg-white text-stone-800 px-3 py-1 rounded-full text-sm font-medium">Sold</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="p-3">
                    <h3 className="font-medium text-stone-800 line-clamp-1">{item.title}</h3>
                    <p className="text-stone-500 text-sm line-clamp-1">{item.shortDescription || item.category || "Handcrafted"}</p>
                    {item.price && (
                      <p className="text-purple-600 font-semibold mt-1">${item.price}</p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {hoveredItem && (
            <div
              className="fixed z-[100] pointer-events-none animate-in fade-in zoom-in-95 duration-200"
              style={{ left: hoverPos.x, top: hoverPos.y }}
            >
              <div className="w-80 bg-white rounded-xl shadow-2xl shadow-purple-200/60 border border-purple-100 overflow-hidden">
                {getItemPhotos(hoveredItem).length > 0 ? (
                  <img
                    src={getItemPhotos(hoveredItem)[0]}
                    alt={hoveredItem.title}
                    className="w-full aspect-square object-cover"
                  />
                ) : (
                  <div className="w-full aspect-square bg-stone-100 flex items-center justify-center">
                    <Gem className="w-16 h-16 text-stone-300" />
                  </div>
                )}
                <div className="p-4">
                  <h3 className="font-serif font-bold text-stone-800 text-lg">{hoveredItem.title}</h3>
                  {hoveredItem.category && (
                    <p className="text-purple-600 text-sm capitalize">{hoveredItem.category}</p>
                  )}
                  {hoveredItem.price && (
                    <p className="text-purple-700 font-bold text-xl mt-1">${hoveredItem.price}</p>
                  )}
                  {hoveredItem.shortDescription && (
                    <p className="text-stone-500 text-sm mt-2 line-clamp-2">{hoveredItem.shortDescription}</p>
                  )}
                  <p className="text-purple-400 text-xs mt-3 italic">Click to view full details</p>
                </div>
              </div>
            </div>
          )}
          </>
        )}
      </main>

      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto p-0">
          {selectedItem && (
            <>
              <div className="relative">
                {getItemPhotos(selectedItem).length > 0 ? (
                  <div className="relative aspect-square bg-stone-100">
                    <img
                      src={getItemPhotos(selectedItem)[currentPhotoIndex]}
                      alt={selectedItem.title}
                      className="w-full h-full object-contain"
                    />
                    {getItemPhotos(selectedItem).length > 1 && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2 shadow-lg"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2 shadow-lg"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {getItemPhotos(selectedItem).map((_, i) => (
                            <button
                              key={i}
                              onClick={(e) => { e.stopPropagation(); setCurrentPhotoIndex(i); }}
                              className={`w-2 h-2 rounded-full transition-colors ${i === currentPhotoIndex ? 'bg-purple-500' : 'bg-white/60'}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="aspect-video bg-stone-100 flex items-center justify-center">
                    <Gem className="w-20 h-20 text-stone-300" />
                  </div>
                )}
              </div>
              
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-serif font-bold text-stone-800">{selectedItem.title}</h2>
                    {selectedItem.category && (
                      <p className="text-purple-600 capitalize">{selectedItem.category}</p>
                    )}
                  </div>
                  {selectedItem.price && (
                    <p className="text-2xl font-bold text-purple-600">${selectedItem.price}</p>
                  )}
                </div>
                
                {selectedItem.materials && (
                  <div>
                    <p className="text-sm text-stone-500">Materials</p>
                    <p className="text-stone-700">{selectedItem.materials}</p>
                  </div>
                )}
                
                {selectedItem.description && (
                  <div>
                    <p className="text-sm text-stone-500">About this piece</p>
                    <p className="text-stone-700 whitespace-pre-wrap">{selectedItem.description}</p>
                  </div>
                )}
                
                <div className="pt-4 border-t space-y-3">
                  {selectedItem.price && selectedItem.inStock !== false && (
                    <Button className="w-full bg-purple-600 hover:bg-purple-700 py-6 text-lg" disabled>
                      <ShoppingCart className="h-5 w-5 mr-2" />
                      Buy Now - Coming Soon!
                    </Button>
                  )}
                  <div className="flex gap-2">
                    <a href={`mailto:upmichiganstatemovers@gmail.com?subject=Inquiry: ${selectedItem.title}`} className="flex-1">
                      <Button variant="outline" className="w-full border-purple-600 text-purple-600 hover:bg-purple-50">
                        <Mail className="h-4 w-4 mr-2" />
                        Contact to Purchase
                      </Button>
                    </a>
                    <a href="tel:906-285-9312">
                      <Button variant="outline" className="border-stone-300">
                        <Phone className="h-4 w-4" />
                      </Button>
                    </a>
                  </div>
                  {canEditItem(selectedItem) && (
                    <div className="flex gap-2 pt-2 border-t border-stone-200">
                      <Button
                        variant="outline"
                        className="flex-1 border-purple-400 text-purple-600 hover:bg-purple-50"
                        onClick={() => startEdit(selectedItem)}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                        onClick={() => { setItemToDelete(selectedItem); setDeleteConfirmOpen(true); }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input
                  value={editItem.title}
                  onChange={(e) => setEditItem({ ...editItem, title: e.target.value })}
                />
              </div>

              <div>
                <Label>Photos</Label>
                <div className="space-y-2">
                  {editPhotoUrls.map((url, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <img src={url} alt="" className="w-12 h-12 object-cover rounded" />
                      <span className="text-sm text-stone-600 truncate flex-1">{url.split('/').pop()}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditPhotoUrls(editPhotoUrls.filter((_, i) => i !== index))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      value={editPhotoUrl}
                      onChange={(e) => setEditPhotoUrl(e.target.value)}
                      placeholder="Paste image URL..."
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (editPhotoUrl.trim() && editPhotoUrls.length < 10) { setEditPhotoUrls([...editPhotoUrls, editPhotoUrl.trim()]); setEditPhotoUrl(""); } } }}
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={() => { if (editPhotoUrl.trim() && editPhotoUrls.length < 10) { setEditPhotoUrls([...editPhotoUrls, editPhotoUrl.trim()]); setEditPhotoUrl(""); } }} disabled={!editPhotoUrl.trim() || editPhotoUrls.length >= 10}>
                      <Plus className="h-4 w-4" />
                    </Button>
                    <label
                      className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10 cursor-pointer ${editPhotoUrls.length >= 10 || isEditUploading ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <input
                        type="file"
                        ref={editFileInputRef}
                        onChange={handleEditFileUpload}
                        accept="image/*"
                        multiple
                        className="sr-only"
                      />
                      {isEditUploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ImagePlus className="h-4 w-4" />}
                    </label>
                  </div>
                  <p className="text-xs text-stone-500">{editPhotoUrls.length}/10 photos</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Price</Label>
                  <Input
                    value={editItem.price || ""}
                    onChange={(e) => setEditItem({ ...editItem, price: e.target.value })}
                    placeholder="25.00"
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={editItem.category || ""} onValueChange={(v) => setEditItem({ ...editItem, category: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {categories.filter(c => c.value !== "all").map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Short Description</Label>
                <Input
                  value={editItem.shortDescription || ""}
                  onChange={(e) => setEditItem({ ...editItem, shortDescription: e.target.value })}
                />
              </div>

              <div>
                <Label>Materials</Label>
                <Input
                  value={editItem.materials || ""}
                  onChange={(e) => setEditItem({ ...editItem, materials: e.target.value })}
                />
              </div>

              <div>
                <Label>Full Description</Label>
                <Textarea
                  value={editItem.description || ""}
                  onChange={(e) => setEditItem({ ...editItem, description: e.target.value })}
                  rows={3}
                />
              </div>

              <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="w-full bg-purple-600 hover:bg-purple-700">
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
            <AlertDialogDescription>
              This will permanently remove "{itemToDelete?.title}" from the shop. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => itemToDelete && deleteMutation.mutate(itemToDelete.id)}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <footer className="bg-gradient-to-r from-slate-800 via-purple-900 to-slate-800 border-t border-purple-700/50 py-8 mt-8">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Leaf className="w-5 h-5 text-purple-300" />
            <span className="font-serif font-bold text-white">Nature Made Jewls</span>
            <Gem className="w-5 h-5 text-purple-300" />
          </div>
          <p className="text-slate-300 text-sm">Handcrafted in Michigan's Upper Peninsula</p>
          <p className="text-slate-400 text-xs mt-2">
            Part of the <Link href="/"><span className="text-purple-300 hover:underline">JC ON THE MOVE</span></Link> family
          </p>
        </div>
      </footer>
    </div>
  );
}
