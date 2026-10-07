import { useState, type FormEvent } from "react";
import { useAuth } from "../../auth/useAuth";
import { useDemo, demoUsers, today } from "../../demo/store";
import { saveAppointment } from "../../demo/actions";
import type { Appointment } from "../../demo/types";
import { Modal } from "./Modal";
import { ErrorToast } from "../../../components/ui/ErrorToast";
export function AppointmentForm({
  source,
  defaultPatient,
  onClose,
}: {
  source?: Appointment;
  defaultPatient: string;
  onClose: () => void;
}) {
  const { currentUser } = useAuth();
  const state = useDemo();
  const patients = demoUsers(state).filter((p) =>
    state.links.some(
      (l) => l.patientId === p.id && l.nutritionistId === currentUser!.id,
    ),
  );
  const [form, setForm] = useState<Appointment>(() =>
    source
      ? { ...source }
      : {
          id: crypto.randomUUID(),
          patientId: defaultPatient,
          authorId: currentUser!.id,
          authorName: currentUser!.name,
          date: today(),
          time: "09:00",
          format: "Presencial",
          location: "",
          guidance: "",
          status: "scheduled",
        },
  );
  const [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      saveAppointment(form, currentUser!);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={source ? "Detalhes da consulta" : "Agendar consulta"}
      onClose={onClose}
    >
      <form className="nutri-form" onSubmit={submit}>
        <label>
          Paciente
          <select
            value={form.patientId}
            required
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
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </label>
          <label>
            Horário
            <input
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
            value={form.format}
            onChange={(e) =>
              setForm({
                ...form,
                format: e.target.value as Appointment["format"],
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
            type={form.format === "Online" ? "url" : "text"}
            required
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </label>
        <label>
          Orientações
          <textarea
            value={form.guidance}
            onChange={(e) => setForm({ ...form, guidance: e.target.value })}
          />
        </label>
        <ErrorToast message={error} />
        <div className="nutri-actions">
          <button type="button" onClick={onClose}>
            Voltar
          </button>
          <button className="nutri-primary">Salvar consulta</button>
        </div>
      </form>
    </Modal>
  );
}
