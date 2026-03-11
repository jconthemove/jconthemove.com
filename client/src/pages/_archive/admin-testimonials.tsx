import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Loader2, Star, ArrowLeft, Plus, Trash2, Eye, EyeOff,
  Check, X, Upload, Edit, MessageSquare, Award
} from "lucide-react";
import { SiGoogle, SiYelp, SiFacebook } from "react-icons/si";
import { Link } from "wouter";

interface UserData {
  id: string;
  role: string;
}

interface Testimonial {
  id: string;
  reviewerName: string;
  rating: number;
  content: string;
  serviceType: string | null;
  sourceType: string;
  sourcePlatform: string | null;
  sourceUrl: string | null;
  reviewDate: string | null;
  status: string;
  featured: boolean;
  verified: boolean;
  createdAt: string;
}

const importFormSchema = z.object({
  reviewerName: z.string().min(1, "Name is required"),
  rating: z.number().min(1).max(5),
  content: z.string().min(1, "Review content is required"),
  serviceType: z.string().optional(),
  sourcePlatform: z.string().min(1, "Platform is required"),
  sourceUrl: z.string().optional(),
  reviewDate: z.string().optional(),
  featured: z.boolean().default(false),
});

type ImportFormValues = z.infer<typeof importFormSchema>;

function StarRating({ rating, onClick, readonly = false, size = "md" }: { 
  rating: number; 
  onClick?: (rating: number) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };
  
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => !readonly && onClick?.(star)}
          disabled={readonly}
          className={`${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} transition-transform`}
        >
          <Star
            className={`${sizeClasses[size]} ${
              star <= rating 
                ? 'text-yellow-400 fill-yellow-400' 
                : 'text-gray-300 dark:text-gray-600'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function PlatformIcon({ platform }: { platform: string | null }) {
  switch (platform) {
    case 'google':
      return <SiGoogle className="h-4 w-4 text-blue-500" />;
    case 'yelp':
      return <SiYelp className="h-4 w-4 text-red-500" />;
    case 'facebook':
      return <SiFacebook className="h-4 w-4 text-blue-600" />;
    case 'hireahelper':
      return <span className="text-xs font-bold text-green-600">HAH</span>;
    default:
      return <MessageSquare className="h-4 w-4 text-gray-500" />;
  }
}

function getPlatformLabel(platform: string | null): string {
  switch (platform) {
    case 'google': return 'Google';
    case 'yelp': return 'Yelp';
    case 'facebook': return 'Facebook';
    case 'hireahelper': return 'HireAHelper';
    default: return 'Customer';
  }
}

export default function AdminTestimonialsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState(5);
  const [testimonialToDelete, setTestimonialToDelete] = useState<string | null>(null);

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: {
      reviewerName: "",
      rating: 5,
      content: "",
      serviceType: "",
      sourcePlatform: "",
      sourceUrl: "",
      reviewDate: "",
      featured: false,
    },
  });

  const { data: user, isLoading: userLoading } = useQuery<UserData>({
    queryKey: ["/api/auth/user"],
  });

  const isAdmin = user?.role === 'admin' || user?.role === 'business_owner';

  const { data: allTestimonials = [], isLoading } = useQuery<Testimonial[]>({
    queryKey: ["/api/admin/testimonials"],
    enabled: isAdmin,
  });

  const pendingTestimonials = allTestimonials.filter(t => t.status === 'pending');
  const publishedTestimonials = allTestimonials.filter(t => t.status === 'published');
  const hiddenTestimonials = allTestimonials.filter(t => t.status === 'hidden');

  const getFilteredTestimonials = () => {
    switch (activeTab) {
      case 'pending': return pendingTestimonials;
      case 'published': return publishedTestimonials;
      case 'hidden': return hiddenTestimonials;
      default: return allTestimonials;
    }
  };

  const importMutation = useMutation({
    mutationFn: async (data: ImportFormValues) => {
      const response = await apiRequest("POST", "/api/testimonials/import", {
        testimonials: [{
          ...data,
          rating: selectedRating,
        }]
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Review imported!",
        description: "The review has been added and published.",
      });
      setIsImportDialogOpen(false);
      form.reset();
      setSelectedRating(5);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/testimonials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/testimonials?status=published"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to import review.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Testimonial> }) => {
      const response = await apiRequest("PATCH", `/api/testimonials/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Testimonial updated!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/testimonials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/testimonials?status=published"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update testimonial.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/testimonials/${id}`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Testimonial deleted!" });
      setTestimonialToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/testimonials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/testimonials?status=published"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete testimonial.",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (id: string) => {
    updateMutation.mutate({ id, updates: { status: 'published' } });
  };

  const handleReject = (id: string) => {
    updateMutation.mutate({ id, updates: { status: 'hidden' } });
  };

  const handleToggleFeatured = (id: string, currentValue: boolean) => {
    updateMutation.mutate({ id, updates: { featured: !currentValue } });
  };

  const handleTogglePublish = (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'published' ? 'hidden' : 'published';
    updateMutation.mutate({ id, updates: { status: newStatus } });
  };

  const onSubmit = (data: ImportFormValues) => {
    importMutation.mutate({ ...data, rating: selectedRating });
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Admin access required</p>
            <Link href="/">
              <Button className="mt-4">Go Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/in-god-we-trust">
              <Button variant="outline" className="flex items-center gap-2" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <MessageSquare className="h-8 w-8 text-primary" />
                Manage Reviews
              </h1>
              <p className="text-muted-foreground mt-2">
                Import, approve, and manage customer testimonials
              </p>
            </div>
            
            <Button 
              onClick={() => setIsImportDialogOpen(true)}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-import-review"
            >
              <Plus className="h-4 w-4 mr-2" />
              Import Review
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-primary">{allTestimonials.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Total Reviews</p>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-yellow-600">{pendingTestimonials.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Pending Approval</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-green-600">{publishedTestimonials.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Published</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-primary">
                {allTestimonials.filter(t => t.featured).length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Featured</p>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid grid-cols-4 w-full max-w-md">
              <TabsTrigger value="all" data-testid="tab-all">All ({allTestimonials.length})</TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-pending">Pending ({pendingTestimonials.length})</TabsTrigger>
              <TabsTrigger value="published" data-testid="tab-published">Published ({publishedTestimonials.length})</TabsTrigger>
              <TabsTrigger value="hidden" data-testid="tab-hidden">Hidden ({hiddenTestimonials.length})</TabsTrigger>
            </TabsList>

            <div className="space-y-4">
              {getFilteredTestimonials().length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium text-muted-foreground">No reviews in this category</p>
                    {activeTab === 'all' && (
                      <Button 
                        onClick={() => setIsImportDialogOpen(true)}
                        className="mt-4"
                        data-testid="button-import-first-review"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Import Your First Review
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {getFilteredTestimonials().map((testimonial) => (
                    <Card 
                      key={testimonial.id} 
                      className={`${testimonial.featured ? 'ring-2 ring-yellow-400' : ''}`}
                      data-testid={`testimonial-admin-card-${testimonial.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <PlatformIcon platform={testimonial.sourcePlatform} />
                              <span className="font-medium">{testimonial.reviewerName}</span>
                              <Badge variant={
                                testimonial.status === 'published' ? 'default' :
                                testimonial.status === 'pending' ? 'secondary' : 'outline'
                              }>
                                {testimonial.status}
                              </Badge>
                              {testimonial.featured && (
                                <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                                  <Award className="h-3 w-3 mr-1" />
                                  Featured
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {getPlatformLabel(testimonial.sourcePlatform)}
                              </span>
                            </div>
                            
                            <div className="mb-2">
                              <StarRating rating={testimonial.rating} readonly size="sm" />
                            </div>
                            
                            <p className="text-sm text-foreground line-clamp-2">
                              {testimonial.content}
                            </p>
                            
                            {testimonial.reviewDate && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Review date: {new Date(testimonial.reviewDate).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            {testimonial.status === 'pending' && (
                              <>
                                <Button 
                                  size="sm" 
                                  onClick={() => handleApprove(testimonial.id)}
                                  className="bg-green-600 hover:bg-green-700"
                                  data-testid={`button-approve-${testimonial.id}`}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Approve
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => handleReject(testimonial.id)}
                                  data-testid={`button-reject-${testimonial.id}`}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Reject
                                </Button>
                              </>
                            )}
                            
                            {testimonial.status !== 'pending' && (
                              <>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => handleTogglePublish(testimonial.id, testimonial.status)}
                                  data-testid={`button-toggle-publish-${testimonial.id}`}
                                >
                                  {testimonial.status === 'published' ? (
                                    <>
                                      <EyeOff className="h-4 w-4 mr-1" />
                                      Hide
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="h-4 w-4 mr-1" />
                                      Publish
                                    </>
                                  )}
                                </Button>
                                
                                <Button 
                                  size="sm" 
                                  variant={testimonial.featured ? "default" : "outline"}
                                  onClick={() => handleToggleFeatured(testimonial.id, testimonial.featured)}
                                  className={testimonial.featured ? "bg-yellow-500 hover:bg-yellow-600" : ""}
                                  data-testid={`button-toggle-featured-${testimonial.id}`}
                                >
                                  <Award className="h-4 w-4 mr-1" />
                                  {testimonial.featured ? 'Unfeature' : 'Feature'}
                                </Button>
                              </>
                            )}
                            
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => setTestimonialToDelete(testimonial.id)}
                              data-testid={`button-delete-${testimonial.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </Tabs>
        )}
      </div>

      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Import Review
            </DialogTitle>
            <DialogDescription>
              Import a review from Yelp, Google, Facebook, or HireAHelper
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="sourcePlatform"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Platform</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-platform">
                          <SelectValue placeholder="Select platform" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="google">
                          <div className="flex items-center gap-2">
                            <SiGoogle className="h-4 w-4 text-blue-500" />
                            Google
                          </div>
                        </SelectItem>
                        <SelectItem value="yelp">
                          <div className="flex items-center gap-2">
                            <SiYelp className="h-4 w-4 text-red-500" />
                            Yelp
                          </div>
                        </SelectItem>
                        <SelectItem value="facebook">
                          <div className="flex items-center gap-2">
                            <SiFacebook className="h-4 w-4 text-blue-600" />
                            Facebook
                          </div>
                        </SelectItem>
                        <SelectItem value="hireahelper">HireAHelper</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reviewerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reviewer Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John S." {...field} data-testid="input-reviewer-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>Rating</FormLabel>
                <div className="flex items-center gap-2">
                  <StarRating 
                    rating={selectedRating} 
                    onClick={(rating) => {
                      setSelectedRating(rating);
                      form.setValue('rating', rating);
                    }}
                    size="lg"
                  />
                  <span className="text-lg font-medium text-muted-foreground">
                    {selectedRating}/5
                  </span>
                </div>
              </div>

              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Review Content</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Paste the review text here..."
                        className="min-h-[100px]"
                        {...field}
                        data-testid="textarea-review-content"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="reviewDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Review Date (Optional)</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-review-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="serviceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-service-type">
                            <SelectValue placeholder="Select service" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="residential">Moving</SelectItem>
                          <SelectItem value="commercial">Commercial Moving</SelectItem>
                          <SelectItem value="junk">Junk Removal</SelectItem>
                          <SelectItem value="snow">Snow Removal</SelectItem>
                          <SelectItem value="cleaning">Move In/Out Cleaning</SelectItem>
                          <SelectItem value="handyman">Handyman</SelectItem>
                          <SelectItem value="demolition">Light Demolition</SelectItem>
                          <SelectItem value="flooring">Flooring</SelectItem>
                          <SelectItem value="painting">Painting</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="sourceUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Original Review URL (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="https://..." 
                        {...field} 
                        data-testid="input-source-url" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="featured"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Featured Review</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Show this review prominently on the reviews page
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-featured"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter className="gap-2 sm:gap-0">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsImportDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={importMutation.isPending}
                  className="bg-primary hover:bg-primary/90"
                  data-testid="button-import-submit"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Import Review
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!testimonialToDelete} onOpenChange={() => setTestimonialToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Review</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this review? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestimonialToDelete(null)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => testimonialToDelete && deleteMutation.mutate(testimonialToDelete)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
