import { useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogIn, Lock, Mail } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function EmployeeLogin() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  
  const redirectUrl = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get('redirect') || '/';
  }, [searchString]);

  const loginMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/auth/employee/login", data);
      return response.json();
    },
    onSuccess: async (data: any) => {
      toast({
        title: "Welcome Back!",
        description: `Logged in as ${data.user.firstName} ${data.user.lastName}`,
      });

      queryClient.setQueryData(["/api/auth/user"], data.user);

      if (data.user.status === "pending") {
        setLocation("/pending-approval");
      } else {
        setLocation(redirectUrl);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid email or password.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-r from-orange-500 to-red-500 p-3 rounded-full">
              <LogIn className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl text-white">Employee Sign In</CardTitle>
          <CardDescription className="text-slate-400">
            Sign in to access your JC ON THE MOVE dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="john.doe@example.com"
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
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="pl-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                  required
                  data-testid="input-password"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
              disabled={loginMutation.isPending}
              data-testid="button-login"
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing In...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign In
                </>
              )}
            </Button>

            <div className="text-center text-sm">
              <span className="text-slate-400">Don't have an account? </span>
              <Button
                variant="link"
                className="p-0 h-auto text-orange-400 hover:text-orange-300"
                onClick={() => setLocation("/employee-register")}
                type="button"
                data-testid="link-register"
              >
                Create Account
              </Button>
            </div>

            <div className="text-center text-sm border-t border-slate-700 pt-4 mt-4">
              <span className="text-slate-400">Returning customer? </span>
              <Button
                variant="link"
                className="p-0 h-auto text-blue-400 hover:text-blue-300"
                onClick={() => setLocation("/customer-login")}
                type="button"
                data-testid="link-customer-login"
              >
                Customer Sign In
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
