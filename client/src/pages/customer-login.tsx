import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogIn, Lock, Mail, User, UserPlus, Phone } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function CustomerLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    phoneNumber: "",
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
      toast({
        title: "Welcome Back!",
        description: `Logged in as ${data.user.firstName || data.user.email}`,
      });

      queryClient.setQueryData(["/api/auth/user"], data.user);
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
      });
      return response.json();
    },
    onSuccess: async (data: any) => {
      toast({
        title: "Account Created!",
        description: `Welcome, ${data.user.firstName}!`,
      });

      queryClient.setQueryData(["/api/auth/user"], data.user);
      setLocation("/customer-portal");
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
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-3 rounded-full">
              <User className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl text-white">
            {mode === 'login' ? 'Customer Sign In' : 'Create Account'}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {mode === 'login' 
              ? 'Sign in to track your quotes and earn rewards'
              : 'Create your account to start earning JCMOVES tokens'
            }
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
  );
}
