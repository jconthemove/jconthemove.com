import { useLocation } from "wouter";
import { Home, Briefcase, PlusCircle, Gift, User } from "lucide-react";

const tabs = [
  { label: "Home", icon: Home, path: "/" },
  { label: "Jobs", icon: Briefcase, path: "/jobs" },
  { label: "Book", icon: PlusCircle, path: "/book" },
  { label: "Rewards", icon: Gift, path: "/rewards" },
  { label: "Profile", icon: User, path: "/profile" },
];

export default function BottomTabBar() {
  const [location, setLocation] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 safe-area-bottom">
      <div className="max-w-[430px] mx-auto flex items-center justify-around h-16 px-1">
        {tabs.map(({ label, icon: Icon, path }) => {
          const isActive = location === path || (path === "/" && location === "/home");
          const isPost = path === "/book";

          if (isPost) {
            return (
              <button
                key={path}
                onClick={() => setLocation(path)}
                aria-label="Book a job"
                className="flex flex-col items-center justify-center -mt-4"
              >
                <div className="w-14 h-14 rounded-full bg-jc-orange flex items-center justify-center shadow-lg shadow-jc-orange/30">
                  <PlusCircle className="h-7 w-7 text-white" />
                </div>
                <span className="text-[10px] font-semibold mt-0.5 text-jc-orange">Book</span>
              </button>
            );
          }

          return (
            <button
              key={path}
              onClick={() => setLocation(path)}
              aria-label={label}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 px-3 min-w-[60px] transition-colors ${
                isActive
                  ? "text-jc-orange"
                  : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              <Icon className={`h-6 w-6 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className={`text-[10px] ${isActive ? "font-bold" : "font-medium"}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
