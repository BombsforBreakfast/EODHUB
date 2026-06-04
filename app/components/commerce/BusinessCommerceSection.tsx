"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import type { CommerceProductRow } from "../../lib/commerce/commerceProducts";
import CommerceProductCard from "./CommerceProductCard";

const PRODUCT_PAGE_SIZE = 12;

type ProductPageCacheEntry = {
  products: CommerceProductRow[];
  total: number;
  totalPages: number;
};

type Props = {
  businessId: string;
  isOwnWall?: boolean;
  isMobile?: boolean;
  refreshKey?: number;
};

export default function BusinessCommerceSection({
  businessId,
  isOwnWall = false,
  isMobile = false,
  refreshKey = 0,
}: Props) {
  const { t } = useTheme();
  const [products, setProducts] = useState<CommerceProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageCacheRef = useRef<Record<string, ProductPageCacheEntry>>({});

  const cacheKey = useCallback(
    (page: number, search: string) => {
      return [
        businessId,
        isOwnWall ? "owner" : "public",
        PRODUCT_PAGE_SIZE,
        page,
        search.trim().toLowerCase(),
      ].join("::");
    },
    [businessId, isOwnWall],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
      setCurrentPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    pageCacheRef.current = {};
  }, [businessId, isOwnWall, refreshKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      const key = cacheKey(currentPage, debouncedSearchQuery);
      const cached = pageCacheRef.current[key];
      if (cached) {
        setProducts(cached.products);
        setTotalProducts(cached.total);
        setTotalPages(cached.totalPages);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const params = new URLSearchParams({
        businessId,
        page: String(currentPage),
        pageSize: String(PRODUCT_PAGE_SIZE),
      });
      if (isOwnWall) params.set("includeInactive", "0");
      if (debouncedSearchQuery) params.set("search", debouncedSearchQuery);

      const res = await fetch(`/api/commerce/products?${params.toString()}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        cache: "no-store",
      });

      if (cancelled) return;
      if (!res.ok) {
        setProducts([]);
        setTotalProducts(0);
        setTotalPages(1);
        setLoading(false);
        return;
      }

      const data = (await res.json()) as {
        products?: CommerceProductRow[];
        total?: number;
        totalPages?: number;
      };
      const nextProducts = data.products ?? [];
      const nextTotal = data.total ?? 0;
      const nextTotalPages = Math.max(1, data.totalPages ?? 1);
      setProducts(nextProducts);
      setTotalProducts(nextTotal);
      setTotalPages(nextTotalPages);
      pageCacheRef.current = {
        ...pageCacheRef.current,
        [key]: {
          products: nextProducts,
          total: nextTotal,
          totalPages: nextTotalPages,
        },
      };
      setLoading(false);
    }

    void loadProducts();
    return () => {
      cancelled = true;
    };
  }, [businessId, cacheKey, debouncedSearchQuery, currentPage, isOwnWall, refreshKey]);

  const showingFrom = totalProducts === 0 ? 0 : (currentPage - 1) * PRODUCT_PAGE_SIZE + 1;
  const showingTo = Math.min(currentPage * PRODUCT_PAGE_SIZE, totalProducts);

  const pagination =
    totalPages > 1 ? (
      <nav
        aria-label="Product catalogue pagination"
        style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}
      >
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => {
          const active = pageNumber === currentPage;
          return (
            <button
              key={pageNumber}
              type="button"
              onClick={() => setCurrentPage(pageNumber)}
              aria-current={active ? "page" : undefined}
              style={{
                minWidth: 34,
                height: 34,
                border: `1px solid ${active ? t.text : t.border}`,
                borderRadius: 10,
                background: active ? t.text : t.surface,
                color: active ? t.bg : t.text,
                fontWeight: 850,
                cursor: "pointer",
              }}
            >
              {pageNumber}
            </button>
          );
        })}
      </nav>
    ) : null;

  const showSearch = totalProducts > 0 || searchQuery.trim().length > 0 || debouncedSearchQuery.length > 0;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: t.text }}>Products</div>
          <div style={{ marginTop: 4, fontSize: 12, color: t.textFaint, lineHeight: 1.5 }}>
            Shop directly through this business&apos;s Shopify store.
          </div>
        </div>

        {showSearch && (
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: t.textMuted }}>Search products</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by product, description, price..."
              style={{
                width: "100%",
                border: `1px solid ${t.border}`,
                borderRadius: 12,
                padding: "10px 12px",
                background: t.bg,
                color: t.text,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </label>
        )}
        {pagination}
      </div>

      {loading ? (
        <div
          style={{
            border: `1px solid ${t.border}`,
            borderRadius: 16,
            background: t.surface,
            padding: 16,
            color: t.textFaint,
            fontSize: 13,
          }}
        >
          Loading products...
        </div>
      ) : products.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${t.border}`,
            borderRadius: 16,
            background: t.surface,
            padding: 18,
            color: t.textFaint,
            fontSize: 13,
            textAlign: "center",
          }}
        >
          {debouncedSearchQuery ? `No products match "${debouncedSearchQuery}".` : "No products listed yet."}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: t.textFaint }}>
            Showing {showingFrom}-{showingTo} of {totalProducts} product{totalProducts === 1 ? "" : "s"}.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "repeat(auto-fill, minmax(160px, 1fr))"
                : "repeat(auto-fill, minmax(190px, 1fr))",
              gap: 14,
            }}
          >
            {products.map((product) => (
              <CommerceProductCard key={product.id} product={product} t={t} />
            ))}
          </div>
          {pagination}
        </>
      )}
    </div>
  );
}
