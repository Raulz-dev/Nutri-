import { TablePagination } from "../../../../components/shared/TablePagination";
import { dateLabel } from "../../../../lib/formatters";
import type { useMeasurements } from "../../hooks/useMeasurements";
import { HistoryStatus } from "./HistoryStatus";

export function MeasurementHistory({
  history,
}: {
  history: ReturnType<typeof useMeasurements>["history"];
}) {
  return (
    <>
      <HistoryStatus
        loading={history.loading}
        error={history.error}
        onRetry={history.refresh}
      />
      <div className="nutri-table-card">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Peso</th>
              <th>Gordura</th>
              <th>Observação / autor</th>
            </tr>
          </thead>
          <tbody>
            {history.items.map((row) => (
              <tr key={row.id}>
                <td data-label="Data">{dateLabel(row.measured_on)}</td>
                <td data-label="Peso">
                  {row.weight_kg.toLocaleString("pt-BR")} kg
                </td>
                <td data-label="Gordura">
                  {row.body_fat_pct === null
                    ? "—"
                    : `${row.body_fat_pct.toLocaleString("pt-BR")}%`}
                </td>
                <td data-label="Registro">
                  {row.note || "—"}
                  <small>{row.author_name}</small>
                </td>
              </tr>
            ))}
            {!history.loading && !history.error && !history.total && (
              <tr>
                <td colSpan={4} className="nutri-empty">
                  Nenhuma medição registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <TablePagination
          page={history.page}
          totalPages={history.totalPages}
          onPageChange={history.changePage}
        />
      </div>
    </>
  );
}
