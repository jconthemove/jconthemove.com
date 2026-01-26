import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/">
          <Button variant="ghost" className="mb-6 text-white/70 hover:text-white hover:bg-white/10">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-8 text-white flex items-center gap-3">
          <Shield className="h-10 w-10 text-purple-400" />
          Privacy Policy
        </h1>
        
        <div className="prose prose-invert max-w-none prose-headings:text-white prose-p:text-slate-300 prose-li:text-slate-300 prose-a:text-blue-400">
          
          <section className="mb-10 p-6 bg-purple-900/30 border border-purple-500/30 rounded-lg">
            <h2 className="text-2xl font-semibold mb-4 text-purple-300">PRIVACY POLICY (for Pi Jackpot)</h2>
            <h3 className="text-xl font-medium mb-4 text-white">Privacy Policy — JC's Pi Jackpot</h3>
            
            <p className="mb-4">
              JC's Pi Jackpot respects your privacy.
            </p>
            
            <p className="mb-4">
              This application only collects information provided through the Pi SDK authentication flow (Pi username and public profile).
            </p>
            
            <p className="mb-4">
              We do not collect emails, passwords, private keys, KYC data, or payment information.
            </p>
            
            <p className="mb-4">
              All Pi transactions are handled directly through the Pi Network using the Pi SDK. We do not store or process Pi payments ourselves.
            </p>
            
            <p className="mb-4">
              This app does not sell, rent, or share personal data with third parties.
            </p>
            
            <p className="mb-4">
              Data is used only to operate the daily and monthly Pi jackpot drawings.
            </p>
            
            <div className="mt-6 pt-4 border-t border-purple-500/30">
              <p className="mb-2">
                If you have privacy questions, contact: <a href="mailto:upmichiganstatemovers@gmail.com" className="text-purple-400 hover:underline">upmichiganstatemovers@gmail.com</a>
              </p>
              <p className="text-slate-400">
                <strong>Effective Date:</strong> Jan 2026
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">JC ON THE MOVE Privacy Policy</h2>
            
            <p className="mb-4">
              JC ON THE MOVE ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our moving and junk removal services.
            </p>

            <h3 className="text-xl font-medium mb-3 mt-6">Information We Collect</h3>
            <ul className="list-disc pl-6 mb-4">
              <li>Contact information (name, email, phone number)</li>
              <li>Service addresses and locations</li>
              <li>Service preferences and requirements</li>
              <li>Communication history</li>
            </ul>

            <h3 className="text-xl font-medium mb-3 mt-6">How We Use Your Information</h3>
            <ul className="list-disc pl-6 mb-4">
              <li>To provide moving and junk removal services</li>
              <li>To communicate about your service requests</li>
              <li>To send service updates and notifications</li>
              <li>To improve our services</li>
            </ul>

            <h3 className="text-xl font-medium mb-3 mt-6">Data Protection</h3>
            <p className="mb-4">
              We implement appropriate security measures to protect your personal information. Your data is stored securely and accessed only by authorized personnel.
            </p>

            <h3 className="text-xl font-medium mb-3 mt-6">Third-Party Sharing</h3>
            <p className="mb-4">
              We do not sell, trade, or rent your personal information to third parties. We may share information only with service providers who assist in our operations and are bound by confidentiality agreements.
            </p>

            <h3 className="text-xl font-medium mb-3 mt-6">Your Rights</h3>
            <p className="mb-4">
              You have the right to access, correct, or delete your personal information. Contact us to exercise these rights.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Contact Information</h2>
            <p className="mb-2">
              Email: <a href="mailto:upmichiganstatemovers@gmail.com" className="text-primary hover:underline">upmichiganstatemovers@gmail.com</a>
            </p>
            <p>
              Phone: <a href="tel:906-285-9312" className="text-primary hover:underline">906-285-9312</a>
            </p>
          </section>

          <p className="text-sm text-muted-foreground mt-8">
            Last updated: January 2026
          </p>
        </div>
      </div>
    </div>
  );
}
