import { useLocation, useSearch } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import QuoteForm from "@/components/QuoteForm";

export default function EmployeeAddJob() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  const urlParams = new URLSearchParams(searchString);
  const prefilledDate = urlParams.get('date') || "";
  const prefilledService = urlParams.get('service') || "";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="outline"
              onClick={() => setLocation("/dashboard")}
              className="flex items-center gap-2"
              data-testid="button-back-to-dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Add a Job</h1>
          <p className="text-muted-foreground mt-2">
            Submit a job request on behalf of a customer. You'll earn rewards when the job is confirmed and completed.
          </p>
        </div>

        <QuoteForm 
          variant="employee"
          prefilledDate={prefilledDate}
          prefilledService={prefilledService}
          onSuccess={() => setLocation("/dashboard")}
          showRewardsInfo={true}
        />
      </div>
    </div>
  );
}
