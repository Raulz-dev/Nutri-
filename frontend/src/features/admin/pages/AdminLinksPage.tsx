import { TablePagination } from "../components/TablePagination";
import { usePagination } from "../hooks/usePagination";
import { useModalBehavior } from "../../../hooks/useModalBehavior";
import { useMemo, useRef, useState } from "react";

import { AdminIcon, AdminShell } from "../AdminShell";
import { removePatientLink, savePatientLink } from "../admin-links";
import type { User } from "../../users/types";
import { activePlan, demoUsers, useDemo } from "../../demo/store";

export function AdminLinksPage() {
  const state = useDemo();
  const users = demoUsers(state);
  const links = state.links;
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [selectingPatient, setSelectingPatient] = useState<User | null>(null);
  const patients = useMemo(() => users.filter((user) => {
    const hasLink = links.some((link) => link.patientId === user.id);
    return user.role === "patient"
      && (linkFilter === "all" || (linkFilter === "linked" ? hasLink : !hasLink))
      && (!search.trim() || `${user.name} ${user.email}`.toLowerCase().includes(search.trim().toLowerCase()));
  }), [users, links, search, linkFilter]);
  const nutritionists = users.filter((user) => user.role === "nutritionist" && user.status === "active");

  const pagination = usePagination(patients, JSON.stringify([search, linkFilter]));

  return <AdminShell title="Vínculos" subtitle="Associe pacientes aos nutricionistas responsáveis.">
    {error && <p role="alert" className="admin-form-error">{error}</p>}
    <section className="admin-panel users-search-panel audit-search-panel links-search-panel"><div className="users-filters"><label className="admin-search"><span className="sr-only">Pesquisar paciente</span><AdminIcon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail" /></label><label><span>Vínculo</span><select value={linkFilter} onChange={(event) => setLinkFilter(event.target.value as typeof linkFilter)}><option value="all">Todos os pacientes</option><option value="linked">Com nutricionista</option><option value="unlinked">Sem nutricionista</option></select></label></div></section>
    <section className="admin-panel users-table-panel"><div className="users-table-wrap"><table className="users-table links-table"><thead><tr><th>Paciente</th><th>Nutricionista responsável</th><th>Status do vínculo</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>
      {pagination.items.map((patient) => { const link = links.find((item) => item.patientId === patient.id); const nutritionist = nutritionists.find((item) => item.id === link?.nutritionistId); const pickerLabel = link ? "Alterar nutricionista" : "Adicionar nutricionista"; return <tr key={patient.id}><td data-label="Paciente"><div className="user-cell"><span>{initials(patient.name)}</span><div><strong>{patient.name}</strong><small>{patient.email}</small></div></div></td><td data-label="Nutricionista"><strong className="linked-nutritionist-name">{nutritionist?.name ?? "Não definido"}</strong></td><td data-label="Status"><span className={`link-status ${link ? "linked" : "unlinked"}`}>{activePlan(state, patient.id) ? "Plano ativo · vínculo protegido" : link ? "Vinculado" : "Sem vínculo"}</span></td><td data-label="Ações"><div className="row-actions"><button className="icon-action" type="button" disabled={Boolean(activePlan(state, patient.id))} onClick={() => setSelectingPatient(patient)} aria-label={pickerLabel} data-tooltip={pickerLabel}><AdminIcon name={link ? "edit" : "plus"} /></button><button className="icon-action danger" type="button" disabled={!link || Boolean(activePlan(state, patient.id))} onClick={() => { try { removePatientLink(links, patient); setError(""); } catch (e) { setError((e as Error).message); } }} aria-label="Remover vínculo" data-tooltip={link ? "Remover vínculo" : "Paciente sem vínculo"}><AdminIcon name="unlink" /></button></div></td></tr>; })}
      {!patients.length ? <tr><td className="users-empty" colSpan={4}>Nenhum paciente corresponde aos filtros.</td></tr> : null}
    </tbody></table></div>
      <TablePagination {...pagination} />
    </section>
    {selectingPatient ? <NutritionistPicker patient={selectingPatient} nutritionists={nutritionists} selectedId={links.find((link) => link.patientId === selectingPatient.id)?.nutritionistId} onClose={() => setSelectingPatient(null)} onSelect={(nutritionist) => { try { savePatientLink(links, selectingPatient, nutritionist); setSelectingPatient(null); setError(""); } catch (e) { setError((e as Error).message); setSelectingPatient(null); } }} /> : null}
  </AdminShell>;
}

function NutritionistPicker({ patient, nutritionists, selectedId, onClose, onSelect }: { patient: User; nutritionists: User[]; selectedId?: string; onClose: () => void; onSelect: (nutritionist: User) => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const [search, setSearch] = useState("");
  const filteredNutritionists = nutritionists.filter((nutritionist) => `${nutritionist.name} ${nutritionist.email}`.toLowerCase().includes(search.trim().toLowerCase()));
  useModalBehavior(dialogRef, onClose);
  return <div className="admin-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="admin-modal nutritionist-picker" role="dialog" aria-modal="true" aria-labelledby="nutritionist-picker-title"><header><div><span className="admin-section-label">Vincular profissional</span><h2 id="nutritionist-picker-title">Selecionar nutricionista</h2></div><button className="admin-modal-close" type="button" onClick={onClose} aria-label="Fechar">×</button></header><p className="modal-helper">Escolha o nutricionista responsável por {patient.name}.</p><label className="admin-search nutritionist-picker-search"><span className="sr-only">Pesquisar nutricionista</span><AdminIcon name="search" /><input data-modal-initial-focus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou e-mail" /></label><div className="nutritionist-picker-list">{filteredNutritionists.map((nutritionist) => <button className={nutritionist.id === selectedId ? "is-selected" : ""} type="button" key={nutritionist.id} onClick={() => onSelect(nutritionist)}><span>{initials(nutritionist.name)}</span><span><strong>{nutritionist.name}</strong><small>{nutritionist.email}</small></span><span className={`status-badge ${nutritionist.status}`}><i />{nutritionist.status === "active" ? "Ativo" : "Bloqueado"}</span></button>)}{!filteredNutritionists.length ? <p className="admin-list-empty">Nenhum nutricionista encontrado.</p> : null}</div></section></div>;
}
function initials(name: string) { return name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
