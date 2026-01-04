import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Clock, FileText, AlertTriangle, CheckCircle, XCircle, Send, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

const swapRequestSchema = z.object({
  jcmovesAmount: z.string().min(1, "Amount is required"),
  desiredAsset: z.string().min(1, "Please select an asset"),
  destinationWallet: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana wallet address"),
  acknowledgedManualProcess: z.boolean().refine(val => val === true, "You must acknowledge this"),
  acknowledgedNoGuaranteedRate: z.boolean().refine(val => val === true, "You must acknowledge this"),
  acknowledgedTerms: z.boolean().refine(val => val === true, "You must acknowledge this"),
});

type SwapRequestForm = z.infer<typeof swapRequestSchema>;

interface SwapRequest {
  id: string;
  jcmovesAmount: string;
  desiredAsset: string;
  destinationWallet: string;
  status: string;
  createdAt: string;
  reviewedAt?: string;
  declineReason?: string;
  fulfilledAmount?: string;
  fulfillmentTxHash?: string;
  fulfilledAt?: string;
}

interface SwapRules {
  minSwapAmount: string;
  maxSwapAmount: string;
  maxPerUserPerMonth: string;
  approvedAssets: string[];
  swapsEnabled: boolean;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" /> Pending Review</Badge>;
    case "approved":
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30"><CheckCircle className="w-3 h-3 mr-1" /> Approved</Badge>;
    case "declined":
      return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30"><XCircle className="w-3 h-3 mr-1" /> Declined</Badge>;
    case "completed":
      return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function RequestSwapPage() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(true);

  const { data: rules } = useQuery<SwapRules>({
    queryKey: ["/api/swap-rules"],
  });

  const { data: myRequests, isLoading: loadingRequests } = useQuery<{ requests: SwapRequest[] }>({
    queryKey: ["/api/swap-requests/my"],
  });

  const form = useForm<SwapRequestForm>({
    resolver: zodResolver(swapRequestSchema),
    defaultValues: {
      jcmovesAmount: "",
      desiredAsset: "",
      destinationWallet: "",
      acknowledgedManualProcess: false,
      acknowledgedNoGuaranteedRate: false,
      acknowledgedTerms: false,
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: SwapRequestForm) => {
      const response = await apiRequest("POST", "/api/swap-requests", {
        ...data,
        jcmovesAmount: parseFloat(data.jcmovesAmount),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Request Submitted",
        description: "Your swap request has been submitted for manual review.",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/swap-requests/my"] });
      setShowForm(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SwapRequestForm) => {
    submitMutation.mutate(data);
  };

  if (!rules?.swapsEnabled) {
    return (
      <div className="container max-w-2xl mx-auto p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Swap requests are currently disabled. Please check back later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/employee-dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Request External Swap</h1>
          <p className="text-muted-foreground">Manual review required</p>
        </div>
      </div>

      <Alert className="border-amber-500/30 bg-amber-500/5">
        <FileText className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-700 dark:text-amber-400">
          <strong>Important:</strong> This is a request for manual processing. No prices are guaranteed. 
          Our team will review your request and complete the swap off-platform if approved.
        </AlertDescription>
      </Alert>

      <div className="grid md:grid-cols-2 gap-6">
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Submit Request
              </CardTitle>
              <CardDescription>
                Request to convert your JCMOVES tokens
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="jcmovesAmount">Amount of JCMOVES</Label>
                  <Input
                    id="jcmovesAmount"
                    data-testid="input-jcmoves-amount"
                    type="number"
                    step="0.01"
                    placeholder={`Min: ${rules?.minSwapAmount || "100"}`}
                    {...form.register("jcmovesAmount")}
                  />
                  <p className="text-xs text-muted-foreground">
                    Min: {rules?.minSwapAmount || "100"} | Max: {rules?.maxSwapAmount || "50,000"} per request
                  </p>
                  {form.formState.errors.jcmovesAmount && (
                    <p className="text-xs text-red-500">{form.formState.errors.jcmovesAmount.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="desiredAsset">Desired Asset</Label>
                  <Select
                    value={form.watch("desiredAsset")}
                    onValueChange={(value) => form.setValue("desiredAsset", value)}
                  >
                    <SelectTrigger data-testid="select-desired-asset">
                      <SelectValue placeholder="Select asset to receive" />
                    </SelectTrigger>
                    <SelectContent>
                      {(rules?.approvedAssets || ["SOL", "USDC"]).map((asset) => (
                        <SelectItem key={asset} value={asset}>{asset}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.desiredAsset && (
                    <p className="text-xs text-red-500">{form.formState.errors.desiredAsset.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="destinationWallet">Your Wallet Address</Label>
                  <Input
                    id="destinationWallet"
                    data-testid="input-destination-wallet"
                    placeholder="Enter your Solana wallet address"
                    {...form.register("destinationWallet")}
                  />
                  <p className="text-xs text-muted-foreground">
                    The wallet where you want to receive the asset
                  </p>
                  {form.formState.errors.destinationWallet && (
                    <p className="text-xs text-red-500">{form.formState.errors.destinationWallet.message}</p>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <p className="text-sm font-medium">Required Acknowledgements</p>
                  
                  <div className="flex items-start space-x-2">
                    <Checkbox
                      id="acknowledgedManualProcess"
                      data-testid="checkbox-manual-process"
                      checked={form.watch("acknowledgedManualProcess")}
                      onCheckedChange={(checked) => form.setValue("acknowledgedManualProcess", checked === true)}
                    />
                    <Label htmlFor="acknowledgedManualProcess" className="text-sm leading-tight">
                      I understand this request will be reviewed and processed manually by the team.
                    </Label>
                  </div>

                  <div className="flex items-start space-x-2">
                    <Checkbox
                      id="acknowledgedNoGuaranteedRate"
                      data-testid="checkbox-no-guaranteed-rate"
                      checked={form.watch("acknowledgedNoGuaranteedRate")}
                      onCheckedChange={(checked) => form.setValue("acknowledgedNoGuaranteedRate", checked === true)}
                    />
                    <Label htmlFor="acknowledgedNoGuaranteedRate" className="text-sm leading-tight">
                      I understand there is no guaranteed exchange rate. The final amount will be determined at the time of processing.
                    </Label>
                  </div>

                  <div className="flex items-start space-x-2">
                    <Checkbox
                      id="acknowledgedTerms"
                      data-testid="checkbox-terms"
                      checked={form.watch("acknowledgedTerms")}
                      onCheckedChange={(checked) => form.setValue("acknowledgedTerms", checked === true)}
                    />
                    <Label htmlFor="acknowledgedTerms" className="text-sm leading-tight">
                      I agree to the terms and understand that requests may be declined based on availability and policy.
                    </Label>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  data-testid="button-submit-request"
                  disabled={submitMutation.isPending}
                >
                  {submitMutation.isPending ? "Submitting..." : "Submit Request for Review"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {!showForm && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
                <h3 className="font-semibold">Request Submitted!</h3>
                <p className="text-sm text-muted-foreground">
                  Your request has been submitted for manual review. You'll be notified once it's processed.
                </p>
                <Button onClick={() => setShowForm(true)} variant="outline">
                  Submit Another Request
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Your Requests
            </CardTitle>
            <CardDescription>
              Track the status of your swap requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingRequests ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : !myRequests?.requests?.length ? (
              <p className="text-muted-foreground text-sm">No requests yet</p>
            ) : (
              <div className="space-y-4">
                {myRequests.requests.slice(0, 10).map((request) => (
                  <div key={request.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">
                          {parseFloat(request.jcmovesAmount).toLocaleString()} JCMOVES → {request.desiredAsset}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(request.createdAt), "MMM d, yyyy h:mm a")}
                        </p>
                      </div>
                      {getStatusBadge(request.status)}
                    </div>
                    
                    {request.status === "declined" && request.declineReason && (
                      <p className="text-xs text-red-500">Reason: {request.declineReason}</p>
                    )}
                    
                    {request.status === "completed" && (
                      <div className="text-xs text-green-600 space-y-1">
                        {request.fulfilledAmount && (
                          <p>Received: {request.fulfilledAmount} {request.desiredAsset}</p>
                        )}
                        {request.fulfillmentTxHash && (
                          <a 
                            href={`https://solscan.io/tx/${request.fulfillmentTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline"
                          >
                            View Transaction
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <h3 className="font-medium mb-2">How It Works</h3>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>Submit your swap request with the amount and desired asset</li>
            <li>Our team reviews your request (usually within 24-48 hours)</li>
            <li>If approved, we complete the swap using our treasury or external services</li>
            <li>The requested asset is sent to your wallet address</li>
            <li>You receive notification when complete</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
