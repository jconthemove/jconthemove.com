import { useState, useCallback, useRef } from "react";
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
import { ArrowLeft, Gem, Leaf, Search, Plus, ChevronLeft, ChevronRight, Mail, Phone, ShoppingCart, ImagePlus, X, Heart } from "lucide-react";

interface JewelryItem {
  id: string;
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
  const [newItem, setNewItem] = useState({
    title: "",
    shortDescription: "",
    description: "",
    price: "",
    category: "",
    materials: "",
    imageUrl: "",
  });

  const isAdmin = user?.role === 'admin' || user?.role === 'business_owner';
  const canAdd = isAdmin || user?.role === 'employee';

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
    <div className="min-h-screen bg-stone-100">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-stone-600">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Leaf className="w-5 h-5 text-emerald-600" />
            <h1 className="font-serif text-xl font-bold text-stone-800">Nature Made Jewls</h1>
            <Gem className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex items-center gap-2">
            {!user && (
              <Link href="/employee-login?redirect=/nature-made-jewls">
                <Button variant="ghost" size="sm" className="text-emerald-600 font-semibold">
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

      <div className="sticky top-14 z-40 bg-white border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input
                placeholder="Search handcrafted jewelry..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-stone-50 border-stone-200"
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
                    ? "bg-emerald-600 hover:bg-emerald-700 whitespace-nowrap" 
                    : "border-stone-300 whitespace-nowrap"}
                >
                  {cat.label}
                </Button>
              ))}
            </div>
            {canAdd ? (
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-amber-500 to-emerald-600 whitespace-nowrap">
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

                    <Button onClick={handleCreate} disabled={createMutation.isPending} className="w-full bg-emerald-600 hover:bg-emerald-700">
                      {createMutation.isPending ? "Adding..." : "Add Item"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : (
              <Link href="/employee-login?redirect=/nature-made-jewls">
                <Button className="bg-gradient-to-r from-amber-500 to-emerald-600 whitespace-nowrap">
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
                className="mt-6 bg-gradient-to-r from-amber-500 to-emerald-600"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Your First Item
              </Button>
            )}
            {!user && (
              <div className="mt-6">
                <Link href="/employee-login?redirect=/nature-made-jewls">
                  <Button variant="outline" className="border-emerald-600 text-emerald-600">
                    Login to Add Items
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-3 space-y-3">
            {items.map((item) => {
              const photos = getItemPhotos(item);
              const randomHeight = Math.random() > 0.5 ? 'aspect-[3/4]' : 'aspect-square';
              
              return (
                <Card
                  key={item.id}
                  className="break-inside-avoid mb-3 overflow-hidden cursor-pointer group hover:shadow-xl transition-all border-0 bg-white"
                  onClick={() => openItem(item)}
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
                      <p className="text-emerald-600 font-semibold mt-1">${item.price}</p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
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
                              className={`w-2 h-2 rounded-full transition-colors ${i === currentPhotoIndex ? 'bg-emerald-500' : 'bg-white/60'}`}
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
                      <p className="text-emerald-600 capitalize">{selectedItem.category}</p>
                    )}
                  </div>
                  {selectedItem.price && (
                    <p className="text-2xl font-bold text-emerald-600">${selectedItem.price}</p>
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
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-700 py-6 text-lg" disabled>
                      <ShoppingCart className="h-5 w-5 mr-2" />
                      Buy Now - Coming Soon!
                    </Button>
                  )}
                  <div className="flex gap-2">
                    <a href={`mailto:upmichiganstatemovers@gmail.com?subject=Inquiry: ${selectedItem.title}`} className="flex-1">
                      <Button variant="outline" className="w-full border-emerald-600 text-emerald-600 hover:bg-emerald-50">
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
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <footer className="bg-white border-t py-8 mt-8">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Leaf className="w-5 h-5 text-emerald-600" />
            <span className="font-serif font-bold text-stone-800">Nature Made Jewls</span>
            <Gem className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-stone-500 text-sm">Handcrafted in Michigan's Upper Peninsula</p>
          <p className="text-stone-400 text-xs mt-2">
            Part of the <Link href="/"><span className="text-emerald-600 hover:underline">JC ON THE MOVE</span></Link> family
          </p>
        </div>
      </footer>
    </div>
  );
}
