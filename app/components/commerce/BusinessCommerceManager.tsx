"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import { prepareFeedUploadFile } from "../../lib/prepareUploadFile";
import type { CommerceProductRow } from "../../lib/commerce/commerceProducts";
import type { SafeCommerceSource } from "../../lib/commerce/commerceSources";
import CommerceProductCard from "./CommerceProductCard";

type ManualProductForm = {
  title: string;
  description: string;
  price: string;
  product_url: string;
  image_url: string;
};

const EMPTY_MANUAL_PRODUCT_FORM: ManualProductForm = {
  title: "",
  description: "",
  price: "",
  product_url: "",
  image_url: "",
};

type Props = {
  businessId: string;
  onProductsChanged?: () => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
};

export default function BusinessCommerceManager({
  businessId,
  onProductsChanged,
  collapsible = false,
  defaultExpanded = false,
}: Props) {
  const { t } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const autoSyncStartedRef = useRef(false);
  const autoBackfillStartedRef = useRef(false);
  const manualProductImageInputRef = useRef<HTMLInputElement | null>(null);
  const [source, setSource] = useState<SafeCommerceSource | null>(null);
  const [products, setProducts] = useState<CommerceProductRow[]>([]);
  const [shopDomain, setShopDomain] = useState("");
  const [manualProductForm, setManualProductForm] = useState<ManualProductForm>(EMPTY_MANUAL_PRODUCT_FORM);
  const [manualProductOpen, setManualProductOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingManualProduct, setSavingManualProduct] = useState(false);
  const [uploadingManualImage, setUploadingManualImage] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manageListOpen, setManageListOpen] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(defaultExpanded);

  const authHeaders = useCallback(async (): Promise<HeadersInit | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    return { Authorization: `Bearer ${session.access_token}` };
  }, []);

  const loadCommerce = useCallback(async () => {
    setLoading(true);
    setError(null);
    const headers = await authHeaders();
    if (!headers) {
      setError("Please sign in to manage commerce.");
      setLoading(false);
      return;
    }

    const [sourcesRes, productsRes] = await Promise.all([
      fetch(`/api/commerce/sources?businessId=${encodeURIComponent(businessId)}`, { headers, cache: "no-store" }),
      fetch(`/api/commerce/products?businessId=${encodeURIComponent(businessId)}&includeInactive=1`, {
        headers,
        cache: "no-store",
      }),
    ]);

    const sourcesJson = (await sourcesRes.json().catch(() => ({}))) as { sources?: SafeCommerceSource[]; error?: string };
    const productsJson = (await productsRes.json().catch(() => ({}))) as { products?: CommerceProductRow[] };

    if (!sourcesRes.ok) {
      setError(sourcesJson.error ?? "Could not load commerce sources.");
      setLoading(false);
      return;
    }

    const shopifySource = (sourcesJson.sources ?? []).find((row) => row.platform_type === "shopify") ?? null;
    setSource(shopifySource);
    setShopDomain(shopifySource?.shop_domain ?? "");
    setProducts(productsJson.products ?? []);
    setLoading(false);
  }, [authHeaders, businessId]);

  useEffect(() => {
    void loadCommerce();
  }, [loadCommerce]);

  async function ensureSource() {
    const headers = await authHeaders();
    if (!headers) throw new Error("Please sign in.");

    if (source) return source;

    const res = await fetch("/api/commerce/sources", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, platformType: "shopify" }),
    });
    const data = (await res.json().catch(() => ({}))) as { source?: SafeCommerceSource; error?: string };
    if (!res.ok || !data.source) throw new Error(data.error ?? "Could not create commerce source.");
    setSource(data.source);
    return data.source;
  }

  async function connectShopify() {
    try {
      setConnecting(true);
      setError(null);
      setNotice(null);
      const activeSource = await ensureSource();

      const headers = await authHeaders();
      if (!headers) throw new Error("Please sign in.");
      const domain = shopDomain.trim() || activeSource.shop_domain?.trim() || "";
      if (!domain) throw new Error("Enter your Shopify shop domain.");

      const res = await fetch("/api/commerce/shopify/connect", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, shopDomain: domain }),
      });
      const data = (await res.json().catch(() => ({}))) as { authorizeUrl?: string; error?: string };
      if (!res.ok || !data.authorizeUrl) throw new Error(data.error ?? "Could not start Shopify connect.");

      window.location.href = data.authorizeUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed.");
      setConnecting(false);
    }
  }

  const syncProducts = useCallback(async (options?: { silent?: boolean }) => {
    if (!source) return;
    try {
      setSyncing(true);
      if (!options?.silent) {
        setError(null);
        setNotice(null);
      }
      const headers = await authHeaders();
      if (!headers) throw new Error("Please sign in.");

      const res = await fetch("/api/commerce/shopify/sync", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ commerceSourceId: source.id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        synced?: number;
        created?: number;
        updated?: number;
        storeUrl?: string | null;
        websiteUpdated?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Sync failed.");

      const domainNote = data.websiteUpdated && data.storeUrl
        ? ` Store domain set to ${new URL(data.storeUrl).hostname.replace(/^www\./i, "")}.`
        : "";
      setNotice(
        options?.silent && (data.synced ?? 0) === 0
          ? `Shopify connected.${domainNote}`
          : `Synced ${data.synced ?? 0} products (${data.created ?? 0} new, ${data.updated ?? 0} updated).${domainNote}`,
      );
      await loadCommerce();
      onProductsChanged?.();
    } catch (err) {
      if (!options?.silent) {
        setError(err instanceof Error ? err.message : "Sync failed.");
      }
    } finally {
      setSyncing(false);
    }
  }, [authHeaders, loadCommerce, onProductsChanged, source]);

  useEffect(() => {
    if (autoSyncStartedRef.current) return;
    if (searchParams.get("commerce") !== "connected") return;
    if (loading || !source || source.sync_status !== "connected") return;

    autoSyncStartedRef.current = true;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("commerce");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });

    void syncProducts({ silent: true });
  }, [loading, pathname, router, searchParams, source, syncProducts]);

  useEffect(() => {
    if (loading || !source || source.sync_status !== "connected") return;
    if (autoBackfillStartedRef.current || autoSyncStartedRef.current) return;
    if (source.store_url && source.last_synced_at) return;

    autoBackfillStartedRef.current = true;
    void syncProducts({ silent: true });
  }, [loading, source, syncProducts]);

  async function updateProduct(productId: string, patch: { is_active?: boolean; is_featured?: boolean }) {
    const headers = await authHeaders();
    if (!headers) return;

    const res = await fetch(`/api/commerce/products/${encodeURIComponent(productId)}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Could not update product.");
      return;
    }
    await loadCommerce();
    onProductsChanged?.();
  }

  async function uploadManualProductImage(file: File) {
    try {
      setUploadingManualImage(true);
      setError(null);
      const prepared = await prepareFeedUploadFile(file);
      if (!prepared.ok) {
        setError(prepared.error);
        return;
      }
      const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${prepared.file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const filePath = `business-org-products/${businessId}/${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("feed-images")
        .upload(filePath, prepared.file, {
          contentType: prepared.file.type || "image/jpeg",
          upsert: false,
        });
      if (uploadError) {
        setError(uploadError.message);
        return;
      }
      const { data } = supabase.storage.from("feed-images").getPublicUrl(filePath);
      setManualProductForm((prev) => ({ ...prev, image_url: data.publicUrl }));
    } finally {
      setUploadingManualImage(false);
    }
  }

  async function createManualProduct() {
    try {
      setSavingManualProduct(true);
      setError(null);
      setNotice(null);
      const headers = await authHeaders();
      if (!headers) throw new Error("Please sign in.");

      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          title: manualProductForm.title,
          description: manualProductForm.description,
          price: manualProductForm.price,
          product_url: manualProductForm.product_url,
          image_url: manualProductForm.image_url,
          currency: "USD",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not add product.");

      setManualProductForm(EMPTY_MANUAL_PRODUCT_FORM);
      setManualProductOpen(false);
      setNotice("Manual product added.");
      await loadCommerce();
      onProductsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add product.");
    } finally {
      setSavingManualProduct(false);
    }
  }

  const activeCount = products.filter((product) => product.is_active).length;
  const statusLabel = source?.sync_status ?? "not_configured";
  const isConnected = source?.sync_status === "connected";
  const connectedStoreLabel = (() => {
    const raw = source?.store_url || source?.shop_domain;
    if (!raw) return null;
    try {
      const hostname = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
      return hostname.replace(/^www\./i, "");
    } catch {
      return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    }
  })();

  const statusSummary = loading
    ? "Loading..."
    : `${statusLabel} · ${activeCount} active product${activeCount === 1 ? "" : "s"}`;

  if (collapsible && !panelExpanded) {
    return (
      <button
        type="button"
        onClick={() => setPanelExpanded(true)}
        style={{
          width: "100%",
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          background: t.surface,
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: t.text }}>Sync Commerce</div>
          <div style={{ marginTop: 2, fontSize: 11, color: t.textFaint, lineHeight: 1.4 }}>
            {statusSummary}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: t.textMuted, flexShrink: 0 }}>▼</span>
      </button>
    );
  }

  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: collapsible ? 12 : 16, background: t.surface, overflow: "hidden" }}>
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: t.text }}>
              {collapsible ? "Sync Commerce" : "Commerce"}
            </div>
            <div style={{ marginTop: 2, fontSize: 12, color: t.textFaint }}>
              Connect Shopify to sync products. Checkout stays on Shopify.
            </div>
          </div>
          {collapsible && (
            <button
              type="button"
              onClick={() => setPanelExpanded(false)}
              title="Minimize commerce panel"
              style={{
                border: `1px solid ${t.border}`,
                borderRadius: 8,
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
                background: t.bg,
                color: t.textMuted,
                flexShrink: 0,
              }}
            >
              Minimize ▲
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ color: t.textFaint, fontSize: 13 }}>Loading commerce settings...</div>
        ) : (
          <>
            <div style={{ display: "grid", gap: 8 }}>
              {isConnected ? (
                <div
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                    background: t.bg,
                    color: t.text,
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontWeight: 800 }}>
                    Connected{connectedStoreLabel ? `: ${connectedStoreLabel}` : ""}
                  </div>
                  <div style={{ marginTop: 4, color: t.textMuted, fontSize: 12 }}>
                    Your store domain and products sync automatically after connect. We only update your profile
                    website if it is blank or still matches your Shopify domain.
                  </div>
                </div>
              ) : (
                <input
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                  placeholder="your-store.myshopify.com"
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    padding: "8px 10px",
                    background: t.bg,
                    color: t.text,
                  }}
                />
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!isConnected && (
                  <button
                    type="button"
                    onClick={connectShopify}
                    disabled={connecting}
                    style={{
                      border: `1px solid ${t.border}`,
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: connecting ? "not-allowed" : "pointer",
                      background: t.surface,
                      color: t.text,
                      opacity: connecting ? 0.7 : 1,
                    }}
                  >
                    {connecting ? "Redirecting..." : "Connect Shopify"}
                  </button>
                )}
                {isConnected && (
                  <>
                    <button
                      type="button"
                      onClick={connectShopify}
                      disabled={connecting}
                      style={{
                        border: `1px solid ${t.border}`,
                        borderRadius: 8,
                        padding: "6px 12px",
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: connecting ? "not-allowed" : "pointer",
                        background: t.bg,
                        color: t.textMuted,
                        opacity: connecting ? 0.7 : 1,
                      }}
                    >
                      {connecting ? "Redirecting..." : "Reconnect"}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
              Status: <strong>{statusLabel}</strong>
              {source?.last_synced_at ? ` · Last synced ${new Date(source.last_synced_at).toLocaleString()}` : ""}
              {` · ${activeCount} active product${activeCount === 1 ? "" : "s"}`}
            </div>

            <div style={{ borderTop: `1px solid ${t.borderLight}`, paddingTop: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: t.text }}>Manual products</div>
                  <div style={{ marginTop: 2, fontSize: 12, color: t.textFaint, lineHeight: 1.45 }}>
                    Add products from your website, online store, or external marketplace.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setManualProductOpen((open) => !open)}
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontWeight: 800,
                    fontSize: 12,
                    cursor: "pointer",
                    background: t.bg,
                    color: t.text,
                  }}
                >
                  {manualProductOpen ? "Close manual form" : "+ Add manual product"}
                </button>
              </div>

              {manualProductOpen && (
                <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, background: t.bg, padding: 12, display: "grid", gap: 10 }}>
                  <input
                    value={manualProductForm.title}
                    onChange={(e) => setManualProductForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Item name"
                    style={{
                      border: `1px solid ${t.border}`,
                      borderRadius: 8,
                      padding: "8px 10px",
                      background: t.surface,
                      color: t.text,
                    }}
                  />
                  <textarea
                    value={manualProductForm.description}
                    onChange={(e) => setManualProductForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Description"
                    style={{
                      border: `1px solid ${t.border}`,
                      borderRadius: 8,
                      padding: "8px 10px",
                      background: t.surface,
                      color: t.text,
                      minHeight: 80,
                      resize: "vertical",
                    }}
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 160px) minmax(0, 1fr)", gap: 8 }}>
                    <input
                      value={manualProductForm.price}
                      onChange={(e) => setManualProductForm((prev) => ({ ...prev, price: e.target.value }))}
                      placeholder="Price, e.g. 29.99"
                      inputMode="decimal"
                      style={{
                        border: `1px solid ${t.border}`,
                        borderRadius: 8,
                        padding: "8px 10px",
                        background: t.surface,
                        color: t.text,
                      }}
                    />
                    <input
                      value={manualProductForm.product_url}
                      onChange={(e) => setManualProductForm((prev) => ({ ...prev, product_url: e.target.value }))}
                      placeholder="External URL"
                      style={{
                        border: `1px solid ${t.border}`,
                        borderRadius: 8,
                        padding: "8px 10px",
                        background: t.surface,
                        color: t.text,
                      }}
                    />
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    <input
                      ref={manualProductImageInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void uploadManualProductImage(file);
                      }}
                    />
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => manualProductImageInputRef.current?.click()}
                        disabled={uploadingManualImage}
                        style={{
                          border: `1px solid ${t.border}`,
                          borderRadius: 8,
                          padding: "6px 12px",
                          fontWeight: 800,
                          fontSize: 12,
                          cursor: uploadingManualImage ? "not-allowed" : "pointer",
                          background: t.surface,
                          color: t.text,
                          opacity: uploadingManualImage ? 0.7 : 1,
                        }}
                      >
                        {uploadingManualImage ? "Uploading..." : "Pick product photo"}
                      </button>
                      {manualProductForm.image_url && (
                        <span style={{ color: t.textMuted, fontSize: 12, fontWeight: 700 }}>Photo selected</span>
                      )}
                    </div>
                    {manualProductForm.image_url && (
                      <div style={{ width: 92, height: 92, borderRadius: 12, border: `1px solid ${t.border}`, overflow: "hidden", background: t.surface }}>
                        <img src={manualProductForm.image_url} alt="Product preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void createManualProduct()}
                    disabled={savingManualProduct || uploadingManualImage}
                    style={{
                      border: "none",
                      borderRadius: 10,
                      padding: "9px 14px",
                      fontWeight: 900,
                      fontSize: 13,
                      cursor: savingManualProduct || uploadingManualImage ? "not-allowed" : "pointer",
                      background: "#111",
                      color: "#fff",
                      opacity: savingManualProduct || uploadingManualImage ? 0.65 : 1,
                    }}
                  >
                    {savingManualProduct ? "Adding..." : "Add manual product"}
                  </button>
                </div>
              )}
            </div>

            {notice && <div style={{ fontSize: 12, color: "#166534", fontWeight: 700 }}>{notice}</div>}
            {error && <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>{error}</div>}

            {products.length > 0 && (
              <div style={{ borderTop: `1px solid ${t.borderLight}`, paddingTop: 12, display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: t.text }}>
                      Products
                      {!manageListOpen && (
                        <span style={{ marginLeft: 6, fontWeight: 700, color: t.textFaint }}>
                          ({products.length} total)
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11, color: t.textFaint, lineHeight: 1.4 }}>
                      Manage the same cards visitors see on your profile.
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {isConnected && (
                      <button
                        type="button"
                        onClick={() => void syncProducts()}
                        disabled={syncing}
                        style={{
                          border: `1px solid ${t.border}`,
                          borderRadius: 8,
                          padding: "4px 10px",
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: syncing ? "not-allowed" : "pointer",
                          background: t.bg,
                          color: t.textMuted,
                          opacity: syncing ? 0.65 : 1,
                          flexShrink: 0,
                        }}
                      >
                        {syncing ? "Refreshing..." : "Refresh products"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setManageListOpen((open) => !open)}
                      style={{
                        border: `1px solid ${t.border}`,
                        borderRadius: 8,
                        padding: "4px 10px",
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer",
                        background: t.bg,
                        color: t.textMuted,
                        flexShrink: 0,
                      }}
                    >
                      {manageListOpen ? "Hide list" : "Show list"}
                    </button>
                  </div>
                </div>
                {manageListOpen && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {products.map((product) => (
                      <div key={product.id} style={{ display: "grid", gap: 8, minWidth: 0 }}>
                        <CommerceProductCard product={product} t={t} />
                        <div
                          style={{
                            border: `1px solid ${t.border}`,
                            borderRadius: 10,
                            padding: 8,
                            background: t.bg,
                            display: "grid",
                            gap: 7,
                          }}
                        >
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => updateProduct(product.id, { is_active: !product.is_active })}
                              style={{
                                border: `1px solid ${t.border}`,
                                borderRadius: 8,
                                padding: "5px 9px",
                                fontSize: 11,
                                fontWeight: 800,
                                cursor: "pointer",
                                background: t.surface,
                                color: t.text,
                              }}
                            >
                              {product.is_active ? "Hide from profile" : "Show on profile"}
                            </button>
                            <button
                              type="button"
                              onClick={() => updateProduct(product.id, { is_featured: !product.is_featured })}
                              style={{
                                border: `1px solid ${t.border}`,
                                borderRadius: 8,
                                padding: "5px 9px",
                                fontSize: 11,
                                fontWeight: 800,
                                cursor: "pointer",
                                background: t.surface,
                                color: t.text,
                              }}
                            >
                              {product.is_featured ? "Unfeature" : "Feature"}
                            </button>
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: product.is_active ? "#166534" : t.textFaint,
                            }}
                          >
                            {product.is_active ? "Visible on profile" : "Hidden from profile"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!manageListOpen && (
                  <div style={{ fontSize: 12, color: t.textFaint, lineHeight: 1.5 }}>
                    Product list hidden. Use the listing view below to preview what visitors see.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
