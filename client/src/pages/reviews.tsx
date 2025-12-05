import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/star-rating";
import { Loader2, Star, TrendingUp, Award, MessageSquare, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface User {
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

export default function ReviewsPage() {
  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  const { data: reviews = [], isLoading: reviewsLoading } = useQuery<Review[]>({
    queryKey: ["/api/reviews", { employeeId: user?.id }],
    enabled: !!user?.id,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ReviewStats>({
    queryKey: [`/api/reviews/employee/${user?.id}/stats`],
    enabled: !!user?.id,
  });

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

  const isLoading = reviewsLoading || statsLoading;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            <Star className="h-8 w-8 text-yellow-500" />
            My Reviews
          </h1>
          <p className="text-muted-foreground mt-2">
            See what customers are saying about your work
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Statistics Cards */}
            {stats && stats.totalReviews > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950 dark:to-orange-950 border-yellow-200 dark:border-yellow-800">
                  <CardContent className="pt-6 text-center">
                    <div className="text-4xl font-bold text-yellow-600 dark:text-yellow-400">
                      {stats.averageRating.toFixed(1)}
                    </div>
                    <div className="flex items-center justify-center mt-2">
                      <StarRating rating={Math.round(stats.averageRating)} readonly size="sm" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">Average Rating</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6 text-center">
                    <div className="text-4xl font-bold text-primary">{stats.totalReviews}</div>
                    <p className="text-sm text-muted-foreground mt-2">Total Reviews</p>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-green-200 dark:border-green-800">
                  <CardContent className="pt-6 text-center">
                    <div className="text-4xl font-bold text-green-600 dark:text-green-400">
                      {stats.ratingDistribution['5'] || 0}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">5-Star Reviews</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6 text-center">
                    <div className="text-4xl font-bold text-primary">
                      {stats.totalReviews > 0 
                        ? ((stats.ratingDistribution['5'] || 0) / stats.totalReviews * 100).toFixed(0)
                        : 0}%
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">5-Star Rate</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Rating Distribution */}
            {stats && stats.totalReviews > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Rating Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[5, 4, 3, 2, 1].map((rating) => {
                      const count = stats.ratingDistribution[rating.toString()] || 0;
                      const percentage = stats.totalReviews > 0 ? (count / stats.totalReviews) * 100 : 0;
                      return (
                        <div key={rating} className="flex items-center gap-3">
                          <div className="flex items-center gap-1 w-20">
                            <span className="text-sm font-medium">{rating}</span>
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          </div>
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-yellow-500 rounded-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-16 text-right">
                            {count} ({percentage.toFixed(0)}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Reviews List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Customer Feedback
                </CardTitle>
                <CardDescription>
                  {reviews.length === 0 
                    ? "No reviews yet - complete jobs to receive customer feedback" 
                    : `${reviews.length} review${reviews.length === 1 ? '' : 's'} from customers`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reviews.length === 0 ? (
                  <div className="text-center py-12">
                    <Star className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium text-muted-foreground">No reviews yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Complete jobs to start receiving customer reviews
                    </p>
                    <Link href="/dashboard">
                      <Button className="mt-4" variant="outline">
                        View Available Jobs
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reviews.map((review) => (
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
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
