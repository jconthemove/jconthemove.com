import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

interface RouteGuardProps {
  children: React.ReactNode;
  allowedRoles: string[];
  allowPending?: boolean;
}

export function RouteGuard({ children, allowedRoles, allowPending = false }: RouteGuardProps) {
  const { user, isLoading, isPending } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;

    // Not logged in — send to login
    if (!user) {
      setLocation('/employee-login');
      return;
    }

    const userRole = user.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      setLocation('/');
      return;
    }

    if (isPending && !allowPending) {
      setLocation('/pending-approval');
      return;
    }

    const isUserApproved = user.isApproved || user.status === 'active' || user.status === 'approved';

    if (userRole === 'employee' && !isUserApproved && !isPending) {
      setLocation('/pending-approval');
      return;
    }

    if (userRole === 'customer' && !isUserApproved && !isPending) {
      setLocation('/pending-approval');
      return;
    }
  }, [user, isLoading, allowedRoles, allowPending, isPending, setLocation]);

  // Show spinner while auth is resolving
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Wrong role
  if (!user.role || !allowedRoles.includes(user.role)) {
    return null;
  }

  if (isPending && !allowPending) {
    return null;
  }

  const isUserApproved = user.isApproved || user.status === 'active' || user.status === 'approved';

  if (user.role === 'employee' && !isUserApproved && !isPending) {
    return null;
  }

  if (user.role === 'customer' && !isUserApproved && !isPending) {
    return null;
  }

  return <>{children}</>;
}
