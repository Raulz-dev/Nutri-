import { useState } from "react";
import { apiRequest } from "../../lib/http-client";
import { ErrorToast } from "../../components/ui/ErrorToast";
import { useAuth } from "../auth/useAuth";

export function ExportPlanButton({
  patientId,
  planId,
}: {
  patientId: string;
  planId: string;
}) {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const pdf = await apiRequest<Blob>(
        `/patients/${patientId}/plans/${planId}/pdf`,
        {
          token: session!.accessToken,
          responseType: "blob",
        },
      );
      const url = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = url;
      link.download = `plano-alimentar-${planId}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível exportar o plano.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="nutri-primary" type="button" disabled={busy} onClick={() => void download()}>
        {busy ? "Gerando PDF…" : "Exportar PDF"}
      </button>
      <ErrorToast message={error} />
    </>
  );
}
