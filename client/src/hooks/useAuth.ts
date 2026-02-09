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

  // Helper function to check if user has admin level permissions
  const hasAdminAccess = user?.role === 'admin' || user?.role === 'business_owner';
  
  // Business owner access for Treasury functionality
  const isKnownBusinessOwner = user?.email === 'upmichiganstatemovers@gmail.com' || user?.role === 'business_owner';
  
  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isEmployee: user?.role === 'employee',
    isAdmin: user?.role === 'admin',
    isCustomer: user?.role === 'customer',
    // Treasury access for both admin and business_owner roles
    hasAdminAccess,
    hasManagementAccess: hasAdminAccess,
    canManageInvitations: hasAdminAccess,
    canAccessTreasury: hasAdminAccess || isKnownBusinessOwner, // Both admin and business_owner can access treasury
    canViewAllLeads: hasAdminAccess,
  };
}