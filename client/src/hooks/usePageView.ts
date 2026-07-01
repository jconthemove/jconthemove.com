import { useEffect } from "react";
import { useLocation } from "wouter";

export function getVisitorId(): string {
  let id = localStorage.getItem("jc_visitor_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("jc_visitor_id", id);
  }
  return id;
}

export function usePageView() {
  const [location] = useLocation();

  useEffect(() => {
    const visitorId = getVisitorId();
    fetch("/api/analytics/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: `${window.location.pathname}${window.location.search}` || location,
        visitorId,
        referrer: document.referrer || null,
        userAgent: navigator.userAgent,
      }),
    }).catch(() => {});
  }, [location]);
}
