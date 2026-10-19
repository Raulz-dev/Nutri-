import { ErrorToast } from "../../../../components/ui/ErrorToast";

export function HistoryStatus({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string;
  onRetry: () => Promise<void>;
}) {
  return (
    <>
      <ErrorToast message={error} />
      {loading && <p role="status">Carregando histórico...</p>}
      {!loading && error && (
        <button
          type="button"
          onClick={() => {
            void onRetry();
          }}
        >
          Atualizar histórico
        </button>
      )}
    </>
  );
}
