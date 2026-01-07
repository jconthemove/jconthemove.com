import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Link } from 'wouter';
import { 
  User, 
  Wallet, 
  Briefcase, 
  HelpCircle, 
  Camera, 
  Upload,
  MessageSquare,
  Save,
  ArrowLeft,
  Check,
  X,
  Copy,
  Edit2,
  Shield,
  ChevronRight
} from 'lucide-react';
import { SiSolana } from 'react-icons/si';
import { WalletChoiceModal } from '@/components/WalletChoiceModal';

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [helpMessage, setHelpMessage] = useState('');
  const [username, setUsername] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [showHelpForm, setShowHelpForm] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [showWalletChoiceModal, setShowWalletChoiceModal] = useState(false);

  const { data: walletPreference, isLoading: prefLoading } = useQuery<{
    walletMode: 'personal' | 'company' | null;
    personalWalletAddress: string | null;
    companyWalletId: string | null;
    hasWalletConfigured: boolean;
  }>({
    queryKey: ['/api/user/wallet-preference'],
    enabled: !!user,
  });

  useEffect(() => {
    if (user?.username) {
      setUsername(user.username);
    }
  }, [user?.username]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfileImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadProfileImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const profileImageUrl = await base64Promise;
      const response = await apiRequest('POST', '/api/user/profile-image', { profileImageUrl });
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Profile photo updated" });
      setProfileImage(null);
      setImagePreview(null);
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    }
  });

  const submitHelpRequestMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest('POST', '/api/support/help-request', { message, imageUrls: [] });
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Help request submitted", description: "We'll get back to you soon" });
      setHelpMessage('');
      setShowHelpForm(false);
    },
    onError: (error: Error) => {
      toast({ title: "Submission failed", description: error.message, variant: "destructive" });
    }
  });

  const updateUsernameMutation = useMutation({
    mutationFn: async (newUsername: string) => {
      const response = await apiRequest('POST', '/api/auth/user/username', { username: newUsername });
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Username updated", description: "Your username has been saved" });
      setEditingUsername(false);
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  });

  const copyToClipboard = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    toast({ title: "Copied!", description: "Address copied to clipboard" });
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const checkUsernameAvailability = async (newUsername: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (newUsername.length < 3 || newUsername.length > 20 || !/^[a-zA-Z0-9_]+$/.test(newUsername)) {
      setUsernameAvailable(null);
      setCheckingUsername(false);
      return;
    }
    if (newUsername === user?.username) {
      setUsernameAvailable(true);
      setCheckingUsername(false);
      return;
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setCheckingUsername(true);
    try {
      const response = await fetch(`/api/auth/username/check/${newUsername}`, { signal: controller.signal });
      const data = await response.json();
      if (!controller.signal.aborted) setUsernameAvailable(data.available);
    } catch (error: any) {
      if (error.name !== 'AbortError') setUsernameAvailable(null);
    } finally {
      if (!controller.signal.aborted) setCheckingUsername(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  const userInitials = user?.firstName && user?.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Back Button */}
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10 mb-6" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>

        {/* Profile Header Card */}
        <Card className="bg-gradient-to-br from-blue-600 to-purple-700 border-2 border-blue-400/30 mb-6 overflow-hidden" data-testid="card-profile-header">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-20 w-20 border-4 border-white/30">
                  <AvatarImage src={imagePreview || user?.profileImageUrl || undefined} />
                  <AvatarFallback className="text-2xl bg-white/20 text-white">{userInitials}</AvatarFallback>
                </Avatar>
                <Label htmlFor="profile-image" className="absolute -bottom-1 -right-1 cursor-pointer">
                  <div className="bg-white rounded-full p-1.5 shadow-lg hover:scale-110 transition-transform">
                    <Camera className="h-4 w-4 text-slate-700" />
                  </div>
                  <Input
                    id="profile-image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    data-testid="input-profile-image"
                  />
                </Label>
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-white" data-testid="text-user-name">
                  {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : 'Welcome!'}
                </h1>
                <p className="text-blue-100" data-testid="text-username">@{user?.username || 'set username'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs text-white capitalize">{user?.role || 'Member'}</span>
                </div>
              </div>
            </div>
            {profileImage && (
              <Button
                onClick={() => uploadProfileImageMutation.mutate(profileImage)}
                disabled={uploadProfileImageMutation.isPending}
                className="w-full mt-4 bg-white text-purple-700 hover:bg-white/90"
                data-testid="button-upload-photo"
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploadProfileImageMutation.isPending ? 'Uploading...' : 'Save Photo'}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Wallet Card */}
          <Card 
            className="bg-gradient-to-br from-purple-600 to-purple-800 border-2 border-purple-400/30 cursor-pointer hover:scale-[1.02] transition-all"
            onClick={() => setShowWalletChoiceModal(true)}
            data-testid="card-wallet"
          >
            <CardContent className="p-4 text-center">
              <div className="bg-white/20 p-3 rounded-full w-fit mx-auto mb-3">
                <Wallet className="h-6 w-6 text-white" />
              </div>
              <h3 className="font-semibold text-white mb-1">Payout Wallet</h3>
              <p className="text-purple-200 text-xs">
                {walletPreference?.hasWalletConfigured ? 'Connected' : 'Set Up'}
              </p>
            </CardContent>
          </Card>

          {/* Jobs Card */}
          <Link href="/dashboard">
            <Card className="bg-gradient-to-br from-orange-600 to-orange-800 border-2 border-orange-400/30 cursor-pointer hover:scale-[1.02] transition-all h-full" data-testid="card-jobs">
              <CardContent className="p-4 text-center">
                <div className="bg-white/20 p-3 rounded-full w-fit mx-auto mb-3">
                  <Briefcase className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-semibold text-white mb-1">My Jobs</h3>
                <p className="text-orange-200 text-xs">View Dashboard</p>
              </CardContent>
            </Card>
          </Link>

          {/* Rewards Card */}
          <Link href="/rewards">
            <Card className="bg-gradient-to-br from-green-600 to-green-800 border-2 border-green-400/30 cursor-pointer hover:scale-[1.02] transition-all h-full" data-testid="card-rewards">
              <CardContent className="p-4 text-center">
                <div className="bg-white/20 p-3 rounded-full w-fit mx-auto mb-3">
                  <SiSolana className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-semibold text-white mb-1">Rewards</h3>
                <p className="text-green-200 text-xs">JCMOVES Tokens</p>
              </CardContent>
            </Card>
          </Link>

          {/* Help Card */}
          <Card 
            className="bg-gradient-to-br from-cyan-600 to-cyan-800 border-2 border-cyan-400/30 cursor-pointer hover:scale-[1.02] transition-all"
            onClick={() => setShowHelpForm(!showHelpForm)}
            data-testid="card-help"
          >
            <CardContent className="p-4 text-center">
              <div className="bg-white/20 p-3 rounded-full w-fit mx-auto mb-3">
                <HelpCircle className="h-6 w-6 text-white" />
              </div>
              <h3 className="font-semibold text-white mb-1">Get Help</h3>
              <p className="text-cyan-200 text-xs">Contact Support</p>
            </CardContent>
          </Card>
        </div>

        {/* Wallet Status Section */}
        {walletPreference?.hasWalletConfigured && (
          <Card className="bg-slate-800/50 border border-slate-700 mb-4" data-testid="card-wallet-status">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-500/20 p-2 rounded-full">
                    <SiSolana className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">
                      {walletPreference.walletMode === 'personal' ? 'Phantom Wallet' : 'Company Rewards Account'}
                    </p>
                    {walletPreference.personalWalletAddress && (
                      <p className="text-slate-400 text-xs font-mono truncate max-w-[200px]">
                        {walletPreference.personalWalletAddress}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {walletPreference.personalWalletAddress && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(walletPreference.personalWalletAddress!)}
                      className="text-slate-400 hover:text-white"
                    >
                      {copiedAddress === walletPreference.personalWalletAddress ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowWalletChoiceModal(true)}
                    className="text-slate-400 hover:text-white"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Account Settings Card */}
        <Card className="bg-slate-800/50 border border-slate-700 mb-4" data-testid="card-settings">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <User className="h-5 w-5 text-slate-400" />
              <h3 className="text-white font-medium">Account Settings</h3>
            </div>

            {/* Email */}
            <div className="flex items-center justify-between py-3 border-b border-slate-700">
              <div>
                <p className="text-slate-400 text-xs">Email</p>
                <p className="text-white text-sm" data-testid="text-user-email">{user?.email}</p>
              </div>
              <Shield className="h-4 w-4 text-slate-500" />
            </div>

            {/* Username */}
            <div className="py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-xs">Username</p>
                  {editingUsername ? (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="relative">
                        <Input
                          value={username}
                          onChange={(e) => {
                            setUsername(e.target.value);
                            checkUsernameAvailability(e.target.value);
                          }}
                          className="h-8 w-40 bg-slate-900 border-slate-600 text-white text-sm"
                          placeholder="username"
                          data-testid="input-username"
                        />
                        {checkingUsername && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2">
                            <div className="animate-spin rounded-full h-3 w-3 border-b border-white"></div>
                          </div>
                        )}
                        {!checkingUsername && usernameAvailable === true && (
                          <Check className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-green-400" />
                        )}
                        {!checkingUsername && usernameAvailable === false && (
                          <X className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-red-400" />
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => updateUsernameMutation.mutate(username)}
                        disabled={!usernameAvailable || updateUsernameMutation.isPending}
                        className="h-8 bg-green-600 hover:bg-green-700"
                        data-testid="button-save-username"
                      >
                        <Save className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingUsername(false);
                          setUsername(user?.username || '');
                        }}
                        className="h-8 text-slate-400"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-white text-sm">{user?.username || 'Not set'}</p>
                  )}
                </div>
                {!editingUsername && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingUsername(true)}
                    className="text-slate-400 hover:text-white"
                    data-testid="button-edit-username"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {editingUsername && usernameAvailable === false && (
                <p className="text-red-400 text-xs mt-1">Username taken</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Help Form (Expandable) */}
        {showHelpForm && (
          <Card className="bg-slate-800/50 border border-slate-700 mb-4" data-testid="card-help-form">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="h-5 w-5 text-cyan-400" />
                <h3 className="text-white font-medium">Submit Help Request</h3>
              </div>
              <Textarea
                value={helpMessage}
                onChange={(e) => setHelpMessage(e.target.value)}
                placeholder="Describe your issue..."
                rows={4}
                className="bg-slate-900 border-slate-600 text-white mb-3"
                data-testid="textarea-help-message"
              />
              <Button
                onClick={() => submitHelpRequestMutation.mutate(helpMessage)}
                disabled={!helpMessage.trim() || submitHelpRequestMutation.isPending}
                className="w-full bg-cyan-600 hover:bg-cyan-700"
                data-testid="button-submit-help"
              >
                {submitHelpRequestMutation.isPending ? 'Sending...' : 'Send Request'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Admin Link */}
        {user?.role === 'admin' && (
          <Link href="/in-god-we-trust">
            <Card className="bg-gradient-to-r from-amber-600/20 to-orange-600/20 border border-amber-500/30 cursor-pointer hover:border-amber-400/50 transition-all" data-testid="card-admin">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-500/20 p-2 rounded-full">
                      <Shield className="h-5 w-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-amber-100 font-medium">Admin Dashboard</p>
                      <p className="text-amber-200/60 text-xs">IN GOD WE TRUST</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-amber-400" />
                </div>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      <WalletChoiceModal
        open={showWalletChoiceModal}
        onClose={() => setShowWalletChoiceModal(false)}
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/user/wallet-preference'] });
        }}
      />
    </div>
  );
}
