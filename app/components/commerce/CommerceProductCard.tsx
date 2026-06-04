"use client";

import type { CommerceProductRow } from "../../lib/commerce/commerceProducts";
import { formatCommercePrice } from "../../lib/commerce/commerceProducts";
import type { Theme } from "../../lib/theme";

type Props = {
  product: CommerceProductRow;
  t: Theme;
  buttonLabel?: string;
};

export default function CommerceProductCard({ product, t, buttonLabel }: Props) {
  const href = product.checkout_url || product.product_url || "#";
  const priceLabel = formatCommercePrice(
    typeof product.price === "number" ? product.price : product.price != null ? Number(product.price) : null,
    product.currency,
  );
  const label =
    buttonLabel ||
    (product.platform_type === "shopify" ? "View on Shopify" : "View Product");

  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        background: t.bg,
        overflow: "hidden",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div style={{ aspectRatio: "1 / 1", background: t.surface, overflow: "hidden" }}>
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              color: t.textFaint,
              fontSize: 12,
            }}
          >
            No image
          </div>
        )}
      </div>

      <div style={{ padding: 12, display: "grid", gap: 8, flex: 1, alignContent: "start" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, justifyContent: "space-between" }}>
          <div style={{ color: t.text, fontWeight: 900, fontSize: 14, lineHeight: 1.3, minWidth: 0 }}>
            {product.title}
          </div>
          {product.platform_type === "shopify" && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 10,
                fontWeight: 800,
                color: t.badgeText,
                background: t.badgeBg,
                border: `1px solid ${t.border}`,
                borderRadius: 999,
                padding: "2px 8px",
              }}
            >
              Shopify
            </span>
          )}
        </div>

        {priceLabel && (
          <div style={{ color: t.text, fontWeight: 850, fontSize: 13 }}>{priceLabel}</div>
        )}

        {product.description && (
          <div
            title={product.description}
            style={{
              color: t.textMuted,
              fontSize: 12,
              lineHeight: 1.45,
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 3,
              overflow: "hidden",
            }}
          >
            {product.description}
          </div>
        )}

        <div style={{ marginTop: "auto", paddingTop: 4 }}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault();
              window.open(href, "_blank", "noopener,noreferrer");
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              padding: "8px 12px",
              background: t.surface,
              color: t.text,
              fontWeight: 800,
              fontSize: 12,
              textDecoration: "none",
              boxSizing: "border-box",
            }}
          >
            {label}
          </a>
        </div>
      </div>
    </div>
  );
}
