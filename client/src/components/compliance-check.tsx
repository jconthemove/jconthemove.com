import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle } from "lucide-react";

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1920;
const MAX_YEAR = CURRENT_YEAR - 18;

export function ComplianceCheck({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [birthYear, setBirthYear] = useState(CURRENT_YEAR - 30);
  const [tosAccepted, setTosAccepted] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    // Staff accounts (admin, business_owner, employee) bypass compliance check —
    // they verified at account creation during the onboarding / approval flow.
    const isStaff = ["admin", "business_owner", "employee"].includes(user.role ?? "");
    if (isStaff) {
      setShowComplianceModal(false);
      return;
    }

    // For customer accounts, only require tosAccepted — dateOfBirth may be null
    // for accounts created before this field was added.
    if (user.tosAccepted) {
      setShowComplianceModal(false);
      return;
    }

    setShowComplianceModal(true);
  }, [user]);

  const complianceMutation = useMutation({
    mutationFn: async (data: { dateOfBirth: string; tosAccepted: boolean }) => {
      const res = await apiRequest("POST", "/api/auth/user/compliance", data);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.refetchQueries({ queryKey: ["/api/auth/user"], type: "active" });
      setShowComplianceModal(false);
      toast({
        title: "Account verified",
        description: "Your account has been successfully verified.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Verification failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!tosAccepted) {
      toast({
        title: "Terms of Service required",
        description: "You must accept the Terms of Service to continue.",
        variant: "destructive",
      });
      return;
    }

    const dateOfBirth = `${birthYear}-01-01`;
    complianceMutation.mutate({ dateOfBirth, tosAccepted });
  };

  if (isLoading) {
    return children;
  }

  return (
    <>
      <Dialog open={showComplianceModal} onOpenChange={() => {}}>
        <DialogContent className="max-w-[95vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto" data-testid="dialog-compliance">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg sm:text-xl break-words" data-testid="text-compliance-title">
              Age Verification & Terms of Service
            </DialogTitle>
            <DialogDescription className="text-sm break-words" data-testid="text-compliance-description">
              To comply with USA federal and state laws, we need to verify your age and obtain your agreement to our Terms of Service.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-3">
                <Label htmlFor="birth-year" data-testid="label-dob">
                  Birth Year
                </Label>
                <div className="text-center text-2xl font-semibold tabular-nums" data-testid="display-birth-year">
                  {birthYear}
                </div>
                <Slider
                  id="birth-year"
                  min={MIN_YEAR}
                  max={MAX_YEAR}
                  step={1}
                  value={[birthYear]}
                  onValueChange={(vals) => setBirthYear(vals[0])}
                  data-testid="slider-birth-year"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{MIN_YEAR}</span>
                  <span>{MAX_YEAR}</span>
                </div>
                <p className="text-sm text-muted-foreground break-words" data-testid="text-age-requirement">
                  You must be 18 years or older to use this service.
                </p>
              </div>

              <div className="flex items-start space-x-3 space-y-0">
                <Checkbox
                  id="tos"
                  checked={tosAccepted}
                  onCheckedChange={(checked) => setTosAccepted(checked as boolean)}
                  required
                  data-testid="checkbox-tos"
                  className="mt-1 flex-shrink-0"
                />
                <div className="space-y-1 leading-none flex-1 min-w-0">
                  <Label
                    htmlFor="tos"
                    className="text-sm font-normal cursor-pointer break-words"
                    data-testid="label-tos"
                  >
                    I am 18 years of age or older and agree to the{" "}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline hover:no-underline"
                      data-testid="link-terms"
                    >
                      Terms of Service
                    </a>
                  </Label>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-md border border-amber-200 dark:border-amber-800" data-testid="alert-legal-notice">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-300 break-words flex-1">
                  This verification is required by federal and state laws across all 50 states.
                </p>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                type="submit"
                disabled={complianceMutation.isPending}
                data-testid="button-submit-compliance"
                className="w-full sm:w-auto"
              >
                {complianceMutation.isPending ? "Verifying..." : "Verify & Continue"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {children}
    </>
  );
}
