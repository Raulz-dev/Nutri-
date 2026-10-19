import { ErrorToast } from "../../../../components/ui/ErrorToast";
import type { useAutoSave } from "../../../../hooks/useAutoSave";

export function AutoSaveStatus({
  state,
}: {
  state: ReturnType<typeof useAutoSave>;
}) {
  return (
    <div>
      <p role="status" className="nutri-muted">
        {state.status === "saving"
          ? "Salvando…"
          : state.status === "saved"
            ? "Salvo automaticamente."
            : state.status === "pending"
              ? "Alterações aguardando salvamento…"
              : state.status === "error"
                ? "Não foi possível salvar. Seus dados continuam no formulário."
                : "Preencha os campos para salvar automaticamente."}
      </p>
      <ErrorToast message={state.error} />
      {state.status === "error" && (
        <button
          type="button"
          onClick={() => {
            void state.flush();
          }}
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
