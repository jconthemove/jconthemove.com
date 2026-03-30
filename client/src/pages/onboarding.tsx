import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, User, Mail, Phone, Loader2, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { WelcomeModal } from "@/components/welcome-modal";
import { Checkbox } from "@/components/ui/checkbox";

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1920;
const MAX_YEAR = CURRENT_YEAR - 18;

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeFirstName, setWelcomeFirstName] = useState("");
  const [birthYear, setBirthYear] = useState(CURRENT_YEAR - 30);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
  });

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const nameParts = form.fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/customer/register", {
        email: form.email,
        password: form.password,
        firstName,
        lastName,
        phoneNumber: form.phone,
        rewardsEnrolled: true,
        dateOfBirth: `${birthYear}-01-01`,
        tosAccepted: true,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.setQueryData(["/api/auth/user"], data.user);
      if (data.showWelcome) {
        setWelcomeFirstName(data.user?.firstName || firstName);
        setShowWelcome(true);
      } else {
        toast({ title: "Welcome!", description: `Your account is ready, ${data.user.firstName}!` });
        setLocation("/");
      }
    },
    onError: (e: any) => toast({ title: "Registration failed", description: e.message || "Could not create account.", variant: "destructive" }),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!firstName) {
      toast({ title: "Name required", description: "Please enter your full name.", variant: "destructive" });
      return;
    }
    if (form.password.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (birthYear > MAX_YEAR) {
      toast({ title: "Age requirement", description: "You must be 18 or older to create an account.", variant: "destructive" });
      return;
    }
    if (!tosAccepted) {
      toast({ title: "Terms required", description: "Please accept the Terms of Service to continue.", variant: "destructive" });
      return;
    }
    registerMutation.mutate();
  };

  return (
    <>
      <WelcomeModal
        open={showWelcome}
        firstName={welcomeFirstName}
        bonus={250}
        onClose={() => { setShowWelcome(false); setLocation("/"); }}
      />

      <div className="min-h-screen bg-jc-cream dark:bg-zinc-950 px-6 pt-12 pb-8">
        <div className="w-full max-w-[390px] mx-auto">
          <button
            onClick={() => setLocation("/")}
            aria-label="Go back"
            className="mb-8 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>

          <h1 className="text-2xl font-black text-zinc-900 dark:text-white mb-1">Your details</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8">Tell us a bit about yourself</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="John Smith"
                  required
                  value={form.fullName}
                  onChange={e => set("fullName", e.target.value)}
                  className="w-full h-13 pl-12 pr-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-base focus:outline-none focus:ring-2 focus:ring-jc-orange/30 focus:border-jc-orange transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
                <input
                  type="email"
                  placeholder="john@example.com"
                  required
                  value={form.email}
                  onChange={e => set("email", e.target.value)}
                  className="w-full h-13 pl-12 pr-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-base focus:outline-none focus:ring-2 focus:ring-jc-orange/30 focus:border-jc-orange transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                Phone <span className="text-zinc-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
                <input
                  type="tel"
                  placeholder="(906) 555-0100"
                  value={form.phone}
                  onChange={e => set("phone", e.target.value)}
                  className="w-full h-13 pl-12 pr-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-base focus:outline-none focus:ring-2 focus:ring-jc-orange/30 focus:border-jc-orange transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Password</label>
              <input
                type="password"
                placeholder="At least 8 characters"
                required
                minLength={8}
                value={form.password}
                onChange={e => set("password", e.target.value)}
                className="w-full h-13 px-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-base focus:outline-none focus:ring-2 focus:ring-jc-orange/30 focus:border-jc-orange transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                <Calendar className="inline h-4 w-4 mr-1 -mt-0.5" />
                Birth Year
              </label>
              <div className="text-center text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white mb-2">
                {birthYear}
              </div>
              <input
                type="range"
                min={MIN_YEAR}
                max={MAX_YEAR}
                step={1}
                value={birthYear}
                onChange={e => setBirthYear(Number(e.target.value))}
                className="w-full accent-jc-orange"
              />
              <div className="flex justify-between text-xs text-zinc-400 mt-1">
                <span>{MIN_YEAR}</span>
                <span>{MAX_YEAR}</span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">You must be 18 years or older to use this service.</p>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
              <Checkbox
                id="tos"
                checked={tosAccepted}
                onCheckedChange={(checked) => setTosAccepted(checked === true)}
                className="mt-0.5 flex-shrink-0"
              />
              <label htmlFor="tos" className="text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer leading-snug">
                I am 18 years of age or older and agree to the{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-jc-orange underline hover:no-underline">
                  Terms of Service
                </a>
              </label>
            </div>

            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full h-14 rounded-2xl bg-jc-orange text-white font-bold text-lg shadow-lg shadow-jc-orange/30 hover:bg-jc-orange/90 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-4"
            >
              {registerMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Creating account...
                </span>
              ) : (
                "Join JC ON THE MOVE"
              )}
            </button>
          </form>

          <p className="text-center text-sm text-zinc-400 mt-6">
            Already have an account?{" "}
            <button onClick={() => setLocation("/login")} className="text-jc-orange font-semibold hover:underline">
              Sign in
            </button>
          </p>
        </div>
      </div>
    </>
  );
}
