import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/useAuth";
import { today } from "../../../lib/formatters";
import type { PatientRow } from "../../care/api";
import { createAppointment, updateAppointment, type AppointmentRecord } from "../../care/interaction-api";
import { Modal } from "./Modal";
import { ErrorToast } from "../../../components/ui/ErrorToast";
export function AppointmentForm({
  source,
  defaultPatient,
  patients,
  onClose,
  onSaved,
}: {
  source?: AppointmentRecord;
  defaultPatient: string;
  patients: PatientRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currentUser, session } = useAuth();
  const [form, setForm] = useState<AppointmentRecord>(() =>
    source
      ? { ...source }
      : {
          id: crypto.randomUUID(),
          patientId: defaultPatient,
          patientName: patients.find(patient => patient.id === defaultPatient)?.name ?? "",
          nutritionistId: currentUser!.id,
          authorId: currentUser!.id,
          date: today(),
          time: "09:00",
          format: "Presencial",
          location: "",
          guidance: "",
          status: "scheduled",
          revision: 1,
        },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const readOnly = Boolean(source && source.status !== "scheduled");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (readOnly || busy) return;
    setBusy(true);
    try {
      if (source) await updateAppointment(session!.accessToken, form);
      else await createAppointment(session!.accessToken, form);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a consulta.");
    } finally { setBusy(false); }
  }
  return (
    <Modal
      title={source ? "Detalhes da consulta" : "Agendar consulta"}
      onClose={onClose}
    >
      <form className="nutri-form" onSubmit={submit}>
        {readOnly && <p>Consulta encerrada. Os detalhes estão disponíveis apenas para visualização.</p>}
        <label>
          Paciente
          <select
            value={form.patientId}
            required
            disabled={Boolean(source) || busy}
            onChange={(e) => setForm({ ...form, patientId: e.target.value })}
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="nutri-form-grid">
          <label>
            Data
            <input
              readOnly={readOnly}
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </label>
          <label>
            Horário
            <input
              readOnly={readOnly}
              type="time"
              required
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
          </label>
        </div>
        <label>
          Modalidade
          <select
            disabled={readOnly}
            value={form.format}
            onChange={(e) =>
              setForm({
                ...form,
                format: e.target.value as AppointmentRecord["format"],
              })
            }
          >
            <option>Presencial</option>
            <option>Online</option>
          </select>
        </label>
        <label>
          {form.format === "Online" ? "Link da consulta" : "Local da consulta"}
          <input
            readOnly={readOnly}
            type={form.format === "Online" ? "url" : "text"}
            required
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </label>
        <label>
          Orientações
          <textarea
            readOnly={readOnly}
            value={form.guidance}
            onChange={(e) => setForm({ ...form, guidance: e.target.value })}
          />
        </label>
        <ErrorToast message={error} />
        <div className="nutri-actions">
          <button type="button" onClick={onClose}>
            Voltar
          </button>
          {!readOnly && <button className="nutri-primary" disabled={busy}>Salvar consulta</button>}
        </div>
      </form>
    </Modal>
  );
}
