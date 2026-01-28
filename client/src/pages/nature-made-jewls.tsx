import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Gem, Leaf, Search, Plus, X, Mail, Phone } from "lucide-react";

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
  { value: "all", label: "All Items" },
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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
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

  const { data: items = [], isLoading } = useQuery<JewelryItem[]>({
    queryKey: ["/api/jewelry", { category: selectedCategory !== "all" ? selectedCategory : undefined, search: searchQuery }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== "all") params.append("category", selectedCategory);
      if (searchQuery) params.append("search", searchQuery);
      const res = await fetch(`/api/jewelry?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (item: typeof newItem) => apiRequest("POST", "/api/jewelry", item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jewelry"] });
      setIsCreateOpen(false);
      setNewItem({ title: "", shortDescription: "", description: "", price: "", category: "", materials: "", imageUrl: "" });
      toast({ title: "Item created successfully" });
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
    createMutation.mutate(newItem);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 via-emerald-900 to-stone-900">
      <header className="p-6 flex items-center justify-between">
        <Link href="/">
          <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <a href="mailto:upmichiganstatemovers@gmail.com">
            <Button variant="ghost" size="sm" className="text-emerald-300 hover:text-white">
              <Mail className="h-4 w-4" />
            </Button>
          </a>
          <a href="tel:906-285-9312">
            <Button variant="ghost" size="sm" className="text-emerald-300 hover:text-white">
              <Phone className="h-4 w-4" />
            </Button>
          </a>
        </div>
      </header>

      <main className="container mx-auto px-4 pb-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4">
            <Leaf className="w-8 h-8 text-emerald-400" />
            <Gem className="w-10 h-10 text-amber-400" />
            <Leaf className="w-8 h-8 text-emerald-400 transform scale-x-[-1]" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white mb-2">
            Nature Made Jewls
          </h1>
          <p className="text-emerald-200">Handcrafted jewelry inspired by nature</p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 mb-8 max-w-3xl mx-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-emerald-400" />
            <Input
              placeholder="Search jewelry..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/10 border-emerald-500/30 text-white placeholder:text-emerald-300/50"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full md:w-48 bg-white/10 border-emerald-500/30 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-emerald-950 border-emerald-500/30 text-white max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-white">Add New Item</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label className="text-emerald-200">Title *</Label>
                    <Input
                      value={newItem.title}
                      onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                      className="bg-white/10 border-emerald-500/30 text-white"
                      placeholder="Item name"
                    />
                  </div>
                  <div>
                    <Label className="text-emerald-200">Short Description</Label>
                    <Input
                      value={newItem.shortDescription}
                      onChange={(e) => setNewItem({ ...newItem, shortDescription: e.target.value })}
                      className="bg-white/10 border-emerald-500/30 text-white"
                      placeholder="One line description"
                    />
                  </div>
                  <div>
                    <Label className="text-emerald-200">Category</Label>
                    <Select value={newItem.category} onValueChange={(v) => setNewItem({ ...newItem, category: v })}>
                      <SelectTrigger className="bg-white/10 border-emerald-500/30 text-white">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.filter(c => c.value !== "all").map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-emerald-200">Price</Label>
                    <Input
                      value={newItem.price}
                      onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                      className="bg-white/10 border-emerald-500/30 text-white"
                      placeholder="$25.00"
                    />
                  </div>
                  <div>
                    <Label className="text-emerald-200">Materials</Label>
                    <Input
                      value={newItem.materials}
                      onChange={(e) => setNewItem({ ...newItem, materials: e.target.value })}
                      className="bg-white/10 border-emerald-500/30 text-white"
                      placeholder="e.g., Sterling silver, turquoise"
                    />
                  </div>
                  <div>
                    <Label className="text-emerald-200">Image URL</Label>
                    <Input
                      value={newItem.imageUrl}
                      onChange={(e) => setNewItem({ ...newItem, imageUrl: e.target.value })}
                      className="bg-white/10 border-emerald-500/30 text-white"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <Label className="text-emerald-200">Full Description</Label>
                    <Textarea
                      value={newItem.description}
                      onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                      className="bg-white/10 border-emerald-500/30 text-white"
                      placeholder="Detailed description..."
                      rows={3}
                    />
                  </div>
                  <Button 
                    onClick={handleCreate} 
                    disabled={createMutation.isPending}
                    className="w-full bg-gradient-to-r from-amber-500 to-emerald-600"
                  >
                    {createMutation.isPending ? "Creating..." : "Create Item"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {isLoading ? (
          <div className="text-center text-emerald-300 py-12">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Gem className="w-16 h-16 mx-auto text-emerald-500/50 mb-4" />
            <p className="text-emerald-300 text-lg">No items found</p>
            <p className="text-emerald-400/60 text-sm mt-2">
              {searchQuery ? "Try a different search term" : "Check back soon for new pieces"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => (
              <Card 
                key={item.id}
                className="bg-white/5 border-emerald-500/20 hover:border-amber-400/50 transition-all cursor-pointer overflow-hidden group"
                onClick={() => setSelectedItem(item)}
              >
                <div className="aspect-square bg-gradient-to-br from-emerald-800/50 to-stone-800/50 relative overflow-hidden">
                  {item.imageUrl ? (
                    <img 
                      src={item.imageUrl} 
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Gem className="w-12 h-12 text-emerald-500/50" />
                    </div>
                  )}
                  {item.featured && (
                    <span className="absolute top-2 left-2 bg-amber-500 text-white text-xs px-2 py-1 rounded">Featured</span>
                  )}
                  {!item.inStock && (
                    <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded">Sold</span>
                  )}
                </div>
                <CardContent className="p-3">
                  <h3 className="font-medium text-white truncate">{item.title}</h3>
                  <p className="text-emerald-300/80 text-sm truncate">{item.shortDescription || item.category || "Handcrafted piece"}</p>
                  {item.price && (
                    <p className="text-amber-400 font-semibold mt-1">${item.price}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
          <DialogContent className="bg-emerald-950 border-emerald-500/30 text-white max-w-lg">
            {selectedItem && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-white text-xl">{selectedItem.title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {selectedItem.imageUrl && (
                    <div className="aspect-square rounded-lg overflow-hidden bg-stone-800">
                      <img 
                        src={selectedItem.imageUrl} 
                        alt={selectedItem.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  {selectedItem.price && (
                    <p className="text-2xl font-bold text-amber-400">${selectedItem.price}</p>
                  )}
                  {selectedItem.category && (
                    <p className="text-emerald-300 capitalize">{selectedItem.category}</p>
                  )}
                  {selectedItem.materials && (
                    <div>
                      <p className="text-emerald-400 text-sm">Materials:</p>
                      <p className="text-white">{selectedItem.materials}</p>
                    </div>
                  )}
                  {selectedItem.description && (
                    <div>
                      <p className="text-emerald-400 text-sm">Description:</p>
                      <p className="text-emerald-100">{selectedItem.description}</p>
                    </div>
                  )}
                  <div className="pt-4 border-t border-emerald-500/30">
                    <p className="text-emerald-300 text-sm mb-3">Interested in this piece?</p>
                    <div className="flex gap-2">
                      <a href={`mailto:upmichiganstatemovers@gmail.com?subject=Inquiry: ${selectedItem.title}`} className="flex-1">
                        <Button className="w-full bg-gradient-to-r from-amber-500 to-emerald-600">
                          <Mail className="h-4 w-4 mr-2" />
                          Contact Us
                        </Button>
                      </a>
                      <a href="tel:906-285-9312">
                        <Button variant="outline" className="border-emerald-500 text-emerald-300">
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

        <footer className="text-center mt-16 pt-8 border-t border-emerald-500/20">
          <p className="text-emerald-300 text-sm">Upper Peninsula, Michigan</p>
        </footer>
      </main>
    </div>
  );
}
