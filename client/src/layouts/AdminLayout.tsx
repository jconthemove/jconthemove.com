import { useLocation } from "wouter";
import {
  LayoutDashboard, Briefcase, Users, Wallet, ShoppingBag, Settings, ChevronRight
} from "lucide-react";

const tabs = [
  { label: "Overview", icon: LayoutDashboard, path: "/admin" },
  { label: "Jobs", icon: Briefcase, path: "/admin/jobs" },
  { label: "People", icon: Users, path: "/admin/people" },
  { label: "Finance", icon: Wallet, path: "/admin/finance" },
  { label: "Market", icon: ShoppingBag, path: "/admin/marketplace" },
  { label: "System", icon: Settings, path: "/admin/system" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  const isActive = (path: string) =>
    path === "/admin" ? (location === "/admin" || location === "/admin/") : location.startsWith(path);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-56 min-h-screen border-r border-slate-800/60 bg-slate-950/80 fixed left-0 top-0 bottom-0 z-40 pt-6">
          <div className="px-4 mb-8">
            <div className="inline-block px-3 py-1 bg-blue-600/20 border border-blue-500/30 rounded-full mb-2">
              <span className="text-blue-300 text-xs font-semibold uppercase tracking-wider">Admin</span>
            </div>
            <h2 className="text-lg font-black text-white">IN GOD WE TRUST</h2>
          </div>
          <nav className="flex-1 px-2 space-y-0.5">
            {tabs.map(({ label, icon: Icon, path }) => {
              const active = isActive(path);
              return (
                <button
                  key={path}
                  onClick={() => setLocation(path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    active
                      ? "bg-blue-600/20 text-blue-300 border border-blue-500/30"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {label}
                  {active && <ChevronRight className="h-3 w-3 ml-auto text-blue-400" />}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main content with sidebar offset on desktop */}
        <main className="flex-1 md:ml-56 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/50 safe-area-bottom">
        <div className="flex items-stretch justify-around h-16">
          {tabs.map(({ label, icon: Icon, path }) => {
            const active = isActive(path);
            return (
              <button
                key={path}
                onClick={() => setLocation(path)}
                aria-label={label}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors ${
                  active ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
                <span className={`text-[10px] ${active ? "font-bold" : "font-medium"}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
