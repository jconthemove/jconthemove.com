import { useLocation } from "wouter";
import { useState } from "react";
import {
  Home,
  Briefcase,
  PlusCircle,
  Gift,
  User,
  Settings2,
  ChevronRight,
  Wallet,
  Coins,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const optionLinks = [
  { label: "Home", description: "Start page and service shortcuts", icon: Home, path: "/" },
  { label: "Rewards", description: "JCMOVES balance and rewards", icon: Gift, path: "/rewards" },
  { label: "Wallet", description: "Credits and payment wallet", icon: Wallet, path: "/wallet" },
  { label: "Earn", description: "Daily JCMOVES tasks", icon: Coins, path: "/earn" },
  { label: "Profile", description: "Account and contact info", icon: User, path: "/profile" },
];

export default function BottomTabBar() {
  const [location, setLocation] = useLocation();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const jobsActive = location === "/jobs" || location === "/my-jobs" || location.startsWith("/jobs/");
  const bookActive = location === "/book" || location.startsWith("/book/");
  const optionsActive = optionLinks.some(({ path }) =>
    path === "/" ? location === "/" || location === "/home" : location === path || location.startsWith(`${path}/`)
  );

  function go(path: string) {
    setOptionsOpen(false);
    setLocation(path);
  }

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 safe-area-bottom">
        <div className="max-w-[430px] mx-auto grid h-16 grid-cols-3 items-center px-2">
          <button
            type="button"
            onClick={() => go("/jobs")}
            aria-label="Jobs"
            className={`flex flex-col items-center justify-center gap-0.5 py-1 transition-colors ${
              jobsActive ? "text-jc-orange" : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            <Briefcase className={`h-6 w-6 ${jobsActive ? "stroke-[2.5]" : ""}`} />
            <span className={`text-[10px] ${jobsActive ? "font-bold" : "font-medium"}`}>Jobs</span>
          </button>

          <button
            type="button"
            onClick={() => go("/book")}
            aria-label="Book a job"
            className="flex flex-col items-center justify-center -mt-4"
          >
            <div className="w-14 h-14 rounded-full bg-jc-orange flex items-center justify-center shadow-lg shadow-jc-orange/30">
              <PlusCircle className="h-7 w-7 text-white" />
            </div>
            <span className={`text-[10px] font-semibold mt-0.5 ${bookActive ? "text-jc-orange" : "text-zinc-400 dark:text-zinc-500"}`}>Book</span>
          </button>

          <button
            type="button"
            onClick={() => setOptionsOpen(true)}
            aria-label="Options"
            className={`flex flex-col items-center justify-center gap-0.5 py-1 transition-colors ${
              optionsActive || optionsOpen ? "text-jc-orange" : "text-zinc-400 dark:text-zinc-500"
            }`}
          >
            <Settings2 className={`h-6 w-6 ${optionsActive || optionsOpen ? "stroke-[2.5]" : ""}`} />
            <span className={`text-[10px] ${optionsActive || optionsOpen ? "font-bold" : "font-medium"}`}>Options</span>
          </button>
        </div>
      </nav>

      <Sheet open={optionsOpen} onOpenChange={setOptionsOpen}>
        <SheetContent side="bottom" className="bg-white text-zinc-950 dark:bg-zinc-950 dark:text-white">
          <SheetHeader className="text-left">
            <SheetTitle>Options</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid gap-2">
            {optionLinks.map(({ label, description, icon: Icon, path }) => (
              <button
                key={path}
                type="button"
                onClick={() => go(path)}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-left transition-colors hover:border-jc-orange/50 hover:bg-orange-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-900/80"
              >
                <Icon className="h-5 w-5 text-jc-orange" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{label}</span>
                  <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{description}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
