import { useEffect, useState, type FormEvent } from "react";
import { TablePagination } from "../../../components/shared/TablePagination";
import {
  listInvitationCandidates,
  type InvitationCandidate,
} from "../../care/api";
import { Modal } from "./Modal";

type InvitePatientModalProps = {
  token: string;
  busy: boolean;
  onClose: () => void;
  onInvite: (email: string) => Promise<void>;
};

export function InvitePatientModal({
  token,
  busy,
  onClose,
  onInvite,
}: InvitePatientModalProps) {
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidates, setCandidates] = useState<InvitationCandidate[]>([]);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const [candidateRetry, setCandidateRetry] = useState(0);
  const [selectedPatient, setSelectedPatient] =
    useState<InvitationCandidate | null>(null);

  useEffect(() => {
    let active = true;
    setCandidateLoading(true);
    setCandidateError("");
    const timer = setTimeout(() => {
      listInvitationCandidates(token, candidateSearch, (candidatePage - 1) * 10)
        .then((result) => {
          if (active) {
            setCandidates(result.items);
            setCandidateTotal(result.total);
          }
        })
        .catch((reason) => {
          if (active)
            setCandidateError(
              reason instanceof Error
                ? reason.message
                : "Não foi possível buscar pacientes.",
            );
        })
        .finally(() => {
          if (active) setCandidateLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [token, candidateSearch, candidatePage, candidateRetry]);

  function sendInvitation(event: FormEvent) {
    event.preventDefault();
    if (busy || !selectedPatient) return;
    void onInvite(selectedPatient.email);
  }

  return (
    <Modal
      title="Convidar paciente"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        Convide um paciente já cadastrado e sem vínculo ativo. O vínculo será
        criado quando ele aceitar.
      </p>
      <form onSubmit={sendInvitation} className="nutri-form">
        <label>
          Buscar por nome ou e-mail
          <input
            maxLength={100}
            disabled={busy}
            value={candidateSearch}
            onChange={(event) => {
              setCandidateSearch(event.target.value);
              setCandidatePage(1);
              setSelectedPatient(null);
            }}
            placeholder="Nome ou e-mail do paciente"
          />
        </label>
        {candidateLoading ? (
          <p role="status">Buscando pacientes...</p>
        ) : candidateError ? (
          <div role="alert">
            <p>{candidateError}</p>
            <button
              type="button"
              onClick={() => setCandidateRetry((value) => value + 1)}
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            <div
              className="nutri-invite-candidates"
              role="group"
              aria-label="Pacientes disponíveis"
            >
              {candidates.map((patient) => (
                <button
                  key={patient.id}
                  type="button"
                  disabled={busy}
                  aria-pressed={selectedPatient?.id === patient.id}
                  onClick={() => setSelectedPatient(patient)}
                >
                  <strong>{patient.name}</strong>
                  <small>{patient.email}</small>
                </button>
              ))}
              {!candidates.length && (
                <p>Nenhum paciente disponível encontrado.</p>
              )}
            </div>
            <TablePagination
              page={candidatePage}
              totalPages={Math.max(1, Math.ceil(candidateTotal / 10))}
              onPageChange={(value) => {
                setCandidatePage(value);
                setSelectedPatient(null);
              }}
            />
          </>
        )}
        {selectedPatient && (
          <p role="status">
            Selecionado: <strong>{selectedPatient.name}</strong>
          </p>
        )}
        <div className="nutri-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="nutri-primary"
            disabled={
              busy || !selectedPatient || candidateLoading || !!candidateError
            }
          >
            {busy ? "Enviando..." : "Enviar convite"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
