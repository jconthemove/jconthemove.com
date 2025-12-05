import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StarRating } from "@/components/star-rating";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Loader2, Star, TrendingUp, Award, MessageSquare, ArrowLeft, 
  ClipboardList, CheckCircle, Clock, Send, Phone, Mail, MapPin,
  Calendar, User
} from "lucide-react";
import { Link } from "wouter";

interface UserData {
  id: string;
  role: string;
}

interface Review {
  id: string;
  leadId: string;
  userId: string;
  employeeId: string;
  rating: number;
  comment: string | null;
  rewardedAt: string | null;
  createdAt: string;
}

interface ReviewStats {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: Record<string, number>;
}

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  serviceType: string;
  fromAddress: string;
  toAddress: string | null;
  moveDate: string | null;
  status: string;
  createdAt: string;
}

export default function ReviewsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);

  const { data: user, isLoading: userLoading } = useQuery<UserData>({
    queryKey: ["/api/auth/user"],
  });

  const isAdmin = user?.role === 'admin' || user?.role === 'business_owner';

  const { data: leads = [], isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
    enabled: !!user?.id,
  });

  const { data: reviews = [], isLoading: reviewsLoading } = useQuery<Review[]>({
    queryKey: ["/api/reviews", { employeeId: user?.id }],
    enabled: !!user?.id,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ReviewStats>({
    queryKey: [`/api/reviews/employee/${user?.id}/stats`],
    enabled: !!user?.id,
  });

  const sendReviewRequestMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const response = await apiRequest("POST", `/api/leads/${leadId}/request-review`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Review request sent!",
        description: "The customer will receive an email to leave a review.",
      });
      setIsReviewDialogOpen(false);
      setSelectedLead(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send review request.",
        variant: "destructive",
      });
    },
  });

  const handleRequestReview = (lead: Lead) => {
    setSelectedLead(lead);
    setIsReviewDialogOpen(true);
  };

  const handleSendReviewRequest = () => {
    if (!selectedLead) return;
    sendReviewRequestMutation.mutate(selectedLead.id);
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Please log in to view reviews</p>
            <Link href="/employee-login">
              <Button className="mt-4">Log In</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = leadsLoading || reviewsLoading || statsLoading;

  const pendingLeads = leads.filter(lead => ['new', 'contacted', 'quoted'].includes(lead.status));
  const activeLeads = leads.filter(lead => ['accepted', 'in_progress', 'confirmed'].includes(lead.status));
  const completedLeads = leads.filter(lead => lead.status === 'completed');

  const getServiceLabel = (serviceType: string) => {
    const services: Record<string, string> = {
      residential: "Moving",
      commercial: "Commercial Moving",
      junk: "Junk Removal",
      snow: "Snow Removal",
      cleaning: "Move In/Out Cleaning",
      handyman: "Handyman",
      demolition: "Light Demo",
      flooring: "Flooring",
      painting: "Painting",
    };
    return services[serviceType] || serviceType;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; label: string }> = {
      new: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", label: "New" },
      contacted: { color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", label: "Contacted" },
      quoted: { color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200", label: "Quoted" },
      accepted: { color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", label: "Accepted" },
      confirmed: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200", label: "Confirmed" },
      in_progress: { color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", label: "In Progress" },
      completed: { color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200", label: "Completed" },
    };
    const config = statusConfig[status] || { color: "bg-gray-100 text-gray-800", label: status };
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const renderLeadCard = (lead: Lead, showReviewButton: boolean = false) => (
    <Card key={lead.id} className="hover:shadow-md transition-shadow" data-testid={`lead-card-${lead.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <User className="h-4 w-4" />
              {lead.firstName} {lead.lastName}
            </h3>
            <Badge variant="outline" className="mt-1">{getServiceLabel(lead.serviceType)}</Badge>
          </div>
          {getStatusBadge(lead.status)}
        </div>
        
        <div className="space-y-2 text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            <a href={`tel:${lead.phone}`} className="hover:underline">{lead.phone}</a>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span>{lead.fromAddress}</span>
          </div>
          {lead.moveDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>{new Date(lead.moveDate).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Link href={`/leads/${lead.id}`} className="flex-1">
            <Button variant="outline" className="w-full" size="sm" data-testid={`button-view-lead-${lead.id}`}>
              View Details
            </Button>
          </Link>
          {showReviewButton && (
            <Button 
              onClick={() => handleRequestReview(lead)} 
              size="sm"
              className="bg-yellow-500 hover:bg-yellow-600"
              data-testid={`button-request-review-${lead.id}`}
            >
              <Send className="h-4 w-4 mr-1" />
              Request Review
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/employee/dashboard">
              <Button variant="outline" className="flex items-center gap-2" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <ClipboardList className="h-8 w-8 text-primary" />
            Jobs & Reviews
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your leads and see customer feedback
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {stats && stats.totalReviews > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950 dark:to-orange-950 border-yellow-200 dark:border-yellow-800">
                  <CardContent className="pt-6 text-center">
                    <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                      {stats.averageRating.toFixed(1)}
                    </div>
                    <div className="flex items-center justify-center mt-2">
                      <StarRating rating={Math.round(stats.averageRating)} readonly size="sm" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Average Rating</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6 text-center">
                    <div className="text-3xl font-bold text-primary">{stats.totalReviews}</div>
                    <p className="text-xs text-muted-foreground mt-2">Total Reviews</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6 text-center">
                    <div className="text-3xl font-bold text-primary">{leads.length}</div>
                    <p className="text-xs text-muted-foreground mt-2">Total Leads</p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-green-200 dark:border-green-800">
                  <CardContent className="pt-6 text-center">
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {completedLeads.length}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Completed Jobs</p>
                  </CardContent>
                </Card>
              </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid grid-cols-4 w-full max-w-lg">
                <TabsTrigger value="all" className="flex items-center gap-1" data-testid="tab-all">
                  <ClipboardList className="h-4 w-4" />
                  <span className="hidden sm:inline">All</span> ({leads.length})
                </TabsTrigger>
                <TabsTrigger value="pending" className="flex items-center gap-1" data-testid="tab-pending">
                  <Clock className="h-4 w-4" />
                  <span className="hidden sm:inline">Pending</span> ({pendingLeads.length})
                </TabsTrigger>
                <TabsTrigger value="active" className="flex items-center gap-1" data-testid="tab-active">
                  <TrendingUp className="h-4 w-4" />
                  <span className="hidden sm:inline">Active</span> ({activeLeads.length})
                </TabsTrigger>
                <TabsTrigger value="completed" className="flex items-center gap-1" data-testid="tab-completed">
                  <CheckCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Done</span> ({completedLeads.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="space-y-4">
                {leads.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <ClipboardList className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium text-muted-foreground">No leads yet</p>
                      <p className="text-sm text-muted-foreground mt-1">New leads will appear here</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {leads.map(lead => renderLeadCard(lead, lead.status === 'completed'))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="pending" className="space-y-4">
                {pendingLeads.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Clock className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium text-muted-foreground">No pending leads</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pendingLeads.map(lead => renderLeadCard(lead))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="active" className="space-y-4">
                {activeLeads.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <TrendingUp className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium text-muted-foreground">No active jobs</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeLeads.map(lead => renderLeadCard(lead))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="completed" className="space-y-4">
                {completedLeads.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <CheckCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium text-muted-foreground">No completed jobs yet</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Completed jobs will appear here for review
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {completedLeads.map(lead => renderLeadCard(lead, true))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {reviews.length > 0 && (
              <Card className="mt-8">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Recent Customer Reviews
                  </CardTitle>
                  <CardDescription>
                    {reviews.length} review{reviews.length === 1 ? '' : 's'} from customers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {reviews.slice(0, 5).map((review) => (
                      <div
                        key={review.id}
                        className="border border-border rounded-lg p-4 space-y-3 hover:bg-accent/50 transition-colors"
                        data-testid={`review-${review.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <StarRating rating={review.rating} readonly />
                            <span className="text-sm text-muted-foreground">
                              {new Date(review.createdAt).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </span>
                          </div>
                          {review.rewardedAt && (
                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                              <Award className="h-3 w-3 mr-1" />
                              +{review.rating === 5 ? '50' : '25'} Tokens
                            </Badge>
                          )}
                        </div>

                        {review.comment ? (
                          <p className="text-foreground leading-relaxed">
                            "{review.comment}"
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            No written feedback provided
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Request Customer Review
              </DialogTitle>
              <DialogDescription>
                {selectedLead && (
                  <>Send a review request email to {selectedLead.firstName} {selectedLead.lastName}?</>
                )}
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4">
              {selectedLead && (
                <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                  <p className="text-sm">
                    <strong>Customer:</strong> {selectedLead.firstName} {selectedLead.lastName}
                  </p>
                  <p className="text-sm">
                    <strong>Email:</strong> {selectedLead.email}
                  </p>
                  <p className="text-sm">
                    <strong>Service:</strong> {getServiceLabel(selectedLead.serviceType)}
                  </p>
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-4">
                The customer will receive an email with a link to leave a review for this completed job.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsReviewDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSendReviewRequest}
                disabled={sendReviewRequestMutation.isPending}
                className="bg-primary hover:bg-primary/90"
                data-testid="button-send-review-request"
              >
                {sendReviewRequestMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Review Request
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
