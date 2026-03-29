import { Component as ReactComponent, ReactNode } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { WalletProviderWrapper } from "@/components/WalletProviderWrapper";
import { RouteGuard } from "@/components/RouteGuard";
import { ComplianceCheck } from "@/components/compliance-check";
import { EarnTasksButton } from "@/components/earn-tasks-button";
import { FloatingMomHeart } from "@/components/floating-mom-heart";
import Header from "@/components/header";
import PwaInstallPrompt from "@/components/pwa-install-prompt";
import HomePage from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import RewardsPage from "@/pages/rewards";
import ProfilePage from "@/pages/profile";
import EmployeeHomePage from "@/pages/employee-home";
import TeamHub from "@/pages/hub";
import AdminControlPage from "@/pages/control";
import EmployeeDashboard from "@/pages/employee-dashboard";
import EmployeeAddJob from "@/pages/employee-add-job";
import LeadsPage from "@/pages/leads";
import CustomerPortal from "@/pages/customer-portal";
import PendingApprovalPage from "@/pages/pending-approval";
import InGodWeTrustPage from "@/pages/in-god-we-trust";
import AdminTreasuryPage from "@/pages/admin-treasury";
import AdminUsersPage from "@/pages/admin-users";
import AdminTestimonialsPage from "@/pages/admin-testimonials";
import AdminPromoCodesPage from "@/pages/admin-promo-codes";
import AdminPipelinePage from "@/pages/admin-pipeline";
import RewardsMarketplacePage from "@/pages/rewards-marketplace";
import AdminRewardShopPage from "@/pages/admin-reward-shop";
import AdminSystemCheckPage from "@/pages/admin-system-check";
import NotFound from "@/pages/not-found";
import MobileLeadManager from "@/components/mobile-lead-manager";
import CustomerMobileInterface from "@/components/customer-mobile-interface";

import JobDetailPage from "@/pages/job-detail";
import TermsOfService from "@/pages/terms";
import PendingQuotesPage from "@/pages/pending-quotes";
import EmployeesPage from "@/pages/employees";
import LeadDetailPage from "@/pages/lead-detail";
import EmployeeRegister from "@/pages/employee-register";
import EmployeeLogin from "@/pages/employee-login";
import CustomerLogin from "@/pages/customer-login";
import ForgotAccessPage from "@/pages/forgot-access";
import LeaveReviewPage from "@/pages/leave-review";
import QuotePage from "@/pages/quote";
import SponsorsPage from "@/pages/sponsors";
import ServicesPage from "@/pages/services";
import GalleryPage from "@/pages/gallery";
import ReviewsPage from "@/pages/reviews";
import SwapPage from "@/pages/swap";
import RequestSwapPage from "@/pages/request-swap";
import MiningPage from "@/pages/mining";
import SnowRemovalPage from "@/pages/snow-removal";
import MobilePreviewPage from "@/pages/mobile-preview";
import PiJackpotPage from "@/pages/pi-jackpot";
import PrivacyPolicy from "@/pages/privacy";
import NatureMadeJewls from "@/pages/nature-made-jewls";
import JewelryDetailPage from "@/pages/jewelry-detail";
import LegacyHomePage from "@/pages/_archive/home";
import MovingEstimator from "@/pages/moving-estimator";
import PaymentSuccessPage from "@/pages/payment-success";
import PromoHalfDayPage from "@/pages/promo-half-day";
import CartPage from "@/pages/cart";
import BitcoinPaymentPage from "@/pages/bitcoin-payment";
import AdminBtcPaymentsPage from "@/pages/admin-btc-payments";
import StakingPage from "@/pages/staking";
import AdminQuoteReviewPage from "@/pages/admin-quote-review";
import { CartProvider } from "@/hooks/useCart";
import { NotificationPrompt } from "@/components/notification-prompt";
import { useMiningNotifications } from "@/hooks/useMiningNotifications";
import { RealtimeProvider } from "@/components/realtime-provider";

// Landing page for unauthenticated users
// Note: home.tsx has its own built-in footer and dedication banner — no wrapper Footer needed
function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <HomePage />
    </div>
  );
}

// Root error boundary — catches ANY crash in the entire app tree
class RootErrorBoundary extends ReactComponent<
  { children: ReactNode },
  { hasError: boolean; error: string; stack: string; componentStack: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: "", stack: "", componentStack: "" };
  }
  static getDerivedStateFromError(error: any) {
    return {
      hasError: true,
      error: error?.message || String(error) || "Unknown error",
      stack: error?.stack || "",
      componentStack: "",
    };
  }
  componentDidCatch(error: any, info: any) {
    console.error("[RootErrorBoundary] Caught crash:", error, info);
    this.setState({ componentStack: info?.componentStack || "" });
    fetch("/api/client-error", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ boundary: "RootErrorBoundary", error: error?.message, stack: error?.stack, componentStack: info?.componentStack }),
    }).catch(() => {});
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", background: "#111", color: "#eee", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", fontFamily: "sans-serif" }}>
          <div style={{ maxWidth: 600, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", marginBottom: "0.5rem" }}>Something went wrong</h2>
            <p style={{ color: "#aaa", fontSize: "0.875rem", marginBottom: "1rem", wordBreak: "break-word" }}>{this.state.error}</p>
            {this.state.componentStack && (
              <pre style={{ background: "#1e1e1e", color: "#8f8", fontSize: "0.65rem", padding: "0.75rem", borderRadius: "0.5rem", textAlign: "left", overflowX: "auto", maxHeight: 220, marginBottom: "0.5rem" }}>
                {this.state.componentStack.slice(0, 1200)}
              </pre>
            )}
            {this.state.stack && (
              <pre style={{ background: "#1e1e1e", color: "#f88", fontSize: "0.65rem", padding: "0.75rem", borderRadius: "0.5rem", textAlign: "left", overflowX: "auto", maxHeight: 160, marginBottom: "1rem" }}>
                {this.state.stack.slice(0, 600)}
              </pre>
            )}
            <button
              style={{ padding: "0.5rem 1.5rem", background: "#f97316", color: "#fff", border: "none", borderRadius: "0.5rem", cursor: "pointer", fontWeight: "bold" }}
              onClick={() => { this.setState({ hasError: false, error: "", stack: "", componentStack: "" }); window.location.href = "/"; }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Page-level error boundary — shows friendly message and recovers per-page
class PageErrorBoundary extends ReactComponent<
  { children: ReactNode },
  { hasError: boolean; error: string; componentStack: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: "", componentStack: "" };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: error?.message || "Something went wrong", componentStack: "" };
  }
  componentDidCatch(error: any, info: any) {
    console.error("[PageErrorBoundary] Caught crash:", error, info);
    this.setState({ componentStack: info?.componentStack || "" });
    fetch("/api/client-error", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ boundary: "PageErrorBoundary", error: error?.message, stack: error?.stack, componentStack: info?.componentStack }),
    }).catch(() => {});
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", background: "#111", color: "#eee", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", fontFamily: "sans-serif" }}>
          <div style={{ maxWidth: 600, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", marginBottom: "0.5rem" }}>Something went wrong</h2>
            <p style={{ color: "#aaa", fontSize: "0.875rem", marginBottom: "1rem", wordBreak: "break-word" }}>{this.state.error}</p>
            {this.state.componentStack && (
              <pre style={{ background: "#1e1e1e", color: "#8f8", fontSize: "0.65rem", padding: "0.75rem", borderRadius: "0.5rem", textAlign: "left", overflowX: "auto", maxHeight: 220, marginBottom: "1rem" }}>
                {this.state.componentStack.slice(0, 1200)}
              </pre>
            )}
            <button
              style={{ padding: "0.5rem 1.5rem", background: "#f97316", color: "#fff", border: "none", borderRadius: "0.5rem", cursor: "pointer", fontWeight: "bold" }}
              onClick={() => { this.setState({ hasError: false, error: "", componentStack: "" }); window.location.href = "/"; }}
            >
              Go Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Silent error boundary — wraps floating/overlay components so they fail invisibly
class SilentErrorBoundary extends ReactComponent<
  { children: ReactNode; label?: string },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any, info: any) {
    console.error(`[SilentErrorBoundary:${(this as any).props.label ?? "?"}] Suppressed crash:`, error, info);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// Unified page wrapper with responsive header
function PageWrapper({ component: Component }: { component: any }) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Header />
      <main>
        <PageErrorBoundary>
          <Component />
        </PageErrorBoundary>
      </main>
    </div>
  );
}

function getDefaultAuthenticatedPath(role?: string) {
  switch (role) {
    case "customer":
      return "/customer-portal";
    case "employee":
      return "/jobs";
    case "admin":
    case "business_owner":
      return "/control";
    default:
      return "/";
  }
}

// Main app for authenticated users - Unified routing for all devices
function AuthenticatedApp() {
  const { user, isPending } = useAuth();
  useMiningNotifications();

  // Redirect pending users to pending-approval page
  if (isPending) {
    return (
      <ComplianceCheck>
        <div className="min-h-screen bg-background text-foreground font-sans">
          <Switch>
            <Route path="/pending-approval">
              <PendingApprovalPage />
            </Route>
            <Route path="/customer-portal">
              <RouteGuard allowedRoles={['customer']} allowPending={true}>
                <PageWrapper component={CustomerPortal} />
              </RouteGuard>
            </Route>
            <Route>
              <Redirect to="/pending-approval" />
            </Route>
          </Switch>
        </div>
      </ComplianceCheck>
    );
  }
  
  return (
    <ComplianceCheck>
      <div className="min-h-screen bg-background text-foreground font-sans">
        <NotificationPrompt />
        <RealtimeProvider />
        <Switch>
          {/* Primary routes - accessible on all devices */}
          <Route path="/">
            <Redirect to={getDefaultAuthenticatedPath(user?.role)} />
          </Route>
          <Route path="/dashboard">
            <RouteGuard allowedRoles={['admin', 'business_owner']}>
              <PageWrapper component={Dashboard} />
            </RouteGuard>
          </Route>
          <Route path="/employee/add-job">
            <RouteGuard allowedRoles={['admin', 'business_owner']}>
              <EmployeeAddJob />
            </RouteGuard>
          </Route>
          <Route path="/employee/dashboard">
            <RouteGuard allowedRoles={['admin', 'business_owner']}>
              <PageWrapper component={EmployeeDashboard} />
            </RouteGuard>
          </Route>
          <Route path="/leads">
            <RouteGuard allowedRoles={['admin', 'business_owner']}>
              <PageWrapper component={LeadsPage} />
            </RouteGuard>
          </Route>
          <Route path="/lead/:id">
            <PageWrapper component={LeadDetailPage} />
          </Route>
          <Route path="/pending-quotes">
            <RouteGuard allowedRoles={['admin', 'employee']}>
              <PageWrapper component={PendingQuotesPage} />
            </RouteGuard>
          </Route>
          <Route path="/employees">
            <RouteGuard allowedRoles={['admin']}>
              <PageWrapper component={EmployeesPage} />
            </RouteGuard>
          </Route>
          <Route path="/rewards">
            <PageWrapper component={RewardsPage} />
          </Route>
          <Route path="/mining">
            <PageWrapper component={MiningPage} />
          </Route>
          <Route path="/swap">
            <PageWrapper component={SwapPage} />
          </Route>
          <Route path="/request-swap">
            <RouteGuard allowedRoles={['admin', 'employee']}>
              <PageWrapper component={RequestSwapPage} />
            </RouteGuard>
          </Route>
          <Route path="/reviews">
            <PageWrapper component={ReviewsPage} />
          </Route>
          <Route path="/profile">
            <PageWrapper component={ProfilePage} />
          </Route>
          <Route path="/customer-portal">
            <RouteGuard allowedRoles={['customer']} allowPending={true}>
              <PageWrapper component={CustomerPortal} />
            </RouteGuard>
          </Route>
          <Route path="/pending-approval">
            <PendingApprovalPage />
          </Route>
          <Route path="/hub">
            <RouteGuard allowedRoles={['admin', 'business_owner']}>
              <PageWrapper component={TeamHub} />
            </RouteGuard>
          </Route>
          <Route path="/control">
            <RouteGuard allowedRoles={['admin', 'business_owner']}>
              <PageWrapper component={AdminControlPage} />
            </RouteGuard>
          </Route>
          <Route path="/in-god-we-trust">
            <RouteGuard allowedRoles={['admin', 'business_owner']}>
              <PageWrapper component={InGodWeTrustPage} />
            </RouteGuard>
          </Route>
          <Route path="/admin/treasury">
            <RouteGuard allowedRoles={['admin', 'business_owner']}>
              <PageWrapper component={AdminTreasuryPage} />
            </RouteGuard>
          </Route>
          <Route path="/admin/users">
            <RouteGuard allowedRoles={['admin', 'business_owner']}>
              <PageWrapper component={AdminUsersPage} />
            </RouteGuard>
          </Route>
          <Route path="/admin/testimonials">
            <RouteGuard allowedRoles={['admin', 'business_owner']}>
              <PageWrapper component={AdminTestimonialsPage} />
            </RouteGuard>
          </Route>
          <Route path="/admin/pipeline">
            <RouteGuard allowedRoles={['admin', 'business_owner']}>
              <AdminPipelinePage />
            </RouteGuard>
          </Route>
          <Route path="/admin/promo-codes">
            <RouteGuard allowedRoles={['admin', 'business_owner']}>
              <PageWrapper component={AdminPromoCodesPage} />
            </RouteGuard>
          </Route>
          <Route path="/admin/system-check">
            <RouteGuard allowedRoles={['admin', 'business_owner']}>
              <PageWrapper component={AdminSystemCheckPage} />
            </RouteGuard>
          </Route>
          <Route path="/admin/marketplace">
            <RouteGuard allowedRoles={['admin', 'business_owner']}>
              <PageWrapper component={AdminRewardShopPage} />
            </RouteGuard>
          </Route>
          <Route path="/marketplace">
            <PageWrapper component={RewardsMarketplacePage} />
          </Route>
          <Route path="/snow-removal">
            <RouteGuard allowedRoles={['admin', 'employee', 'business_owner']}>
              <PageWrapper component={SnowRemovalPage} />
            </RouteGuard>
          </Route>
          <Route path="/mobile-preview">
            <RouteGuard allowedRoles={['admin', 'business_owner']}>
              <MobilePreviewPage />
            </RouteGuard>
          </Route>
          
          {/* Job management interface */}
          <Route path="/jobs">
            <RouteGuard allowedRoles={['employee']}>
              <MobileLeadManager />
            </RouteGuard>
          </Route>
          
          {/* Legacy admin routes - redirect to unified dashboard */}
          <Route path="/treasury">
            <Redirect to="/in-god-we-trust" />
          </Route>
          <Route path="/admin-moonshot">
            <Redirect to="/in-god-we-trust" />
          </Route>
          
          {/* Job detail route */}
          <Route path="/job/:id">
            <RouteGuard allowedRoles={['admin']}>
              <JobDetailPage />
            </RouteGuard>
          </Route>
          
          <Route component={NotFound} />
        </Switch>
      </div>
    </ComplianceCheck>
  );
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      {/* Public Authentication Routes - No Replit account needed! */}
      <Route path="/employee-register" component={EmployeeRegister} />
      <Route path="/employee-login" component={EmployeeLogin} />
      <Route path="/customer-login" component={CustomerLogin} />
      <Route path="/forgot-access" component={ForgotAccessPage} />
      <Route path="/leave-review" component={LeaveReviewPage} />
      
      {/* Customer interface - accessible to all users without authentication */}
      <Route path="/customer" component={CustomerMobileInterface} />
      
      {/* Terms of Service - accessible to all */}
      <Route path="/terms" component={TermsOfService} />
      
      {/* Privacy Policy - accessible to all */}
      <Route path="/privacy" component={PrivacyPolicy} />
      
      {/* Quote page - accessible to all */}
      <Route path="/quote" component={QuotePage} />
      
      {/* Sponsors page - accessible to all */}
      <Route path="/sponsors" component={SponsorsPage} />
      
      {/* Services page - accessible to all */}
      <Route path="/services" component={ServicesPage} />
      
      {/* Gallery page - accessible to all */}
      <Route path="/gallery" component={GalleryPage} />
      
      {/* Reviews page - accessible to all */}
      <Route path="/reviews" component={ReviewsPage} />
      
      {/* Pi Jackpot - Pi Network lottery app landing page */}
      <Route path="/pi-jackpot" component={PiJackpotPage} />
      
      {/* Nature Made Jewls - Jewelry business page */}
      <Route path="/nature-made-jewls" component={NatureMadeJewls} />
      <Route path="/nature-made-jewls/:id" component={JewelryDetailPage} />
      {/* Legacy public homepage preserved as a fallback/reference during rollout */}
      <Route path="/legacy-home" component={LegacyHomePage} />
      <Route path="/welcome" component={LegacyHomePage} />
      <Route path="/moving-estimator" component={MovingEstimator} />
      <Route path="/payment-success" component={PaymentSuccessPage} />
      <Route path="/promo/half-day" component={PromoHalfDayPage} />
      <Route path="/cart" component={CartPage} />
      <Route path="/bitcoin-payment" component={BitcoinPaymentPage} />
      <Route path="/admin/btc-payments" component={AdminBtcPaymentsPage} />
      <Route path="/staking" component={StakingPage} />
      <Route path="/admin/quote-review">
        <RouteGuard allowedRoles={['admin', 'business_owner']}>
          <AdminQuoteReviewPage />
        </RouteGuard>
      </Route>
      
      {/* Authenticated vs unauthenticated routing */}
      <Route>
        {isAuthenticated ? <AuthenticatedApp /> : <LandingPage />}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <RootErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <WalletProviderWrapper>
            <CartProvider>
              <TooltipProvider>
                <PageErrorBoundary>
                  <Router />
                </PageErrorBoundary>
                <Toaster />
                <SilentErrorBoundary label="PwaInstallPrompt">
                  <PwaInstallPrompt />
                </SilentErrorBoundary>
                <SilentErrorBoundary label="EarnTasksButton">
                  <EarnTasksButton />
                </SilentErrorBoundary>
                <SilentErrorBoundary label="FloatingMomHeart">
                  <FloatingMomHeart />
                </SilentErrorBoundary>
              </TooltipProvider>
            </CartProvider>
          </WalletProviderWrapper>
        </QueryClientProvider>
      </ThemeProvider>
    </RootErrorBoundary>
  );
}

export default App;
