import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogIn, Lock, Mail, User, UserPlus, Phone, Coins } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { WelcomeModal } from "@/components/welcome-modal";

export default function CustomerLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  // Read query params (?email=&intent=) so post-booking deep links from the
  // BookingConfirmedTiles "Track this job" CTA can pre-fill the email and
  // tailor the header copy (Task #116).
  const { prefillEmail, intent } = useMemo(() => {
    if (typeof window === "undefined") return { prefillEmail: "", intent: "" };
    const params = new URLSearchParams(window.location.search);
    return {
      prefillEmail: params.get("email") || "",
      intent: params.get("intent") || "",
    };
  }, []);
  const [mode, setMode] = useState<'login' | 'register'>(prefillEmail ? 'register' : 'login');
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeFirstName, setWelcomeFirstName] = useState("");
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    email: prefillEmail,
    password: "",
    firstName: "",
    lastName: "",
    phoneNumber: "",
    rewardsEnrolled: true,
  });

  const loginMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/auth/customer/login", {
        email: data.email,
        password: data.password,
      });
      return response.json();
    },
    onSuccess: async (data: any) => {
      queryClient.setQueryData(["/api/auth/user"], data.user);

      if (data.pastJobsCount && data.pastJobsCount > 0) {
        toast({
          title: `We found ${data.pastJobsCount} previous job${data.pastJobsCount === 1 ? "" : "s"} linked to your email`,
          description: `They're now in My Jobs — tap the Jobs tab to view them.`,
        });
      } else {
        toast({
          title: "Welcome Back!",
          description: `Logged in as ${data.user.firstName || data.user.email}`,
        });
      }

      setLocation("/customer-portal");
    },
    onError: (error: any) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid email or password.",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/auth/customer/register", {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        rewardsEnrolled: data.rewardsEnrolled,
      });
      return response.json();
    },
    onSuccess: async (data: any) => {
      queryClient.setQueryData(["/api/auth/user"], data.user);
      if (data.showWelcome) {
        setPendingUser(data.user);
        setWelcomeFirstName(data.user?.firstName || formData.firstName);
        setShowWelcome(true);
      } else {
        toast({
          title: "Account Created!",
          description: `Welcome, ${data.user.firstName}!`,
        });
        setLocation("/customer-portal");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Could not create account.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      loginMutation.mutate(formData);
    } else {
      registerMutation.mutate(formData);
    }
  };

  const isPending = loginMutation.isPending || registerMutation.isPending;

  return (
    <>
    <WelcomeModal
      open={showWelcome}
      firstName={welcomeFirstName}
      bonus={250}
      onClose={() => { setShowWelcome(false); setLocation("/customer-portal"); }}
    />
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-3 rounded-full">
              <User className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl text-white" data-testid="text-login-title">
            {intent === 'track'
              ? (mode === 'login' ? 'Sign in to track your booking' : 'Track your booking')
              : (mode === 'login' ? 'Customer Sign In' : 'Create Account')}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {intent === 'track'
              ? "We'll link your new account to the email you just used so you can pause, skip, or re-book anytime."
              : mode === 'login'
                ? 'Sign in to track your quotes and earn rewards'
                : 'Create your account to start earning JCMOVES tokens'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-slate-300">First Name</Label>
                    <Input
                      id="firstName"
                      type="text"
                      placeholder="John"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                      required
                      data-testid="input-firstName"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-slate-300">Last Name</Label>
                    <Input
                      id="lastName"
                      type="text"
                      placeholder="Doe"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                      required
                      data-testid="input-lastName"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber" className="text-slate-300">Phone Number (optional)</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                      id="phoneNumber"
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      className="pl-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                      data-testid="input-phoneNumber"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="pl-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                  required
                  data-testid="input-email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="pl-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  data-testid="input-password"
                />
              </div>
            </div>

            {mode === 'register' && (
              <div className="flex items-start space-x-3 p-3 rounded-lg bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30">
                <Checkbox
                  id="rewardsEnrolled"
                  checked={formData.rewardsEnrolled}
                  onCheckedChange={(checked) => setFormData({ ...formData, rewardsEnrolled: checked === true })}
                  className="mt-0.5 border-blue-400 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                />
                <div className="grid gap-1 leading-none">
                  <label htmlFor="rewardsEnrolled" className="text-sm font-medium text-white cursor-pointer flex items-center gap-1.5">
                    <Coins className="h-4 w-4 text-blue-400" />
                    Enroll in JCMOVES Rewards Program
                  </label>
                  <p className="text-xs text-slate-400">
                    Earn JCMOVES tokens when your moves are completed, for referrals, and more. Redeem tokens for discounts on future services and in-app perks.
                  </p>
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
              disabled={isPending}
              data-testid="button-submit"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === 'login' ? 'Signing In...' : 'Creating Account...'}
                </>
              ) : mode === 'login' ? (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign In
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create Account
                </>
              )}
            </Button>

            <div className="text-center text-sm pt-1">
              <Button
                variant="link"
                className="p-0 h-auto text-slate-500 hover:text-slate-300 text-xs"
                onClick={() => setLocation('/forgot-access')}
                type="button"
                data-testid="link-forgot-access"
              >
                Forgot your access? Recover account
              </Button>
            </div>

            <div className="text-center text-sm border-t border-slate-700 pt-4 mt-4">
              {mode === 'login' ? (
                <>
                  <span className="text-slate-400">Don't have an account? </span>
                  <Button
                    variant="link"
                    className="p-0 h-auto text-green-400 hover:text-green-300 font-semibold"
                    onClick={() => setMode('register')}
                    type="button"
                    data-testid="link-create-account"
                  >
                    Create Account
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-slate-400">Already have an account? </span>
                  <Button
                    variant="link"
                    className="p-0 h-auto text-blue-400 hover:text-blue-300"
                    onClick={() => setMode('login')}
                    type="button"
                    data-testid="link-sign-in"
                  >
                    Sign In
                  </Button>
                </>
              )}
            </div>

            <div className="text-center text-sm">
              <span className="text-slate-400">Need a quote? </span>
              <Button
                variant="link"
                className="p-0 h-auto text-blue-400 hover:text-blue-300"
                onClick={() => setLocation("/customer")}
                type="button"
                data-testid="link-get-quote"
              >
                Get a Free Quote
              </Button>
            </div>

            <div className="text-center text-sm border-t border-slate-700 pt-4 mt-4">
              <span className="text-slate-400">Are you an employee? </span>
              <Button
                variant="link"
                className="p-0 h-auto text-orange-400 hover:text-orange-300"
                onClick={() => setLocation("/employee-login")}
                type="button"
                data-testid="link-employee-login"
              >
                Employee Sign In
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
    </>
  );
}
