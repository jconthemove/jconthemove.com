import { useEffect } from "react";

export function useSheetBackButton(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (isOpen) {
      window.history.pushState({ sheetOpen: true }, "");
    }
    function handlePop() {
      if (isOpen) onClose();
    }
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [isOpen, onClose]);
}
