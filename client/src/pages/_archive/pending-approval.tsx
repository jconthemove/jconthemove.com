import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Clock, Mail, ShieldCheck, Briefcase } from "lucide-react";
import { ComplianceCheck } from "@/components/compliance-check";
import { Link } from "wouter";

export default function PendingApprovalPage() {
  const { user } = useAuth();

  const hasVerifiedAge = user?.tosAccepted && user?.dateOfBirth;

  return (
    <ComplianceCheck>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full bg-slate-800/50 border-slate-700">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center">
              <Clock className="h-8 w-8 text-yellow-400" />
            </div>
            <CardTitle className="text-2xl text-white">Account Pending Approval</CardTitle>
            <CardDescription className="text-slate-400">
              Your account is awaiting administrator approval
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasVerifiedAge && (
              <Alert className="bg-green-900/30 border-green-700">
                <ShieldCheck className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-300">
                  Age verified and Terms of Service accepted. You can view your jobs while waiting for full approval.
                </AlertDescription>
              </Alert>
            )}

            <Alert className="bg-slate-700/50 border-slate-600">
              <Mail className="h-4 w-4 text-slate-400" />
              <AlertDescription className="text-slate-300">
                Your account has been created successfully. An administrator will review and approve your account shortly.
              </AlertDescription>
            </Alert>

            <div className="bg-slate-700/50 rounded-lg p-4 space-y-2">
              <p className="text-sm text-slate-400">Account Details:</p>
              <p className="font-medium text-white">{user?.firstName} {user?.lastName}</p>
              <p className="text-sm text-slate-400">{user?.username || user?.email}</p>
            </div>

            {hasVerifiedAge && user?.role === 'customer' && (
              <Link href="/customer-portal">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  <Briefcase className="h-4 w-4 mr-2" />
                  View My Jobs
                </Button>
              </Link>
            )}

            {hasVerifiedAge && user?.role === 'employee' && (
              <Link href="/employee-home">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  <Briefcase className="h-4 w-4 mr-2" />
                  View Available Jobs
                </Button>
              </Link>
            )}

            <div className="border-t border-slate-700 pt-4 space-y-2">
              <p className="font-medium text-sm text-white">What happens next?</p>
              <ul className="text-sm text-slate-400 space-y-1 list-disc list-inside">
                <li>An administrator will review your account request</li>
                <li>You'll receive full access once approved</li>
                {!hasVerifiedAge && <li>Complete age verification above to view your jobs while you wait</li>}
                {hasVerifiedAge && <li>You can view your jobs while waiting for full approval</li>}
              </ul>
            </div>

            <div className="border-t border-slate-700 pt-4 mt-4">
              <p className="text-sm font-medium text-center mb-2 text-white">
                Need Help?
              </p>
              <p className="text-xs text-center text-slate-400">
                Contact: <strong className="text-white">upmichiganstatemovers@gmail.com</strong>
              </p>
              <p className="text-xs text-center text-slate-400">
                Phone: <strong className="text-white">(906) 285-9312</strong>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ComplianceCheck>
  );
}
