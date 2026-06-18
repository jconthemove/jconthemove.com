import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, storeTokens, clearTokens, getApiBase } from "@/lib/queryClient";
import { WelcomeModal } from "@/components/welcome-modal";
import { Loader2, LogIn, Lock, Mail, User, UserPlus, Phone, Coins, Truck } from "lucide-react";
import { SiGoogle } from "react-icons/si";

function roleDestination(role: string, status: string): string {
  if (status === "pending" || status === "pending_approval") return "/pending-approval";
  if (role === "admin" || role === "business_owner") return "/control";
  if (role === "employee") return "/crew";
  return "/";
}

function sanitizeRedirectPath(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "";
  return path;
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  // Task #116: read ?email=&intent= so post-booking deep links from
  // BookingConfirmedTiles pre-fill the email and tailor the header copy.
  const { prefillEmail, intent, initialMode, redirectPath } = useMemo(() => {
    if (typeof window === "undefined") {
      return { prefillEmail: "", intent: "", initialMode: "login" as const, redirectPath: "" };
    }
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get("mode") === "register" ? "register" : "login";
    return {
      prefillEmail: params.get("email") || "",
      intent: params.get("intent") || "",
      initialMode: params.get("email") || requestedMode === "register" ? "register" as const : "login" as const,
      redirectPath: sanitizeRedirectPath(params.get("redirect")),
    };
  }, []);
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeFirstName, setWelcomeFirstName] = useState("");
  const [form, setForm] = useState({
    email: prefillEmail,
    password: "",
    firstName: "",
    lastName: "",
    phoneNumber: "",
    rewardsEnrolled: true,
  });

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

  const loginMutation = useMutation({
    mutationFn: async () => {
      const base = getApiBase();
      // Use raw fetch — NOT apiRequest — so a wrong-password 401 shows an
      // error message here instead of redirecting away from the login page.
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        const err = new Error(data.error || "Invalid email or password") as Error & {
          code?: string;
          status?: string;
        };
        err.code = data.code;
        err.status = data.status;
        throw err;
      }
      if (data.accessToken) {
        storeTokens(data.accessToken, data.refreshToken);
        return data;
      }
      // JWT tokens for cross-platform / mobile auth persistence
      try {
        const tokenRes = await fetch(`${base}/api/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email, password: form.password }),
          credentials: "include",
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          if (tokenData.accessToken) storeTokens(tokenData.accessToken, tokenData.refreshToken);
        }
      } catch {}
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.setQueryData(["/api/auth/user"], data.user);
      if (data.pastJobsCount && data.pastJobsCount > 0 && data.user.role === 'customer') {
        toast({
          title: `We found ${data.pastJobsCount} previous job${data.pastJobsCount === 1 ? "" : "s"} linked to your email`,
          description: "They're now in My Jobs — tap the Jobs tab to view them.",
        });
      } else {
        toast({ title: "Welcome back!", description: `Signed in as ${data.user.firstName || data.user.email}` });
      }
      const defaultDestination = roleDestination(data.user.role, data.user.status);
      setLocation(data.user.role === "customer" && redirectPath ? redirectPath : defaultDestination);
    },
    onError: (e: any) => {
      clearTokens();
      if (e?.code === "PASSWORD_SETUP_REQUIRED") {
        setMode("register");
      }
      const description =
        e?.code === "ACCOUNT_RESTRICTED"
          ? (e?.status === "pending" || e?.status === "pending_approval"
              ? "Your account is waiting for approval. We’ll send you in as soon as it’s approved."
              : e.message || "This account is restricted right now.")
          : e?.message === "Invalid email or password"
            ? "That password didn’t match this account. Use Forgot password if you need to reset it."
            : e.message || "Check your email and password.";
      toast({ title: "Sign in failed", description, variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const base = getApiBase();
      const res = await fetch(`${base}/api/auth/customer/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email, password: form.password,
          firstName: form.firstName, lastName: form.lastName,
          phoneNumber: form.phoneNumber, rewardsEnrolled: form.rewardsEnrolled,
        }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create account");
      if (data.accessToken) {
        storeTokens(data.accessToken, data.refreshToken);
        return data;
      }
      try {
        const tokenRes = await fetch(`${base}/api/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email, password: form.password }),
          credentials: "include",
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          if (tokenData.accessToken) storeTokens(tokenData.accessToken, tokenData.refreshToken);
        }
      } catch {}
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.setQueryData(["/api/auth/user"], data.user);
      if (data.showWelcome) {
        setWelcomeFirstName(data.user?.firstName || form.firstName);
        setShowWelcome(true);
      } else {
        toast({ title: "Account created!", description: `Welcome, ${data.user.firstName}!` });
        setLocation(data.user?.role === "customer" && redirectPath ? redirectPath : "/");
      }
    },
    onError: (e: any) => toast({ title: "Registration failed", description: e.message || "Could not create account.", variant: "destructive" }),
  });

  const isPending = loginMutation.isPending || registerMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mode === "login" ? loginMutation.mutate() : registerMutation.mutate();
  };

  const handleGoogleLogin = () => {
    const base = getApiBase();
    const params = new URLSearchParams();
    if (redirectPath) params.set("redirect", redirectPath);
    const query = params.toString();
    window.location.href = `${base}/api/auth/google${query ? `?${query}` : ""}`;
  };

  return (
    <>
      <WelcomeModal
        open={showWelcome}
        firstName={welcomeFirstName}
        bonus={250}
        onClose={() => { setShowWelcome(false); setLocation(redirectPath || "/"); }}
      />

      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">

          {/* Logo / brand */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 mb-3 shadow-lg shadow-blue-900/40">
              <Truck className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-black text-white">JC ON THE MOVE</h1>
            <p className="text-slate-400 text-sm">Northwoods Moving &amp; More</p>
          </div>

          <Card className="bg-slate-900 border-slate-700 shadow-2xl">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-xl text-white" data-testid="text-login-title">
                {intent === "track"
                  ? (mode === "login" ? "Sign in to track your booking" : "Track your booking")
                  : intent === "rewards"
                    ? (mode === "login" ? "Sign in to JCMOVES" : "Create your free JCMOVES account")
                    : (mode === "login" ? "Sign In" : "Create Account")}
              </CardTitle>
              <CardDescription className="text-slate-400">
                {intent === "track"
                  ? "We'll link your new account to the email you just used so you can pause, skip, or re-book anytime."
                  : intent === "rewards"
                    ? "Join free, earn JCMOVES on completed jobs, and track your rewards in one place."
                    : mode === "login"
                    ? "Customers, crew & admins — one place to sign in"
                    : "New customers — create your free account"}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Button
                type="button"
                variant="outline"
                className="w-full mb-4 border-slate-600 bg-slate-800 text-white hover:bg-slate-700 hover:text-white"
                onClick={handleGoogleLogin}
                data-testid="button-google-login"
              >
                <SiGoogle className="mr-2 h-4 w-4" />
                Continue with Google
              </Button>

              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-700" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-slate-900 px-2 text-slate-500">or use email</span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Register-only fields */}
                {mode === "register" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-slate-300 text-sm">First Name</Label>
                        <Input
                          type="text" placeholder="First name" required
                          value={form.firstName} onChange={e => set("firstName", e.target.value)}
                          className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-slate-300 text-sm">Last Name</Label>
                        <Input
                          type="text" placeholder="Last name" required
                          value={form.lastName} onChange={e => set("lastName", e.target.value)}
                          className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-sm">Phone <span className="text-slate-500">(optional)</span></Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                        <Input
                          type="tel" placeholder="Best phone number"
                          value={form.phoneNumber} onChange={e => set("phoneNumber", e.target.value)}
                          className="pl-9 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Email */}
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-sm">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <Input
                      type="email" placeholder="Email you use for bookings" required
                      value={form.email} onChange={e => set("email", e.target.value)}
                      className="pl-9 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-sm">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <Input
                      type="password"
                      placeholder={mode === "register" ? "At least 8 characters" : "Password"}
                      required minLength={mode === "register" ? 8 : undefined}
                      value={form.password} onChange={e => set("password", e.target.value)}
                      className="pl-9 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>

                {/* Rewards enroll (register only) */}
                {mode === "register" && (
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-950/50 border border-blue-500/30">
                    <Checkbox
                      id="rewards"
                      checked={form.rewardsEnrolled}
                      onCheckedChange={v => set("rewardsEnrolled", v === true)}
                      className="mt-0.5 border-blue-400 data-[state=checked]:bg-blue-500"
                    />
                    <div>
                      <label htmlFor="rewards" className="text-sm font-semibold text-white flex items-center gap-1.5 cursor-pointer">
                        <Coins className="h-4 w-4 text-blue-400" /> Enroll in JCMOVES Rewards
                      </label>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Earn tokens on every job, redeem for discounts and perks.
                      </p>
                    </div>
                  </div>
                )}

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 font-bold h-11"
                  disabled={isPending}
                >
                  {isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{mode === "login" ? "Signing in…" : "Creating account…"}</>
                  ) : mode === "login" ? (
                    <><LogIn className="mr-2 h-4 w-4" />Sign In</>
                  ) : (
                    <><UserPlus className="mr-2 h-4 w-4" />Create Account</>
                  )}
                </Button>

                {/* Forgot */}
                <div className="text-center">
                  <Button variant="link" type="button" className="text-slate-500 hover:text-slate-300 text-xs p-0 h-auto"
                    onClick={() => setLocation("/forgot-access")}>
                    Forgot password? Recover account
                  </Button>
                </div>

                {/* Toggle login/register */}
                <div className="border-t border-slate-700 pt-4 text-center text-sm">
                  {mode === "login" ? (
                    <>
                      <span className="text-slate-400">New customer? </span>
                      <Button variant="link" type="button" className="p-0 h-auto text-green-400 hover:text-green-300 font-semibold"
                        onClick={() => setMode("register")}>
                        Create a free account
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-slate-400">Already have an account? </span>
                      <Button variant="link" type="button" className="p-0 h-auto text-blue-400 hover:text-blue-300 font-semibold"
                        onClick={() => setMode("login")}>
                        Sign in
                      </Button>
                    </>
                  )}
                </div>

                {/* Back to home */}
                <div className="text-center">
                  <Button variant="link" type="button" className="text-slate-600 hover:text-slate-400 text-xs p-0 h-auto"
                    onClick={() => setLocation("/")}>
                    ← Back to home
                  </Button>
                </div>

              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
