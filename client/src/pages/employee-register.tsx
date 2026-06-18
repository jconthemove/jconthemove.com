import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, Lock, Mail, User, Phone, Coins, Calendar } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { WelcomeModal } from "@/components/welcome-modal";

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1920;
const MAX_YEAR = CURRENT_YEAR - 18;

export default function EmployeeRegister() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeFirstName, setWelcomeFirstName] = useState("");
  const [birthYear, setBirthYear] = useState(CURRENT_YEAR - 30);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    phoneNumber: "",
    rewardsEnrolled: true,
  });

  const registerMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/auth/employee/register", {
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        rewardsEnrolled: data.rewardsEnrolled,
        dateOfBirth: `${birthYear}-01-01`,
        tosAccepted: true,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.showWelcome) {
        setWelcomeFirstName(data.user?.firstName || formData.firstName);
        setShowWelcome(true);
      } else {
        toast({
          title: "Registration Successful!",
          description: data.message || "Your account has been created and is pending approval.",
        });
        setLocation("/pending-approval");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Please check your information and try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Passwords do not match. Please try again.",
        variant: "destructive",
      });
      return;
    }

    if (formData.password.length < 8) {
      toast({
        title: "Weak Password",
        description: "Password must be at least 8 characters long.",
        variant: "destructive",
      });
      return;
    }

    if (!/^(?=.*[A-Za-z])(?=.*\d)/.test(formData.password)) {
      toast({
        title: "Weak Password",
        description: "Password must contain both letters and numbers.",
        variant: "destructive",
      });
      return;
    }

    if (birthYear > MAX_YEAR) {
      toast({
        title: "Age Requirement",
        description: "You must be 18 or older to create an account.",
        variant: "destructive",
      });
      return;
    }

    if (!tosAccepted) {
      toast({
        title: "Terms Required",
        description: "Please accept the Terms of Service to continue.",
        variant: "destructive",
      });
      return;
    }

    registerMutation.mutate(formData);
  };

  return (
    <>
    <WelcomeModal
      open={showWelcome}
      firstName={welcomeFirstName}
      bonus={250}
      onClose={() => { setShowWelcome(false); setLocation("/pending-approval"); }}
    />
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-r from-orange-500 to-red-500 p-3 rounded-full">
              <UserPlus className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl text-white">Join JC ON THE MOVE</CardTitle>
          <CardDescription className="text-slate-400">
            Create your employee account to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-slate-300">First Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="firstName"
                    placeholder="First name"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="pl-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                    required
                    data-testid="input-first-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-slate-300">Last Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="lastName"
                    placeholder="Last name"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="pl-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                    required
                    data-testid="input-last-name"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="Email you use for work"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="pl-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                  required
                  data-testid="input-email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber" className="text-slate-300">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="Best phone number"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  className="pl-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                  required
                  data-testid="input-phone"
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
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="pl-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                  required
                  data-testid="input-password"
                />
              </div>
              <p className="text-xs text-slate-400">
                Must be at least 8 characters with letters and numbers
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-300">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="pl-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                  required
                  data-testid="input-confirm-password"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                Birth Year
              </Label>
              <div className="text-center text-2xl font-semibold tabular-nums text-white">
                {birthYear}
              </div>
              <input
                type="range"
                min={MIN_YEAR}
                max={MAX_YEAR}
                step={1}
                value={birthYear}
                onChange={e => setBirthYear(Number(e.target.value))}
                className="w-full accent-orange-500"
              />
              <div className="flex justify-between text-xs text-slate-400">
                <span>{MIN_YEAR}</span>
                <span>{MAX_YEAR}</span>
              </div>
              <p className="text-xs text-slate-400">You must be 18 years or older to use this service.</p>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-lg bg-slate-700/30 border border-slate-600">
              <Checkbox
                id="tos"
                checked={tosAccepted}
                onCheckedChange={(checked) => setTosAccepted(checked === true)}
                className="mt-0.5 border-slate-400 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
              />
              <label htmlFor="tos" className="text-sm text-slate-400 cursor-pointer leading-snug">
                I am 18 years of age or older and agree to the{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-orange-400 underline hover:no-underline">
                  Terms of Service
                </a>
              </label>
            </div>

            <div className="flex items-start space-x-3 p-3 rounded-lg bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/30">
              <Checkbox
                id="rewardsEnrolled"
                checked={formData.rewardsEnrolled}
                onCheckedChange={(checked) => setFormData({ ...formData, rewardsEnrolled: checked === true })}
                className="mt-0.5 border-orange-400 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
              />
              <div className="grid gap-1 leading-none">
                <label htmlFor="rewardsEnrolled" className="text-sm font-medium text-white cursor-pointer flex items-center gap-1.5">
                  <Coins className="h-4 w-4 text-orange-400" />
                  Enroll in JCMOVES Rewards Program
                </label>
                <p className="text-xs text-slate-400">
                  Earn JCMOVES tokens for completing jobs, referrals, and daily check-ins. Redeem tokens for future services and in-app perks.
                </p>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
              disabled={registerMutation.isPending}
              data-testid="button-register"
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create Employee Account
                </>
              )}
            </Button>

            <div className="text-center text-sm">
              <span className="text-slate-400">Already have an account? </span>
              <Button
                variant="link"
                className="p-0 h-auto text-orange-400 hover:text-orange-300"
                onClick={() => setLocation("/login")}
                type="button"
                data-testid="link-login"
              >
                Sign In
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
    </>
  );
}
