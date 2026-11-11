import { useRef, useState, type FormEvent } from "react";
import { addUazapiPatient } from "../uazapi-api";
import { Modal } from "./Modal";

export function UazapiPatientForm({
  token,
  chatId,
  phone,
  title,
  onClose,
  onSaved,
}: {
  token: string;
  chatId: string;
  phone: string;
  title: string;
  onClose: () => void;
  onSaved: (patientId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const fields = new FormData(event.currentTarget);
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const { patient_id } = await addUazapiPatient(token, chatId, {
        name: String(fields.get("name") ?? ""),
        email: String(fields.get("email") ?? ""),
        cpf: String(fields.get("cpf") ?? ""),
      });
      onSaved(patient_id);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível adicionar o cliente.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Adicionar paciente"
      onClose={() => {
        if (!submitting.current) onClose();
      }}
    >
      <form className="nutri-form" onSubmit={submit}>
        <label>
          WhatsApp
          <input type="tel" value={phone} readOnly />
        </label>
        <label>
          Nome
          <input
            name="name"
            defaultValue={title.includes("@") ? "" : title}
            required
            minLength={2}
            maxLength={120}
          />
        </label>
        <label>
          E-mail
          <input name="email" type="email" required maxLength={320} />
        </label>
        <label>
          CPF
          <input name="cpf" inputMode="numeric" required maxLength={14} />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="nutri-primary" type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Adicionar paciente"}
        </button>
      </form>
    </Modal>
  );
}
