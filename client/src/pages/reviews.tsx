import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Loader2, Star, Quote, MessageSquare, ArrowLeft, 
  PenLine, CheckCircle, ExternalLink
} from "lucide-react";
import { SiGoogle, SiYelp, SiFacebook } from "react-icons/si";
import { Link } from "wouter";

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

interface TestimonialStats {
  totalCount: number;
  averageRating: number;
  platformCounts: Record<string, number>;
}

const reviewFormSchema = z.object({
  reviewerName: z.string().min(2, "Name must be at least 2 characters"),
  rating: z.number().min(1).max(5),
  content: z.string().min(10, "Review must be at least 10 characters"),
  serviceType: z.string().optional(),
});

type ReviewFormValues = z.infer<typeof reviewFormSchema>;

function StarRating({ rating, onClick, readonly = false, size = "md" }: { 
  rating: number; 
  onClick?: (rating: number) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };
  
  return (
    <div className="flex gap-1">
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
      return <CheckCircle className="h-4 w-4 text-green-500" />;
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

export default function ReviewsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState(5);

  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: {
      reviewerName: "",
      rating: 5,
      content: "",
      serviceType: "",
    },
  });

  const { data: testimonials = [], isLoading } = useQuery<Testimonial[]>({
    queryKey: ["/api/testimonials?status=published"],
  });

  const { data: stats } = useQuery<TestimonialStats>({
    queryKey: ["/api/testimonials/stats"],
  });

  const { data: googleReviewData } = useQuery<{ url: string | null }>({
    queryKey: ["/api/google-review-url"],
  });
  const googleReviewUrl = googleReviewData?.url || null;

  const submitReviewMutation = useMutation({
    mutationFn: async (data: ReviewFormValues) => {
      const response = await apiRequest("POST", "/api/testimonials", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Thank you for your review!",
        description: "Your review is now live on our page!",
      });
      setIsReviewDialogOpen(false);
      form.reset();
      setSelectedRating(5);
      queryClient.invalidateQueries({ queryKey: ["/api/testimonials?status=published"] });
      queryClient.invalidateQueries({ queryKey: ["/api/testimonials/stats"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit review. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ReviewFormValues) => {
    submitReviewMutation.mutate({ ...data, rating: selectedRating });
  };

  const getServiceLabel = (serviceType: string | null) => {
    if (!serviceType) return null;
    const services: Record<string, string> = {
      residential: "Moving",
      commercial: "Commercial Moving",
      junk: "Junk Removal",
      snow: "Snow Removal",
      cleaning: "Move In/Out Cleaning",
      handyman: "Handyman",
      demolition: "Light Demolition",
      flooring: "Flooring",
      painting: "Painting",
    };
    return services[serviceType] || serviceType;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/">
              <Button variant="ghost" className="flex items-center gap-2 text-white/70 hover:text-white hover:bg-white/10" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Button>
            </Link>
          </div>
          
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-4xl font-bold text-white mb-4">
              Customer Reviews
            </h1>
            <p className="text-lg text-slate-300">
              See what our customers are saying about JC ON THE MOVE
            </p>
            
            {stats && stats.totalCount > 0 && (
              <div className="flex items-center justify-center gap-6 mt-6">
                <div className="flex items-center gap-2">
                  <StarRating rating={Math.round(stats.averageRating)} readonly size="md" />
                  <span className="text-2xl font-bold text-yellow-400">
                    {stats.averageRating.toFixed(1)}
                  </span>
                </div>
                <div className="text-slate-400">
                  <span className="font-semibold text-white">{stats.totalCount}</span> reviews
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-3 mb-8">
          <a
            href={googleReviewUrl || undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={!googleReviewUrl ? (e) => { e.preventDefault(); setIsReviewDialogOpen(true); } : undefined}
          >
            <Button
              size="lg"
              className="bg-white hover:bg-slate-100 text-slate-800 font-semibold shadow-lg border border-slate-200"
              data-testid="button-google-review"
            >
              <SiGoogle className="h-5 w-5 mr-2 text-blue-500" />
              Write a Google Review
              <ExternalLink className="h-4 w-4 ml-2 text-slate-400" />
            </Button>
          </a>
          <Button 
            size="lg"
            onClick={() => setIsReviewDialogOpen(true)}
            className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-semibold shadow-lg"
            data-testid="button-leave-review"
          >
            <PenLine className="h-5 w-5 mr-2" />
            Leave a Review Here
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : testimonials.length === 0 ? (
          <Card className="max-w-lg mx-auto bg-slate-800/50 border-slate-700">
            <CardContent className="py-16 text-center">
              <MessageSquare className="h-16 w-16 text-slate-500 mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold text-white mb-2">No Reviews Yet</h3>
              <p className="text-slate-400 mb-6">
                Be the first to share your experience with JC ON THE MOVE!
              </p>
              <Button 
                onClick={() => setIsReviewDialogOpen(true)}
                className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
                data-testid="button-leave-first-review"
              >
                <PenLine className="h-4 w-4 mr-2" />
                Write the First Review
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((testimonial) => (
              <Card 
                key={testimonial.id} 
                className={`bg-slate-800/50 border-slate-700 hover:border-slate-600 hover:shadow-lg transition-all ${
                  testimonial.featured ? 'ring-2 ring-yellow-400' : ''
                }`}
                data-testid={`testimonial-card-${testimonial.id}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform={testimonial.sourcePlatform} />
                      <span className="text-sm text-slate-400">
                        {getPlatformLabel(testimonial.sourcePlatform)}
                      </span>
                    </div>
                    {testimonial.featured && (
                      <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                        Featured
                      </Badge>
                    )}
                  </div>
                  
                  <div className="mb-3">
                    <StarRating rating={testimonial.rating} readonly size="sm" />
                  </div>
                  
                  <Quote className="h-6 w-6 text-slate-600 mb-2" />
                  
                  <p className="text-slate-200 leading-relaxed mb-4 line-clamp-4">
                    {testimonial.content}
                  </p>
                  
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-700">
                    <div>
                      <p className="font-medium text-white">{testimonial.reviewerName}</p>
                      {testimonial.serviceType && (
                        <p className="text-xs text-slate-400">
                          {getServiceLabel(testimonial.serviceType)}
                        </p>
                      )}
                    </div>
                    {testimonial.reviewDate && (
                      <p className="text-xs text-slate-500">
                        {new Date(testimonial.reviewDate).toLocaleDateString('en-US', {
                          month: 'short',
                          year: 'numeric'
                        })}
                      </p>
                    )}
                  </div>
                  
                  {testimonial.sourceUrl && (
                    <a 
                      href={testimonial.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-400 hover:underline mt-3"
                    >
                      View original <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {stats && stats.totalCount > 0 && (
          <div className="mt-12 text-center">
            <p className="text-slate-400 mb-4">
              Reviews collected from multiple platforms
            </p>
            <div className="flex justify-center gap-6 flex-wrap">
              {Object.entries(stats.platformCounts).map(([platform, count]) => (
                <div key={platform} className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 px-4 py-2 rounded-full">
                  <PlatformIcon platform={platform === 'customer' ? null : platform} />
                  <span className="text-sm font-medium text-white">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenLine className="h-5 w-5 text-primary" />
              Leave a Review
            </DialogTitle>
            <DialogDescription>
              Share your experience with JC ON THE MOVE. Your feedback helps us improve!
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="reviewerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your full name" {...field} data-testid="input-reviewer-name" />
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
                name="serviceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Used (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-service-type">
                          <SelectValue placeholder="Select a service" />
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

              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Review</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Tell us about your experience"
                        className="min-h-[120px]"
                        {...field}
                        data-testid="textarea-review-content"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="gap-2 sm:gap-0">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsReviewDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={submitReviewMutation.isPending}
                  className="bg-primary hover:bg-primary/90"
                  data-testid="button-submit-review"
                >
                  {submitReviewMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Review"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
