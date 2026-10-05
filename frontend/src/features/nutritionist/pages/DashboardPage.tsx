import { Link } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { activePlan, dateLabel, demoUsers, useDemo } from "../../demo/store";
export function NutritionistDashboardPage() {
  const { currentUser } = useAuth();
  const state = useDemo();
  const links = state.links.filter((l) => l.nutritionistId === currentUser!.id);
  const patients = demoUsers(state).filter((u) =>
    links.some((l) => l.patientId === u.id),
  );
  const pending = patients.filter((p) => !activePlan(state, p.id));
  const appointments = state.appointments
    .filter(
      (a) =>
        a.authorId === currentUser!.id &&
        links.some((l) => l.patientId === a.patientId) &&
        a.status === "scheduled" &&
        new Date(`${a.date}T${a.time}`).getTime() >= Date.now(),
    )
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const unread = state.conversations
    .filter((c) => links.some((l) => l.conversationId === c.id))
    .flatMap((c) => c.messages)
    .filter((m) => m.sender === "patient" && !m.read).length;
  return (
    <>
      <header className="nutri-heading">
        <span>SEU CONSULTÓRIO</span>
        <h1>Visão geral</h1>
        <p>Organize o cuidado e acompanhe quem precisa de você.</p>
      </header>
      <div className="nutri-metrics">
        {[
          ["Pacientes vinculados", patients.length],
          ["Planos ativos", patients.length - pending.length],
          ["Próximas consultas", appointments.length],
          ["Mensagens não lidas", unread],
        ].map(([label, value]) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="nutri-columns">
        <section className="nutri-card">
          <header>
            <h2>Precisam de um plano</h2>
            <Link to="/app/nutricionista/pacientes">Ver pacientes</Link>
          </header>
          <p className="nutri-muted">Pacientes sem plano alimentar ativo.</p>
          {pending.length ? (
            pending.map((p) => (
              <div className="nutri-list-row" key={p.id}>
                <Link to={`pacientes/${p.id}`}>{p.name}</Link>
                <Link to={`mensagens?paciente=${p.id}`}>Conversar →</Link>
              </div>
            ))
          ) : (
            <p className="nutri-empty">Nenhum paciente com plano pendente.</p>
          )}
        </section>
        <section className="nutri-card">
          <header>
            <h2>Próximas consultas</h2>
            <Link to="/app/nutricionista/consultas">Ver agenda</Link>
          </header>
          {appointments.slice(0, 5).map((a) => (
            <Link
              className="nutri-list-row"
              key={a.id}
              to={`pacientes/${a.patientId}`}
            >
              <strong>
                {patients.find((p) => p.id === a.patientId)?.name}
              </strong>
              <span>
                {dateLabel(a.date)} · {a.time}
              </span>
            </Link>
          ))}
          {!appointments.length && (
            <p className="nutri-empty">Nenhuma consulta agendada.</p>
          )}
        </section>
      </div>
    </>
  );
}
