import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';

interface RouteGuardProps {
  children: React.ReactNode;
  allowedRoles: string[];
  allowPending?: boolean;
}

export function RouteGuard({ children, allowedRoles, allowPending = false }: RouteGuardProps) {
  const { user, isLoading, isPending } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && user) {
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
    }
  }, [user, isLoading, allowedRoles, allowPending, isPending, setLocation]);

  if (isLoading) {
    return null;
  }

  if (!user || !user.role || !allowedRoles.includes(user.role)) {
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
