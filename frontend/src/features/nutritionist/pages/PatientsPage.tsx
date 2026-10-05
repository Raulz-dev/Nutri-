import { useState } from "react";
import { Link } from "react-router-dom";
import { TablePagination } from "../../../components/shared/TablePagination";
import { usePagination } from "../../../hooks/usePagination";
import { useAuth } from "../../auth/useAuth";
import {
  activePlan,
  demoUsers,
  initials,
  transferPatient,
  useDemo,
} from "../../demo/store";
import { recordAudit } from "../../admin/admin-audit";
import { Modal } from "../components/Modal";
export function NutritionistPatientsPage() {
  const { currentUser } = useAuth();
  const state = useDemo();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const patients = demoUsers(state).filter(
    (p) =>
      p.role === "patient" &&
      state.links.some(
        (l) => l.patientId === p.id && l.nutritionistId === currentUser!.id,
      ) &&
      `${p.name} ${p.email}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" ||
        Boolean(activePlan(state, p.id)) === (filter === "active")),
  );
  const pagination = usePagination(patients, JSON.stringify([search, filter]));
  return (
    <>
      <header className="nutri-heading">
        <span>ACOMPANHAMENTO</span>
        <h1>Meus pacientes</h1>
        <p>Histórico, planos e evolução em um só lugar.</p>
      </header>
      <div className="nutri-toolbar">
        <label>
          Buscar paciente
          <input
            placeholder="Nome ou e-mail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Plano alimentar
          <select className="nutri-rounded-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Todos</option>
            <option value="active">Com plano ativo</option>
            <option value="pending">Sem plano ativo</option>
          </select>
        </label>
        <button className="nutri-primary" onClick={() => setAdding(true)}>
          Adicionar paciente
        </button>
      </div>
      <section className="nutri-card nutri-table-card">
        <table>
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Plano alimentar</th>
              <th>Acompanhamento</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.map((p) => (
              <tr key={p.id}>
                <td data-label="Paciente">
                  <div className="nutri-person">
                    <b>{initials(p.name)}</b>
                    <span>
                      {p.name}
                      <small>{p.email}</small>
                    </span>
                  </div>
                </td>
                <td data-label="Plano">
                  <span
                    className={`nutri-badge ${activePlan(state, p.id) ? "green" : ""}`}
                  >
                    {activePlan(state, p.id) ? "Ativo" : "Sem plano ativo"}
                  </span>
                </td>
                <td>
                  <Link to={p.id}>Abrir paciente →</Link>
                </td>
              </tr>
            ))}
            {!patients.length && (
              <tr>
                <td colSpan={3} className="nutri-empty">
                  Nenhum paciente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <TablePagination {...pagination} />
      </section>
      {adding && <AddPatient onClose={() => setAdding(false)} />}
    </>
  );
}
function AddPatient({ onClose }: { onClose: () => void }) {
  const { currentUser } = useAuth();
  const state = useDemo();
  const users = demoUsers(state);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const candidates = users.filter(
    (u) =>
      u.role === "patient" &&
      u.status === "active" &&
      `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()) &&
      !state.links.some(
        (l) => l.patientId === u.id && l.nutritionistId === currentUser!.id,
      ),
  );
  const pagination = usePagination(candidates, search);
  function add() {
    if (!selected) return;
    try {
      transferPatient(selected, currentUser!.id);
      recordAudit(
        "link",
        users.find((u) => u.id === selected)!.name,
        `Vinculado a ${currentUser!.name}`,
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title="Adicionar paciente" onClose={onClose}>
      <p>
        Selecione um cadastro existente. Planos ativos impedem a troca de
        responsável.
      </p>
      <label>
        Buscar cadastro
        <input
          placeholder="Nome ou e-mail do paciente"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelected(null);
          }}
        />
      </label>
      <div className="nutri-picker">
        {pagination.items.map((p) => {
          const owner = state.links.find(
            (l) => l.patientId === p.id,
          )?.nutritionistId;
          const blocked = Boolean(activePlan(state, p.id));
          return (
            <button
              type="button"
              key={p.id}
              disabled={blocked}
              aria-pressed={selected === p.id}
              onClick={() => {
                setSelected(p.id);
                setError("");
              }}
            >
              <strong>{p.name}</strong>
              <small>
                {owner
                  ? `Responsável: ${users.find((u) => u.id === owner)?.name ?? "Profissional anterior"}`
                  : "Sem responsável"}
              </small>
              <span>
                {blocked
                  ? "Plano ativo · indisponível"
                  : owner
                    ? "Disponível para transferência"
                    : "Disponível"}
              </span>
            </button>
          );
        })}
        {!candidates.length && (
          <p>Nenhum paciente disponível para esta busca.</p>
        )}
      </div>
      <TablePagination {...pagination} />
      {selected && (
        <p>
          Ao confirmar, este paciente ficará sob sua responsabilidade. O
          histórico de acompanhamento será mantido.
        </p>
      )}
      {error && (
        <p role="alert" className="nutri-error">
          {error}
        </p>
      )}
      <div className="nutri-actions">
        <button onClick={onClose}>Cancelar</button>
        <button disabled={!selected} className="nutri-primary" onClick={add}>
          Confirmar vínculo
        </button>
      </div>
    </Modal>
  );
}
