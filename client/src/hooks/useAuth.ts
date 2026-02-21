import { useQuery } from "@tanstack/react-query";
import { type User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: 60000,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      try {
        const response = await fetch("/api/auth/user", { 
          credentials: 'include',
        });
        if (response.status === 401) {
          return null;
        }
        if (!response.ok) {
          return null;
        }
        return await response.json();
      } catch (error) {
        return null;
      }
    },
  });

  const hasAdminAccess = user?.role === 'admin' || user?.role === 'business_owner';
  const isKnownBusinessOwner = user?.email === 'upmichiganstatemovers@gmail.com' || user?.role === 'business_owner';
  const isPending = user?.status === 'pending';
  const isApproved = user?.status === 'active' || user?.status === 'approved';
  
  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isPending,
    isApproved,
    isEmployee: user?.role === 'employee',
    isAdmin: user?.role === 'admin',
    isCustomer: user?.role === 'customer',
    hasAdminAccess,
    hasManagementAccess: hasAdminAccess,
    canManageInvitations: hasAdminAccess,
    canAccessTreasury: hasAdminAccess || isKnownBusinessOwner,
    canViewAllLeads: hasAdminAccess,
  };
}
