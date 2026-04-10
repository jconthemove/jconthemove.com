import { useLocation, useSearch } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookingChatbot } from "@/components/booking-chatbot";

export default function EmployeeAddJob() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  const urlParams = new URLSearchParams(searchString);
  const prefilledService = urlParams.get('service') || "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 pb-20">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="outline"
              onClick={() => setLocation("/dashboard")}
              className="flex items-center gap-2 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-500 transition-all"
              data-testid="button-back-to-dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-orange-500/10 to-blue-600/20 blur-3xl -z-10"></div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-blue-400 via-orange-400 to-blue-400 bg-clip-text text-transparent mb-2 tracking-tight">
              Add a Job
            </h1>
            <p className="text-slate-400 text-base">
              Submit a job request on behalf of a customer. You'll earn rewards when the job is confirmed and completed.
            </p>
          </div>
        </div>

        <div className="h-[620px]">
          <BookingChatbot
            variant="employee"
            embedded={true}
            initialService={prefilledService}
            onSuccess={() => setLocation("/dashboard")}
          />
        </div>
      </div>
    </div>
  );
}
