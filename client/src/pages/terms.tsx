import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/">
          <Button variant="ghost" className="mb-6 text-white/70 hover:text-white hover:bg-white/10" data-testid="button-back">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-8 text-white" data-testid="text-title">Terms of Service</h1>
        
        <div className="prose prose-invert max-w-none prose-headings:text-white prose-p:text-slate-300 prose-li:text-slate-300 prose-a:text-blue-400">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" data-testid="text-section-age">Age Requirements</h2>
            <p className="mb-4">
              You must be at least 18 years of age to use this service. By accepting these Terms of Service, 
              you confirm that you are 18 years or older. This requirement is mandated by federal and state 
              laws across all 50 states of the United States.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" data-testid="text-section-services">Services Provided</h2>
            <p className="mb-4">
              JC ON THE MOVE provides moving and junk removal services including:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>Residential moving services</li>
              <li>Commercial moving services</li>
              <li>Junk removal services</li>
              <li>Heavy item moving (pool tables, safes, etc.)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" data-testid="text-section-acceptance">Acceptance of Terms</h2>
            <p className="mb-4">
              By using our services, you agree to be bound by these Terms of Service and all applicable laws 
              and regulations. If you do not agree with any of these terms, you are prohibited from using our services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" data-testid="text-section-liability">Limitation of Liability</h2>
            <p className="mb-4">
              We take great care in providing our services, but we are not liable for any indirect, incidental, 
              special, consequential, or punitive damages resulting from your use of our services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" data-testid="text-section-privacy">Privacy and Data</h2>
            <p className="mb-4">
              We collect and process personal information in accordance with applicable privacy laws. 
              Your data is used solely for providing our services and will not be shared with third parties 
              without your consent.
            </p>
          </section>

          <section className="mb-8 p-6 bg-slate-800/50 border border-slate-700 rounded-lg">
            <h2 className="text-2xl font-semibold mb-4 text-white" data-testid="text-section-rewards">Rewards Disclaimer</h2>
            <p className="mb-4 text-slate-300">
              JC ON THE MOVE provides digital reward credits for participation in company services and promotions.
            </p>
            <p className="mb-4 text-slate-300">
              Rewards are not investments, do not represent ownership, and are not guaranteed to have monetary value.
            </p>
            <p className="mb-4 text-slate-300">
              JC ON THE MOVE does not provide custodial wallet services, financial accounts, or trading facilities.
            </p>
            <p className="mb-4 text-slate-300">
              Blockchain tokens, if issued, are distributed solely as rewards and only upon user request.
            </p>
            <div className="mt-4 pt-4 border-t border-slate-700">
              <p className="text-sm text-slate-400 mb-2">JC ON THE MOVE is:</p>
              <ul className="text-sm text-slate-400 space-y-1">
                <li className="flex items-center gap-2">✗ Not an exchange</li>
                <li className="flex items-center gap-2">✗ Not a broker</li>
                <li className="flex items-center gap-2">✗ Not a money service</li>
              </ul>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" data-testid="text-section-changes">Changes to Terms</h2>
            <p className="mb-4">
              We reserve the right to modify these terms at any time. Changes will be effective immediately 
              upon posting. Your continued use of our services after changes are posted constitutes acceptance 
              of the modified terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4" data-testid="text-section-contact">Contact Information</h2>
            <p className="mb-4">
              For questions about these Terms of Service, please contact us at:
            </p>
            <p className="mb-2">
              Email: <a href="mailto:upmichiganstatemovers@gmail.com" className="text-primary hover:underline">upmichiganstatemovers@gmail.com</a>
            </p>
            <p>
              Phone: <a href="tel:906-285-9312" className="text-primary hover:underline">906-285-9312</a>
            </p>
          </section>

          <p className="text-sm text-muted-foreground mt-8">
            Last updated: October 6, 2025
          </p>
        </div>
      </div>
    </div>
  );
}
