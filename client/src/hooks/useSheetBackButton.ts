import { useEffect, useRef } from "react";

export function useSheetBackButton(isOpen: boolean, onClose: () => void) {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    window.history.pushState({ sheetOpen: true }, "");
    pushedRef.current = true;

    function handlePop() {
      pushedRef.current = false;
      onClose();
    }

    window.addEventListener("popstate", handlePop);

    return () => {
      window.removeEventListener("popstate", handlePop);
      if (pushedRef.current) {
        pushedRef.current = false;
        if (window.history.state?.sheetOpen) {
          window.history.back();
        }
      }
    };
  }, [isOpen]);
}
