import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorToast } from "../../../components/ui/ErrorToast";
import { useAuth } from "../../auth/useAuth";
import { listPatients } from "../../care/api";
import { listAllConversations, listAppointments, type AppointmentRecord } from "../../care/interaction-api";
import { dateLabel } from "../../demo/store";

export function NutritionistDashboardPage() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [patientTotal, setPatientTotal] = useState<number | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [appointmentTotal, setAppointmentTotal] = useState<number | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [patients, scheduled, conversations] = await Promise.all([
      listPatients(token),
      listAppointments(token, 0, { upcoming: true, limit: 5 }),
      listAllConversations(token),
    ]);
    const upcoming = [...scheduled.items].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    setPatientTotal(patients.total);
    setAppointments(upcoming.slice(0, 5));
    setAppointmentTotal(scheduled.total);
    setUnread(conversations.reduce((total, conversation) => total + conversation.unread, 0));
  }, [token]);

  useEffect(() => {
    let active = true;
    void refresh().catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar o painel."); });
    return () => { active = false; };
  }, [refresh]);

  return <>
    <header className="nutri-heading"><span>SEU CONSULTÓRIO</span><h1>Visão geral</h1><p>Organize o cuidado e acompanhe quem precisa de você.</p></header>
    <ErrorToast message={error} />
    {error && <button type="button" onClick={() => { setError(""); void refresh().catch(reason => setError(reason instanceof Error ? reason.message : "Não foi possível carregar o painel.")); }}>Tentar novamente</button>}
    <div className="nutri-metrics">
      {[["Pacientes vinculados", patientTotal ?? "—"], ["Próximas consultas", appointmentTotal ?? "—"], ["Mensagens não lidas", unread ?? "—"]].map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}
    </div>
    <div className="nutri-columns">
      <section className="nutri-card"><header><h2>Planos alimentares</h2><Link to="/app/nutricionista/pacientes">Ver pacientes</Link></header><p className="nutri-muted">Consulte e gerencie o plano de cada paciente em Meus pacientes.</p></section>
      <section className="nutri-card"><header><h2>Próximas consultas</h2><Link to="/app/nutricionista/consultas">Ver agenda</Link></header>
        {appointments.map(item => <Link className="nutri-list-row" key={item.id} to={`/app/nutricionista/pacientes/${item.patientId}`}><strong>{item.patientName}</strong><span>{dateLabel(item.date)} · {item.time}</span></Link>)}
        {!appointments.length && <p className="nutri-empty">Nenhuma consulta agendada.</p>}
      </section>
    </div>
  </>;
}
