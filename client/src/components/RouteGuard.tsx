import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';

interface RouteGuardProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

export function RouteGuard({ children, allowedRoles }: RouteGuardProps) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && user) {
      // Treat missing or unknown roles as unauthorized
      const userRole = user.role;
      
      if (!userRole || !allowedRoles.includes(userRole)) {
        // Redirect unauthorized users back to home
        setLocation('/');
        return;
      }
      
      // For employee role, check if they're approved
      // Admins always have access
      // Consider both isApproved flag and status field (active/approved are both valid)
      const isUserApproved = user.isApproved || user.status === 'active' || user.status === 'approved';
      
      if (userRole === 'employee' && !isUserApproved) {
        // Redirect unapproved employees to pending approval page
        setLocation('/pending-approval');
        return;
      }
      
      // For customer role, check if they're approved
      if (userRole === 'customer' && !isUserApproved) {
        // Redirect unapproved customers to pending approval page
        setLocation('/pending-approval');
      }
    }
  }, [user, isLoading, allowedRoles, setLocation]);

  // Show nothing while checking authorization
  if (isLoading) {
    return null;
  }

  // If user doesn't have a valid role or the right role, don't render the component
  if (!user || !user.role || !allowedRoles.includes(user.role)) {
    return null;
  }

  // Check if user is approved (consider both isApproved and status)
  const isUserApproved = user.isApproved || user.status === 'active' || user.status === 'approved';
  
  // For employee role, check if they're approved (admins bypass this check)
  if (user.role === 'employee' && !isUserApproved) {
    return null;
  }
  
  // For customer role, check if they're approved
  if (user.role === 'customer' && !isUserApproved) {
    return null;
  }

  return <>{children}</>;
}
