import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Users, 
  UserCog, 
  Search, 
  Eye,
  Wallet,
  TrendingUp,
  Award,
  Briefcase,
  Clock,
  Shield,
  ChevronRight,
  Send,
  ArrowRightLeft,
  History,
  Download
} from "lucide-react";
import { Link } from "wouter";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  username?: string;
  role: string;
  status: 'pending' | 'approved' | 'active' | 'removed';
  createdAt: string;
  referralCount: number;
}

interface UserDetails {
  user: User & { capabilities?: string[] };
  wallet: {
    tokenBalance: string;
    totalEarnings: string;
  };
  employeeStats: {
    totalPoints: number;
    currentLevel: number;
    totalEarnedTokens: string;
    jobsCompleted: number;
    streakCount: number;
    lastActivityDate: string;
  } | null;
  recentRewards: Array<{
    id: string;
    rewardType: string;
    tokenAmount: string;
    cashValue: string;
    status: string;
    earnedDate: string;
    referenceId?: string;
  }>;
  pendingRequests: {
    cashouts: number;
    cashoutDetails: Array<{
      id: string;
      tokenAmount: string;
      usdValue: string;
      status: string;
      createdAt: string;
    }>;
  };
  jobs: {
    assignedCount: number;
    createdCount: number;
    recentAssigned: Array<{
      id: string;
      serviceType: string;
      status: string;
      createdAt: string;
    }>;
    recentCreated: Array<{
      id: string;
      serviceType: string;
      status: string;
      createdAt: string;
    }>;
  };
}

export default function AdminUsersPage() {
  const { user, hasAdminAccess, isLoading: authLoading } = useAuth();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState("overview");
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDescription, setTransferDescription] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [confirmRemoveUserId, setConfirmRemoveUserId] = useState<string | null>(null);
  const confirmRemoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");

  const handleRemoveAccessClick = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    if (confirmRemoveUserId === userId) {
      updateStatusMutation.mutate({ userId, status: 'removed' });
      setConfirmRemoveUserId(null);
      if (confirmRemoveTimerRef.current) clearTimeout(confirmRemoveTimerRef.current);
    } else {
      setConfirmRemoveUserId(userId);
      if (confirmRemoveTimerRef.current) clearTimeout(confirmRemoveTimerRef.current);
      confirmRemoveTimerRef.current = setTimeout(() => setConfirmRemoveUserId(null), 4000);
    }
  };

  // Check if user has admin or business_owner role
  const hasAccess = hasAdminAccess || user?.role === 'business_owner';

  // Fetch all users
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: !!hasAccess,
  });

  // Fetch selected user details
  const { data: userDetails, isLoading: detailsLoading } = useQuery<UserDetails>({
    queryKey: ["/api/admin/users", selectedUser, "details"],
    enabled: !!selectedUser,
  });

  // Fetch user wallet transaction history
  const { data: walletHistory, isLoading: historyLoading } = useQuery<{
    success: boolean;
    transactions: Array<{
      id: string;
      type: string;
      tokenAmount: string;
      cashValue: string;
      status: string;
      date: string;
      referenceId?: string;
      metadata?: any;
    }>;
    totalCount: number;
  }>({
    queryKey: ["/api/admin/wallet", selectedUser, "history"],
    enabled: !!selectedUser && walletModalOpen,
  });

  // Transfer tokens mutation
  const transferMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/admin/wallet/${selectedUser}/transfer`,
        {
          tokenAmount: parseFloat(transferAmount),
          description: transferDescription || "Admin transfer"
        }
      );
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Transfer Successful",
        description: data.message || "Tokens transferred successfully"
      });
      setTransferAmount("");
      setTransferDescription("");
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedUser, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/wallet", selectedUser, "history"] });
    },
    onError: (error: any) => {
      toast({
        title: "Transfer Failed",
        description: error.message || "Failed to transfer tokens",
        variant: "destructive"
      });
    }
  });

  // Grant retroactive jewelry listing rewards
  const jewelryRewardsMutation = useMutation({
    mutationFn: async (targetUserId?: string) => {
      const response = await apiRequest("POST", "/api/admin/jewelry-listing-rewards", targetUserId ? { userId: targetUserId } : {});
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Jewelry Rewards Granted",
        description: `${data.rewarded} items rewarded (${data.tokensGranted} JCMOVES total). ${data.skipped} already had rewards.`,
      });
      if (selectedUser) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedUser, "details"] });
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message || "Could not grant jewelry rewards", variant: "destructive" });
    },
  });

  // One-time job reward correction (650 JCMOVES shortfall from 3/1/2026)
  const jobRewardCorrectionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/job-reward-correction-20260301", {});
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Correction Applied", description: data.message || `+650 JCMOVES added to your wallet` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: any) => {
      const msg = error.message || "";
      if (msg.includes("already applied") || error.status === 409) {
        toast({ title: "Already Applied", description: "This correction has already been credited to your wallet.", variant: "destructive" });
      } else {
        toast({ title: "Failed", description: msg || "Could not apply correction", variant: "destructive" });
      }
    },
  });

  // Grant tokens mutation (admin manual award)
  const grantTokensMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/admin/grant-tokens`,
        {
          userId: selectedUser,
          amount: parseFloat(grantAmount),
          reason: grantReason
        }
      );
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Tokens Granted", description: data.message || "Tokens granted successfully" });
      setGrantAmount("");
      setGrantReason("");
      setGrantModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedUser, "details"] });
    },
    onError: (error: any) => {
      toast({ title: "Grant Failed", description: error.message || "Failed to grant tokens", variant: "destructive" });
    }
  });

  // Update user status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: 'pending' | 'approved' | 'active' | 'removed' }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/admin/users/${userId}/status`,
        { status }
      );
      return await response.json();
    },
    onSuccess: (data: any, variables) => {
      const statusLabels: Record<string, string> = { pending: 'Pending', approved: 'Approved', active: 'Active', removed: 'Removed' };
      toast({
        title: "Status Updated",
        description: `User status changed to ${statusLabels[variables.status]}`
      });
      // Refresh user list
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", variables.userId, "details"] });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update user status",
        variant: "destructive"
      });
    }
  });

  // Resend approval email mutation
  const resendApprovalMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest(
        "POST",
        "/api/admin/resend-approval-email",
        { userId }
      );
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Email Sent",
        description: data.message || "Approval email has been resent"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Email Failed",
        description: error.message || "Failed to resend approval email",
        variant: "destructive"
      });
    }
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest(
        "DELETE",
        `/api/admin/users/${userId}`
      );
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "User Deleted",
        description: data.message || "User successfully deleted"
      });
      setSelectedUser(null);
      setWalletModalOpen(false);
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
      // Refresh user list
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete user",
        variant: "destructive"
      });
    }
  });

  const [draftCapabilities, setDraftCapabilities] = useState<string[] | null>(null);

  useEffect(() => {
    setDraftCapabilities(null);
  }, [selectedUser]);

  const updateCapabilitiesMutation = useMutation({
    mutationFn: async ({ userId, capabilities }: { userId: string; capabilities: string[] }) => {
      const response = await apiRequest("PATCH", `/api/users/${userId}/capabilities`, { capabilities });
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Capabilities updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedUser, "details"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed", description: error.message || "Could not update capabilities", variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardHeader>
            <div className="text-center">
              <Shield className="h-12 w-12 text-destructive mx-auto mb-3" />
              <CardTitle className="text-destructive">Access Denied</CardTitle>
              <CardDescription>Administrator privileges required</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button variant="outline" className="w-full" data-testid="button-back-to-main">
                Back to Main
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filter users based on search
  const filteredUsers = users?.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    return (
      user.firstName?.toLowerCase().includes(searchLower) ||
      user.lastName?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower) ||
      user.username?.toLowerCase().includes(searchLower)
    );
  }) || [];

  // Separate employees and customers
  const employees = filteredUsers.filter(u => u.role === 'employee' || u.role === 'admin' || u.role === 'business_owner');
  const customers = filteredUsers.filter(u => u.role === 'customer');

  // All pending users (employees + customers) regardless of search filter
  const allPendingUsers = (users as any[])?.filter((u: any) => u.status === 'pending') || [];

  const getRoleBadge = (role: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      admin: { variant: "destructive", label: "Admin" },
      business_owner: { variant: "destructive", label: "Owner" },
      employee: { variant: "default", label: "Employee" },
      customer: { variant: "secondary", label: "Customer" }
    };
    const config = variants[role] || variants.customer;
    return <Badge variant={config.variant} data-testid={`badge-role-${role}`}>{config.label}</Badge>;
  };

  const getStatusBadge = (status: 'pending' | 'approved' | 'active' | 'removed') => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string, className?: string }> = {
      pending: { variant: "outline", label: "Pending", className: "border-yellow-500 text-yellow-600 dark:text-yellow-400" },
      approved: { variant: "outline", label: "Approved", className: "border-green-500 text-green-600 dark:text-green-400" },
      active: { variant: "outline", label: "Active", className: "border-green-500 text-green-600 dark:text-green-400" },
      removed: { variant: "outline", label: "Removed", className: "border-red-500 text-red-600 dark:text-red-400" }
    };
    const config = variants[status] || variants.pending;
    return <Badge variant={config.variant} className={config.className} data-testid={`badge-status-${status}`}>{config.label}</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-6 md:mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2" data-testid="heading-admin-users">
            User Management
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            View and manage all employees and customers
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 flex items-center gap-2 border-blue-400 text-blue-600 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950 text-xs"
          onClick={async () => {
            try {
              const res = await fetch('/api/admin/database/backup', { credentials: 'include' });
              if (!res.ok) throw new Error('Backup failed');
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
              a.href = url;
              a.download = `jcmove-backup-${ts}.json`;
              a.click();
              URL.revokeObjectURL(url);
              toast({ title: 'Backup downloaded', description: 'Save this file somewhere safe.' });
            } catch {
              toast({ title: 'Backup failed', variant: 'destructive' });
            }
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Backup DB
        </Button>
      </div>

      {/* Pending Approvals Alert */}
      {allPendingUsers.length > 0 && (
        <div className="mb-5 rounded-xl border-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/40 p-4 shadow-md">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h2 className="font-bold text-yellow-800 dark:text-yellow-300 text-base">
                {allPendingUsers.length} Account{allPendingUsers.length > 1 ? 's' : ''} Pending Approval
              </h2>
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                These users are waiting to access the platform.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {allPendingUsers.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg px-4 py-2 shadow-sm">
                <div>
                  <span className="font-semibold text-foreground">{u.firstName} {u.lastName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{u.email}</span>
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">{u.role}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white h-8"
                    onClick={() => updateStatusMutation.mutate({ userId: u.id, status: 'approved' })}
                    disabled={updateStatusMutation.isPending}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-red-400 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                    onClick={() => updateStatusMutation.mutate({ userId: u.id, status: 'removed' })}
                    disabled={updateStatusMutation.isPending}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-users"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Unified User List (no tabs — everyone visible) ── */}
      {usersLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading users...</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">

          {/* ── Employees section ── */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-blue-500" />
                <h2 className="text-lg font-bold text-foreground">Employees & Admins</h2>
                <Badge variant="outline" className="border-blue-400 text-blue-500">{employees.length}</Badge>
              </div>
              <div className="flex-1 h-px bg-border" />
            </div>
            {employees.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <UserCog className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No employees found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {employees.map(emp => (
                  <Card
                    key={emp.id}
                    className="hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => setSelectedUser(emp.id)}
                    data-testid={`card-user-${emp.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg mb-1">{emp.firstName} {emp.lastName}</CardTitle>
                          <CardDescription className="text-sm break-all">{emp.email}</CardDescription>
                        </div>
                        <div className="flex flex-col gap-1">
                          {getRoleBadge(emp.role)}
                          {getStatusBadge(emp.status)}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        {emp.username && (
                          <div className="flex items-center text-muted-foreground">
                            <span className="font-medium mr-2">@{emp.username}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Joined</span>
                          <span className="font-medium">{formatDate(emp.createdAt)}</span>
                        </div>
                        <div className="flex gap-2 mt-3">
                          {emp.status === 'pending' && (
                            <>
                              <Button variant="default" size="sm" className="flex-1 bg-green-600 hover:bg-green-700"
                                onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ userId: emp.id, status: 'approved' }); }}
                                data-testid={`button-approve-${emp.id}`}>
                                Approve
                              </Button>
                              <Button variant="outline" size="sm" className="flex-1"
                                onClick={(e) => { e.stopPropagation(); resendApprovalMutation.mutate(emp.id); }}
                                disabled={resendApprovalMutation.isPending}>
                                {resendApprovalMutation.isPending ? 'Sending...' : 'Resend Email'}
                              </Button>
                            </>
                          )}
                          {emp.status === 'approved' && (
                            <Button variant="outline" size="sm"
                              className={`text-xs px-2 py-1 h-7 border transition-all ${confirmRemoveUserId === emp.id ? 'border-red-600 bg-red-600 text-white hover:bg-red-700 animate-pulse' : 'border-red-400 text-red-500 hover:border-red-600 hover:text-red-600 bg-transparent'}`}
                              onClick={(e) => handleRemoveAccessClick(e, emp.id)}
                              data-testid={`button-remove-${emp.id}`}>
                              {confirmRemoveUserId === emp.id ? '⚠️ Confirm?' : 'Remove Access'}
                            </Button>
                          )}
                          {emp.status === 'removed' && (
                            <Button variant="default" size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700"
                              onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ userId: emp.id, status: 'approved' }); }}
                              data-testid={`button-restore-${emp.id}`}>
                              Restore
                            </Button>
                          )}
                          {(emp.status === 'pending' || emp.status === 'removed') && (
                            <Button variant="outline" size="sm" className="flex-1"
                              onClick={(e) => { e.stopPropagation(); setUserToDelete(emp); setDeleteConfirmOpen(true); }}
                              data-testid={`button-delete-${emp.id}`}>
                              Delete
                            </Button>
                          )}
                        </div>
                        <Button variant="outline" size="sm" className="w-full mt-2"
                          onClick={(e) => { e.stopPropagation(); setSelectedUser(emp.id); }}
                          data-testid={`button-view-details-${emp.id}`}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* ── Customers section ── */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-500" />
                <h2 className="text-lg font-bold text-foreground">Customers</h2>
                <Badge variant="outline" className="border-emerald-400 text-emerald-500">{customers.length}</Badge>
              </div>
              <div className="flex-1 h-px bg-border" />
            </div>
            {customers.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No customers found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {customers.map(cust => (
                  <Card
                    key={cust.id}
                    className="hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => setSelectedUser(cust.id)}
                    data-testid={`card-user-${cust.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg mb-1">{cust.firstName} {cust.lastName}</CardTitle>
                          <CardDescription className="text-sm break-all">{cust.email}</CardDescription>
                        </div>
                        <div className="flex flex-col gap-1">
                          {getRoleBadge(cust.role)}
                          {getStatusBadge(cust.status)}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        {cust.username && (
                          <div className="flex items-center text-muted-foreground">
                            <span className="font-medium mr-2">@{cust.username}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Joined</span>
                          <span className="font-medium">{formatDate(cust.createdAt)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Referrals</span>
                          <Badge variant="outline">{cust.referralCount || 0}</Badge>
                        </div>
                        <div className="flex gap-2 mt-3">
                          {cust.status === 'pending' && (
                            <>
                              <Button variant="default" size="sm" className="flex-1 bg-green-600 hover:bg-green-700"
                                onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ userId: cust.id, status: 'approved' }); }}
                                data-testid={`button-approve-${cust.id}`}>
                                Approve
                              </Button>
                              <Button variant="outline" size="sm" className="flex-1"
                                onClick={(e) => { e.stopPropagation(); resendApprovalMutation.mutate(cust.id); }}
                                disabled={resendApprovalMutation.isPending}>
                                {resendApprovalMutation.isPending ? 'Sending...' : 'Resend Email'}
                              </Button>
                            </>
                          )}
                          {cust.status === 'approved' && (
                            <Button variant="outline" size="sm"
                              className={`text-xs px-2 py-1 h-7 border transition-all ${confirmRemoveUserId === cust.id ? 'border-red-600 bg-red-600 text-white hover:bg-red-700 animate-pulse' : 'border-red-400 text-red-500 hover:border-red-600 hover:text-red-600 bg-transparent'}`}
                              onClick={(e) => handleRemoveAccessClick(e, cust.id)}
                              data-testid={`button-remove-${cust.id}`}>
                              {confirmRemoveUserId === cust.id ? '⚠️ Confirm?' : 'Remove Access'}
                            </Button>
                          )}
                          {cust.status === 'removed' && (
                            <Button variant="default" size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700"
                              onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ userId: cust.id, status: 'approved' }); }}
                              data-testid={`button-restore-${cust.id}`}>
                              Restore
                            </Button>
                          )}
                          {(cust.status === 'pending' || cust.status === 'removed') && (
                            <Button variant="outline" size="sm" className="flex-1"
                              onClick={(e) => { e.stopPropagation(); setUserToDelete(cust); setDeleteConfirmOpen(true); }}
                              data-testid={`button-delete-${cust.id}`}>
                              Delete
                            </Button>
                          )}
                        </div>
                        <Button variant="outline" size="sm" className="w-full mt-2"
                          onClick={(e) => { e.stopPropagation(); setSelectedUser(cust.id); }}
                          data-testid={`button-view-details-${cust.id}`}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* User Details Modal */}
      <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className={`${isMobile ? 'max-w-[95vw] h-[90vh]' : 'max-w-3xl max-h-[85vh]'} overflow-hidden flex flex-col`}>
          {detailsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : !userDetails ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Unable to load user details</p>
              <Button variant="outline" className="mt-4" onClick={() => setSelectedUser(null)}>
                Close
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <DialogTitle className="text-xl md:text-2xl" data-testid="heading-user-details">
                      {userDetails.user.firstName} {userDetails.user.lastName}
                    </DialogTitle>
                    <DialogDescription className="mt-1">
                      {userDetails.user.email}
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRoleBadge(userDetails.user.role)}
                    {userDetails.user.role === 'customer' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to delete ${userDetails.user.firstName} ${userDetails.user.lastName}? This action cannot be undone.`)) {
                            deleteUserMutation.mutate(userDetails.user.id);
                          }
                        }}
                        disabled={deleteUserMutation.isPending}
                        data-testid="button-delete-user"
                      >
                        <span className="text-xs">Delete</span>
                      </Button>
                    )}
                  </div>
                </div>
              </DialogHeader>

              <ScrollArea className="flex-1 pr-4">
                <Tabs value={detailsTab} onValueChange={setDetailsTab} className="mt-4">
                  <TabsList className={`grid w-full ${isMobile ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
                    <TabsTrigger value="rewards" data-testid="tab-rewards">Rewards</TabsTrigger>
                    <TabsTrigger value="jobs" data-testid="tab-jobs">Jobs</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-4 mt-4">
                    {/* Wallet Info */}
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center">
                            <Wallet className="h-4 w-4 mr-2" />
                            Wallet Balance
                          </CardTitle>
                          <div className="flex gap-2 flex-wrap">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setGrantModalOpen(true)}
                            >
                              <Award className="h-4 w-4 mr-2" />
                              Grant
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => jewelryRewardsMutation.mutate(selectedUser || undefined)}
                              disabled={jewelryRewardsMutation.isPending}
                              title="Grant 200 JCMOVES for each jewelry item this user listed that hasn't been rewarded yet"
                            >
                              💎 {jewelryRewardsMutation.isPending ? "Rewarding..." : "Jewelry Rewards"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => jobRewardCorrectionMutation.mutate()}
                              disabled={jobRewardCorrectionMutation.isPending}
                              title="One-time correction: +650 JCMOVES for the 2 jobs completed 3/1/2026 that received wrong creator bonus"
                              className="border-amber-400 text-amber-600 hover:bg-amber-50 dark:border-amber-500 dark:text-amber-400"
                            >
                              🔧 {jobRewardCorrectionMutation.isPending ? "Applying..." : "+650 Fix"}
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setWalletModalOpen(true)}
                              data-testid="button-manage-wallet"
                            >
                              <ArrowRightLeft className="h-4 w-4 mr-2" />
                              Manage
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div 
                          className="flex justify-between items-center cursor-pointer hover:bg-muted p-2 rounded transition-colors"
                          onClick={() => setWalletModalOpen(true)}
                          data-testid="button-view-wallet"
                        >
                          <span className="text-muted-foreground">Token Balance</span>
                          <span className="font-bold" data-testid="text-token-balance">
                            {parseFloat(userDetails.wallet.tokenBalance).toLocaleString()} JCMOVES
                          </span>
                        </div>
                        <Separator />
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Total Earnings</span>
                          <span className="font-bold text-green-600 dark:text-green-400" data-testid="text-total-earnings">
                            ${parseFloat(userDetails.wallet.totalEarnings).toFixed(2)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Employee Stats */}
                    {userDetails.employeeStats && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center">
                            <Award className="h-4 w-4 mr-2" />
                            Employee Stats
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-muted-foreground">Level</p>
                              <p className="text-xl font-bold" data-testid="text-level">
                                {userDetails.employeeStats.currentLevel}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Points</p>
                              <p className="text-xl font-bold" data-testid="text-points">
                                {userDetails.employeeStats.totalPoints.toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Jobs Completed</p>
                              <p className="text-xl font-bold" data-testid="text-jobs-completed">
                                {userDetails.employeeStats.jobsCompleted}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Streak</p>
                              <p className="text-xl font-bold" data-testid="text-streak">
                                {userDetails.employeeStats.streakCount} days
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Pending Requests */}
                    {userDetails.pendingRequests.cashouts > 0 && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center">
                            <Clock className="h-4 w-4 mr-2" />
                            Pending Requests
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {userDetails.pendingRequests.cashoutDetails.map(cashout => (
                              <div key={cashout.id} className="flex justify-between items-center p-2 bg-muted rounded">
                                <div>
                                  <p className="font-medium">Redemption Request</p>
                                  <p className="text-sm text-muted-foreground">
                                    {cashout.tokenAmount} JCMOVES credits
                                  </p>
                                </div>
                                <Badge>{cashout.status}</Badge>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {/* Crew Capabilities — only for employees/admins */}
                    {(userDetails.user.role === 'employee' || userDetails.user.role === 'admin' || userDetails.user.role === 'business_owner') && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            🛠️ Crew Capabilities
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(() => {
                            const ALL_CAPS: { key: string; label: string; emoji: string }[] = [
                              { key: "mover", label: "Mover", emoji: "💪" },
                              { key: "driver", label: "Driver", emoji: "🚛" },
                              { key: "truck_small", label: "Truck (Small)", emoji: "🚐" },
                              { key: "truck_large", label: "Truck (Large)", emoji: "🚚" },
                              { key: "trailer_small", label: "Trailer (Small)", emoji: "🏕️" },
                              { key: "trailer_large", label: "Trailer (Large)", emoji: "🏗️" },
                              { key: "uhaul", label: "Uhaul Access", emoji: "🔑" },
                            ];
                            const current = userDetails.user.capabilities || [];
                            const working = draftCapabilities !== null ? draftCapabilities : current;
                            return (
                              <>
                                <div className="flex flex-wrap gap-2">
                                  {ALL_CAPS.map(cap => {
                                    const isOn = working.includes(cap.key);
                                    return (
                                      <button
                                        key={cap.key}
                                        onClick={() => {
                                          const base = draftCapabilities !== null ? draftCapabilities : current;
                                          const next = isOn ? base.filter(c => c !== cap.key) : [...base, cap.key];
                                          setDraftCapabilities(next);
                                        }}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                                          isOn
                                            ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                                            : "bg-slate-800/50 border-slate-600/30 text-slate-500 hover:text-slate-300"
                                        }`}
                                      >
                                        <span>{cap.emoji}</span> {cap.label}
                                      </button>
                                    );
                                  })}
                                </div>
                                <Button
                                  size="sm"
                                  disabled={updateCapabilitiesMutation.isPending || draftCapabilities === null}
                                  onClick={() => {
                                    updateCapabilitiesMutation.mutate({ userId: userDetails.user.id, capabilities: working });
                                    setDraftCapabilities(null);
                                  }}
                                  className="w-full mt-1 bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs"
                                >
                                  {updateCapabilitiesMutation.isPending ? "Saving…" : "Save Capabilities"}
                                </Button>
                              </>
                            );
                          })()}
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>

                  <TabsContent value="rewards" className="space-y-4 mt-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center">
                          <TrendingUp className="h-4 w-4 mr-2" />
                          Recent Rewards
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {userDetails.recentRewards.length === 0 ? (
                          <p className="text-center text-muted-foreground py-4">No rewards yet</p>
                        ) : (
                          <div className="space-y-2">
                            {userDetails.recentRewards.map(reward => (
                              <div key={reward.id} className="flex justify-between items-start p-3 bg-muted rounded" data-testid={`reward-${reward.id}`}>
                                <div className="flex-1">
                                  <p className="font-medium text-sm capitalize">
                                    {reward.rewardType.replace(/_/g, ' ')}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDate(reward.earnedDate)}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-sm">
                                    +{parseFloat(reward.tokenAmount).toLocaleString()} JCMOVES
                                  </p>
                                  <Badge variant="outline" className="mt-1">{reward.status}</Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="jobs" className="space-y-4 mt-4">
                    {/* Assigned Jobs */}
                    {userDetails.jobs.assignedCount > 0 && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center">
                            <Briefcase className="h-4 w-4 mr-2" />
                            Assigned Jobs ({userDetails.jobs.assignedCount})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {userDetails.jobs.recentAssigned.map(job => (
                              <div key={job.id} className="flex justify-between items-center p-2 bg-muted rounded" data-testid={`job-assigned-${job.id}`}>
                                <div>
                                  <p className="font-medium text-sm">{job.serviceType}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDate(job.createdAt)}
                                  </p>
                                </div>
                                <Badge>{job.status}</Badge>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Created Jobs */}
                    {userDetails.jobs.createdCount > 0 && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center">
                            <ChevronRight className="h-4 w-4 mr-2" />
                            Created Jobs ({userDetails.jobs.createdCount})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {userDetails.jobs.recentCreated.map(job => (
                              <div key={job.id} className="flex justify-between items-center p-2 bg-muted rounded" data-testid={`job-created-${job.id}`}>
                                <div>
                                  <p className="font-medium text-sm">{job.serviceType}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatDate(job.createdAt)}
                                  </p>
                                </div>
                                <Badge>{job.status}</Badge>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {userDetails.jobs.assignedCount === 0 && userDetails.jobs.createdCount === 0 && (
                      <Card>
                        <CardContent className="py-12 text-center">
                          <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">No jobs found</p>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>
                </Tabs>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Wallet Management Modal */}
      <Dialog open={walletModalOpen} onOpenChange={setWalletModalOpen}>
        <DialogContent className={`${isMobile ? 'max-w-[95vw] h-[90vh]' : 'max-w-2xl max-h-[85vh]'} overflow-hidden flex flex-col`}>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Wallet className="h-5 w-5 mr-2" />
              Wallet Management - {userDetails?.user.firstName} {userDetails?.user.lastName}
            </DialogTitle>
            <DialogDescription>
              Transfer tokens, view balance, and transaction history
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            <Tabs defaultValue="transfer" className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="transfer" data-testid="tab-wallet-transfer">
                  <Send className="h-4 w-4 mr-2" />
                  Transfer
                </TabsTrigger>
                <TabsTrigger value="history" data-testid="tab-wallet-history">
                  <History className="h-4 w-4 mr-2" />
                  History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="transfer" className="space-y-4 mt-4">
                {/* Current Balance */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Current Balance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-4">
                      <p className="text-3xl font-bold text-primary">
                        {userDetails && parseFloat(userDetails.wallet.tokenBalance).toLocaleString()} JCMOVES
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Total Earnings: ${userDetails && parseFloat(userDetails.wallet.totalEarnings).toFixed(2)}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Transfer Form */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Transfer Tokens</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="transfer-amount">Amount (JCMOVES)</Label>
                      <Input
                        id="transfer-amount"
                        type="number"
                        placeholder="0.00"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        data-testid="input-transfer-amount"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="transfer-description">Description (Optional)</Label>
                      <Input
                        id="transfer-description"
                        placeholder="e.g., Bonus reward, Adjustment, etc."
                        value={transferDescription}
                        onChange={(e) => setTransferDescription(e.target.value)}
                        data-testid="input-transfer-description"
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => transferMutation.mutate()}
                      disabled={!transferAmount || parseFloat(transferAmount) <= 0 || transferMutation.isPending}
                      data-testid="button-execute-transfer"
                    >
                      {transferMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Transferring...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Transfer Tokens
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history" className="space-y-4 mt-4">
                {historyLoading ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                      <p className="text-muted-foreground">Loading transaction history...</p>
                    </CardContent>
                  </Card>
                ) : walletHistory && walletHistory.transactions.length > 0 ? (
                  <div className="space-y-2">
                    {walletHistory.transactions.map(tx => (
                      <Card key={tx.id}>
                        <CardContent className="py-3">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-medium text-sm capitalize">
                                {tx.type.replace(/_/g, ' ')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(tx.date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                              {tx.referenceId && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Ref: {tx.referenceId.slice(0, 8)}...
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-sm">
                                +{parseFloat(tx.tokenAmount).toLocaleString()} JCMOVES
                              </p>
                              <Badge variant="outline" className="mt-1">{tx.status}</Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No transaction history</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User Account?</AlertDialogTitle>
            <AlertDialogDescription>
              {userToDelete && (
                <div className="space-y-2">
                  <p>
                    You are about to permanently delete the account for{" "}
                    <span className="font-semibold">{userToDelete.firstName} {userToDelete.lastName}</span>{" "}
                    ({userToDelete.email}).
                  </p>
                  <p className="text-destructive font-medium">
                    This action cannot be undone. All user data, including wallet balances, will be transferred to treasury and the account will be permanently removed.
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUserToDelete(null)} data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (userToDelete) {
                  deleteUserMutation.mutate(userToDelete.id);
                }
              }}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteUserMutation.isPending ? "Deleting..." : "Delete Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Grant Tokens Dialog */}
      <Dialog open={grantModalOpen} onOpenChange={setGrantModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Grant JCMOVES Tokens</DialogTitle>
            <DialogDescription>
              Manually award tokens to {userDetails?.user?.firstName} {userDetails?.user?.lastName} for missed rewards or adjustments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Amount (JCMOVES)</Label>
              <Input
                type="number"
                placeholder="e.g. 200"
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
                min="1"
                max="100000"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                placeholder="e.g. Missed lead creation reward"
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setGrantModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => grantTokensMutation.mutate()}
                disabled={!grantAmount || !grantReason || grantTokensMutation.isPending}
              >
                {grantTokensMutation.isPending ? "Granting..." : `Grant ${grantAmount || "0"} JCMOVES`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      </div>
    </div>
  );
}
