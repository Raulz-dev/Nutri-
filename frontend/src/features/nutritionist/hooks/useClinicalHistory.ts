import { useCallback, useEffect, useRef, useState } from "react";
import type { Page } from "../../care/api";

const PAGE_SIZE = 10;

// Pagination and post-save refreshes share the same request sequence.
export function useClinicalHistory<T extends { id: string }>(
  loadPage: (offset: number) => Promise<Page<T>>,
  errorMessage: string,
) {
  const [page, setPage] = useState(1);
  const pageRef = useRef(1);
  const request = useRef(0);
  const mounted = useRef(false);
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!mounted.current) return;
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const result = await loadPage((pageRef.current - 1) * PAGE_SIZE);
      if (id !== request.current || !mounted.current) return;
      setItems(result.items);
      setTotal(result.total);
    } catch (reason) {
      if (id === request.current && mounted.current) {
        setError(reason instanceof Error ? reason.message : errorMessage);
      }
    } finally {
      if (id === request.current && mounted.current) setLoading(false);
    }
  }, [loadPage, errorMessage]);

  const changePage = useCallback((next: number) => {
    if (pageRef.current === next) return;
    // Invalidate before React renders; a save finishing now must reload the new page.
    pageRef.current = next;
    request.current += 1;
    setItems([]);
    setLoading(true);
    setPage(next);
  }, []);

  const replaceItem = useCallback((updated: T) => {
    setItems((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, [refresh, page]);

  return {
    items,
    total,
    page,
    loading,
    error,
    refresh,
    changePage,
    replaceItem,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
