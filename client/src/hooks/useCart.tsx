import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image: string;
  type: "service" | "jewelry" | "promo" | "sponsor" | "shop" | "tip";
  quantity: number;
  bookNow?: boolean;
}

export interface DiscountBreakdown {
  instantBookDiscount: number;
  jewelsDiscount: number;
  multiServiceDiscount: number;
  jewelsCount: number;
  hasInstantBook: boolean;
  multiService: boolean;
  totalPct: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  isInCart: (id: string) => boolean;
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
  hasMultipleItems: boolean;
  breakdown: DiscountBreakdown;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((item: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const exists = prev.find((i) => i.id === item.id);
      if (exists) return prev;
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const isInCart = useCallback(
    (id: string) => items.some((i) => i.id === id),
    [items]
  );

  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const hasMultipleItems = items.length > 1;

  const serviceItems = items.filter(
    (i) => i.type === "service" || i.type === "promo"
  );
  const jewelryItems = items.filter((i) => i.type === "jewelry");
  const serviceSubtotal = serviceItems.reduce((s, i) => s + i.price, 0);

  const hasInstantBook = serviceItems.some((i) => i.bookNow);
  const multiService = serviceItems.length >= 2;
  const jewelsCount = jewelryItems.length;

  const instantBookDiscount = hasInstantBook
    ? Math.round(serviceSubtotal * 0.05 * 100) / 100
    : 0;
  const jewelsDiscount =
    jewelsCount > 0
      ? Math.round(serviceSubtotal * (Math.min(jewelsCount, 2) * 0.05) * 100) / 100
      : 0;
  const multiServiceDiscount = multiService
    ? Math.round(serviceSubtotal * 0.1 * 100) / 100
    : 0;

  const discount = instantBookDiscount + jewelsDiscount + multiServiceDiscount;
  const total = Math.max(0, subtotal - discount);

  const totalPct =
    (hasInstantBook ? 5 : 0) +
    Math.min(jewelsCount, 2) * 5 +
    (multiService ? 10 : 0);

  const breakdown: DiscountBreakdown = {
    instantBookDiscount,
    jewelsDiscount,
    multiServiceDiscount,
    jewelsCount,
    hasInstantBook,
    multiService,
    totalPct,
  };

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        clearCart,
        isInCart,
        itemCount: items.length,
        subtotal,
        discount,
        total,
        hasMultipleItems,
        breakdown,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
}
