import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { BookingChatbot } from "@/components/booking-chatbot";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { Phone } from "lucide-react";

export default function CustomerBookPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [initialService, setInitialService] = useState<string | undefined>(undefined);

  // Handle ?service= URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const svc = params.get("service");
    if (!svc) return;
    // Redirect services that have dedicated pages
    if (svc === "window_cleaning") { setLocation("/window-cleaning"); return; }
    if (svc === "trash_valet")     { setLocation("/trash-valet/book"); return; }
    if (svc === "lawn")            { setLocation("/book/lawn-care"); return; }
    setInitialService(svc);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-border flex-shrink-0">
        <div className="max-w-2xl mx-auto flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">Book a Service</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Answer a few quick questions and get an instant estimate
            </p>
          </div>
          <a
            href="tel:+12312341234"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
          >
            <Phone className="h-3.5 w-3.5" />
            <span>Call us</span>
          </a>
        </div>
      </div>

      {/* Chatbot — full remaining height */}
      <div className="flex-1 overflow-hidden max-w-2xl mx-auto w-full px-4 py-4 flex flex-col" style={{ minHeight: 0 }}>
        <BookingChatbot
          embedded
          initialService={initialService}
          className="flex-1"
        />
      </div>

      {/* Bottom sign-in nudge for guests */}
      {!user && (
        <div className="px-4 pb-safe pb-4 flex-shrink-0 max-w-2xl mx-auto w-full">
          <p className="text-xs text-center text-muted-foreground">
            <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
            {" "}to track your bookings and earn JCMOVES rewards automatically.
          </p>
        </div>
      )}
    </div>
  );
}
