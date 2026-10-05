import { useEffect, useState } from "react";

const PAGE_SIZE = 10;

export function usePagination<T>(items: T[], filterKey: string) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => setPage(1), [filterKey]);
  useEffect(
    () => setPage((current) => Math.min(current, totalPages)),
    [totalPages],
  );

  return {
    items: items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    page: currentPage,
    totalPages,
    onPageChange: (next: number) =>
      setPage(Math.max(1, Math.min(next, totalPages))),
  };
}
