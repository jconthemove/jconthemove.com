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
    if (svc === "window_cleaning" || svc === "window") { setLocation("/window-cleaning"); return; }
    if (svc === "trash_valet" || svc === "trash-valet") { setLocation("/trash-valet/book"); return; }
    if (svc === "lawn")                                { setLocation("/book/lawn-care"); return; }
    setInitialService(svc);
  }, []);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
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

      {/* Chatbot — fills remaining height above bottom nav (h-16 = 64px) */}
      <div
        className="flex-1 overflow-hidden max-w-2xl mx-auto w-full px-4 pt-4 pb-2 flex flex-col"
        style={{ minHeight: 0, paddingBottom: "calc(64px + 0.5rem)" }}
      >
        <BookingChatbot
          embedded
          initialService={initialService}
          className="flex-1"
        />
        {/* Sign-in nudge for guests */}
        {!user && (
          <p className="text-xs text-center text-muted-foreground pt-1 flex-shrink-0">
            <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
            {" "}to track your bookings and earn JCMOVES rewards automatically.
          </p>
        )}
      </div>
    </div>
  );
}
