import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

window.addEventListener("error", (event) => {
  const rootEl = document.getElementById("root");
  if (rootEl && !rootEl.hasChildNodes()) {
    rootEl.innerHTML = `
      <div style="min-height:100vh;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;padding:2rem;font-family:sans-serif;">
        <div style="max-width:520px;width:100%;text-align:center;">
          <div style="font-size:3rem;margin-bottom:1rem;">&#9888;</div>
          <h2 style="font-size:1.25rem;font-weight:bold;margin-bottom:0.5rem;">App failed to start</h2>
          <p style="color:#aaa;font-size:0.875rem;margin-bottom:1rem;word-break:break-word;">${event.message || "Unknown startup error"}</p>
          <pre style="background:#1e1e1e;color:#f88;font-size:0.7rem;padding:0.75rem;border-radius:0.5rem;text-align:left;overflow-x:auto;max-height:200px;margin-bottom:1rem;">${(event.filename || "") + "\n" + (event.error?.stack || "").slice(0, 600)}</pre>
          <button onclick="window.location.reload()" style="padding:0.5rem 1.5rem;background:#f97316;color:#fff;border:none;border-radius:0.5rem;cursor:pointer;font-weight:bold;">
            Reload
          </button>
        </div>
      </div>`;
  }
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[startup] Unhandled promise rejection:", event.reason);
});

try {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Root element #root not found in DOM");
  createRoot(rootEl).render(<App />);
} catch (err: any) {
  const rootEl = document.getElementById("root");
  if (rootEl) {
    rootEl.innerHTML = `
      <div style="min-height:100vh;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;padding:2rem;font-family:sans-serif;">
        <div style="max-width:520px;width:100%;text-align:center;">
          <div style="font-size:3rem;margin-bottom:1rem;">&#9888;</div>
          <h2 style="font-size:1.25rem;font-weight:bold;margin-bottom:0.5rem;">Failed to initialize app</h2>
          <p style="color:#aaa;font-size:0.875rem;margin-bottom:1rem;word-break:break-word;">${err?.message || String(err)}</p>
          <pre style="background:#1e1e1e;color:#f88;font-size:0.7rem;padding:0.75rem;border-radius:0.5rem;text-align:left;overflow-x:auto;max-height:200px;margin-bottom:1rem;">${(err?.stack || "").slice(0, 600)}</pre>
          <button onclick="window.location.reload()" style="padding:0.5rem 1.5rem;background:#f97316;color:#fff;border:none;border-radius:0.5rem;cursor:pointer;font-weight:bold;">
            Reload
          </button>
        </div>
      </div>`;
  }
  console.error("[startup] App initialization failed:", err);
}
