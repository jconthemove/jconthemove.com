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
import Header from "@/components/header";
import Footer from "@/components/footer";
import HomePage from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import RewardsPage from "@/pages/rewards";
import ProfilePage from "@/pages/profile";
import EmployeeHomePage from "@/pages/employee-home";
import EmployeeDashboard from "@/pages/employee-dashboard";
import EmployeeAddJob from "@/pages/employee-add-job";
import LeadsPage from "@/pages/leads";
import CustomerPortal from "@/pages/customer-portal";
import PendingApprovalPage from "@/pages/pending-approval";
import TreasuryDashboard from "@/pages/treasury-dashboard";
import AdminDashboardFull from "@/pages/admin-dashboard-full";
import AdminMoonshotPage from "@/pages/admin-moonshot";
import InGodWeTrustPage from "@/pages/in-god-we-trust";
import AdminUsersPage from "@/pages/admin-users";
import AdminTestimonialsPage from "@/pages/admin-testimonials";
import NotFound from "@/pages/not-found";
import MobileLeadManager from "@/components/mobile-lead-manager";
import CustomerMobileInterface from "@/components/customer-mobile-interface";
import { ShopCatalogPage } from "@/pages/shop-catalog";
import { CreateShopItemPage } from "@/pages/create-shop-item";
import { ShopItemDetailPage } from "@/pages/shop-item-detail";
import JobDetailPage from "@/pages/job-detail";
import TermsOfService from "@/pages/terms";
import PendingQuotesPage from "@/pages/pending-quotes";
import EmployeesPage from "@/pages/employees";
import LeadDetailPage from "@/pages/lead-detail";
import EmployeeRegister from "@/pages/employee-register";
import EmployeeLogin from "@/pages/employee-login";
import CustomerLogin from "@/pages/customer-login";
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
import PaymentSuccessPage from "@/pages/payment-success";
import PromoHalfDayPage from "@/pages/promo-half-day";
import CartPage from "@/pages/cart";
import BitcoinPaymentPage from "@/pages/bitcoin-payment";
import StakingPage from "@/pages/staking";
import { CartProvider } from "@/hooks/useCart";
import { NotificationPrompt } from "@/components/notification-prompt";

// Landing page for unauthenticated users
function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Header />
      <main>
        <HomePage />
      </main>
      <Footer />
    </div>
  );
}

// Unified page wrapper with responsive header
function PageWrapper({ component: Component }: { component: any }) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Header />
      <main>
        <Component />
      </main>
    </div>
  );
}

// Main app for authenticated users - Unified routing for all devices
function AuthenticatedApp() {
  const { user, isPending } = useAuth();
  const [, setLocation] = useLocation();
  
  // Determine home page based on user role
  const HomePage = user?.role === 'customer' ? CustomerPortal : EmployeeHomePage;
  
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
              <RouteGuard allowedRoles={['customer', 'admin']} allowPending={true}>
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
        <Switch>
          {/* Primary routes - accessible on all devices */}
          <Route path="/">
            <PageWrapper component={HomePage} />
          </Route>
          <Route path="/dashboard">
            <RouteGuard allowedRoles={['admin', 'employee']}>
              <PageWrapper component={Dashboard} />
            </RouteGuard>
          </Route>
          <Route path="/employee/add-job">
            <RouteGuard allowedRoles={['admin', 'employee']}>
              <EmployeeAddJob />
            </RouteGuard>
          </Route>
          <Route path="/employee/dashboard">
            <RouteGuard allowedRoles={['admin', 'employee']}>
              <PageWrapper component={EmployeeDashboard} />
            </RouteGuard>
          </Route>
          <Route path="/leads">
            <RouteGuard allowedRoles={['admin', 'employee']}>
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
            <RouteGuard allowedRoles={['customer', 'admin']} allowPending={true}>
              <PageWrapper component={CustomerPortal} />
            </RouteGuard>
          </Route>
          <Route path="/pending-approval">
            <PendingApprovalPage />
          </Route>
          <Route path="/in-god-we-trust">
            <RouteGuard allowedRoles={['admin']}>
              <PageWrapper component={InGodWeTrustPage} />
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
            <RouteGuard allowedRoles={['admin', 'employee']}>
              <MobileLeadManager />
            </RouteGuard>
          </Route>
          
          {/* Shop routes */}
          <Route path="/shop">
            <PageWrapper component={ShopCatalogPage} />
          </Route>
          <Route path="/shop/create">
            <RouteGuard allowedRoles={['admin', 'employee']}>
              <PageWrapper component={CreateShopItemPage} />
            </RouteGuard>
          </Route>
          <Route path="/shop/:id">
            <ShopItemDetailPage />
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
      <Route path="/payment-success" component={PaymentSuccessPage} />
      <Route path="/promo/half-day" component={PromoHalfDayPage} />
      <Route path="/cart" component={CartPage} />
      <Route path="/bitcoin-payment" component={BitcoinPaymentPage} />
      <Route path="/staking" component={StakingPage} />
      
      {/* Lead detail - accessible without authentication (temporary for debugging) */}
      <Route path="/lead/:id">
        <PageWrapper component={LeadDetailPage} />
      </Route>
      
      {/* Leads list - accessible without authentication (temporary for debugging) */}
      <Route path="/leads">
        <PageWrapper component={LeadsPage} />
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
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <WalletProviderWrapper>
          <CartProvider>
            <TooltipProvider>
              <Router />
              <Toaster />
            </TooltipProvider>
          </CartProvider>
        </WalletProviderWrapper>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
