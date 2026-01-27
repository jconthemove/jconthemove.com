import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import QuoteForm, { serviceOptions } from "@/components/QuoteForm";

export default function QuotePage() {
  const [location] = useLocation();
  const [prefilledService, setPrefilledService] = useState<string>("");
  const [prefilledDate, setPrefilledDate] = useState<string>("");
  const [prefilledPromoCode, setPrefilledPromoCode] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const service = params.get('service');
    const date = params.get('date');
    const promo = params.get('promo');
    if (service) {
      setPrefilledService(service);
    }
    if (date) {
      setPrefilledDate(date);
    }
    if (promo) {
      setPrefilledPromoCode(promo);
    }
  }, [location]);

  const getServiceTitle = () => {
    const service = serviceOptions.find(s => s.value === prefilledService);
    return service ? `${service.label} Quote` : "Get Your Free Quote";
  };

  const handleSuccess = () => {
    setPrefilledService("");
    setPrefilledDate("");
    setPrefilledPromoCode("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/">
          <Button variant="ghost" className="text-white hover:bg-white/10 mb-6" data-testid="button-back">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2" data-testid="heading-quote">
            {getServiceTitle()}
          </h1>
          <p className="text-slate-300">
            Fill out the form below and we'll get back to you within 24 hours.
          </p>
        </div>
        
        <QuoteForm 
          variant="customer"
          prefilledDate={prefilledDate}
          prefilledService={prefilledService}
          prefilledPromoCode={prefilledPromoCode}
          onSuccess={handleSuccess}
        />

        <div className="mt-8 text-center text-slate-300">
          <p className="mb-2">Need immediate help?</p>
          <a href="tel:(906) 285-9312" className="text-xl font-bold text-primary hover:text-primary/80 transition-colors">
            Call (906) 285-9312
          </a>
        </div>
      </div>
    </div>
  );
}
