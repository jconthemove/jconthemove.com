import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, Mail } from "lucide-react";

export default function PendingApprovalPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full bg-slate-800/50 border-slate-700" data-testid="card-pending-approval">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center">
            <Clock className="h-8 w-8 text-yellow-400" data-testid="icon-pending" />
          </div>
          <CardTitle className="text-2xl text-white" data-testid="text-title">Account Pending Approval</CardTitle>
          <CardDescription className="text-slate-400" data-testid="text-description">
            Your employee account is awaiting administrator approval
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-slate-700/50 border-slate-600" data-testid="alert-info">
            <Mail className="h-4 w-4 text-slate-400" />
            <AlertDescription className="text-slate-300" data-testid="text-alert-description">
              Your account has been created successfully. An administrator will review and approve your account shortly.
            </AlertDescription>
          </Alert>

          <div className="bg-slate-700/50 rounded-lg p-4 space-y-2" data-testid="container-account-details">
            <p className="text-sm text-slate-400" data-testid="text-account-info">Account Details:</p>
            <p className="font-medium text-white" data-testid="text-user-name">{user?.firstName} {user?.lastName}</p>
            <p className="text-sm text-slate-400" data-testid="text-user-email">{user?.username || user?.email}</p>
          </div>

          <div className="border-t border-slate-700 pt-4 space-y-2" data-testid="container-next-steps">
            <p className="font-medium text-sm text-white" data-testid="text-next-steps">What happens next?</p>
            <ul className="text-sm text-slate-400 space-y-1 list-disc list-inside">
              <li data-testid="text-step-1">An administrator will review your account request</li>
              <li data-testid="text-step-2">You'll receive access once approved</li>
              <li data-testid="text-step-3">You can close this page and check back later</li>
            </ul>
          </div>

          <div className="border-t border-slate-700 pt-4 mt-4">
            <p className="text-sm font-medium text-center mb-2 text-white" data-testid="text-contact-heading">
              Need Help?
            </p>
            <p className="text-xs text-center text-slate-400" data-testid="text-contact-info">
              Contact: <strong className="text-white">upmichiganstatemovers@gmail.com</strong>
            </p>
            <p className="text-xs text-center text-slate-400" data-testid="text-contact-phone">
              Phone: <strong className="text-white">(906) 285-9312</strong>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
