import {
  getMarketplaceRequestShape,
  getMarketplaceShapeForServiceCode,
  type MarketplaceRequestShape,
  type MarketplaceRequestShapeId,
} from "@shared/marketplaceShapes";

type MarketplaceShapeBadgeProps = {
  shapeId?: string | null;
  serviceCode?: string | null;
  serviceLabel?: string | null;
  className?: string;
};

export function resolveMarketplaceShape({
  shapeId,
  serviceCode,
  serviceLabel,
}: Pick<MarketplaceShapeBadgeProps, "shapeId" | "serviceCode" | "serviceLabel">): MarketplaceRequestShape {
  if (shapeId) {
    const fromId = getMarketplaceRequestShape(shapeId as MarketplaceRequestShapeId);
    if (fromId) return fromId;
  }
  return getMarketplaceShapeForServiceCode(serviceCode || serviceLabel);
}

export default function MarketplaceShapeBadge({
  shapeId,
  serviceCode,
  serviceLabel,
  className = "",
}: MarketplaceShapeBadgeProps) {
  const shape = resolveMarketplaceShape({ shapeId, serviceCode, serviceLabel });
  return (
    <span
      className={`inline-flex items-center rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-300 ${className}`}
    >
      {shape.shape}
    </span>
  );
}

