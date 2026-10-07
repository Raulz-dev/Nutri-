import { useEffect, useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { ErrorToast } from "../../../components/ui/ErrorToast";
import {
  acceptLinkInvitation,
  declineLinkInvitation,
  listLinkInvitations,
  type LinkInvitation,
} from "../../care/api";

export function PatientLinkInvitations() {
  const { session } = useAuth();
  const token = session?.accessToken ?? "";
  const [invitations, setInvitations] = useState<LinkInvitation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    listLinkInvitations(token)
      .then((items) => { if (active) setInvitations(items); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar os convites."); });
    return () => { active = false; };
  }, [token]);

  async function answer(invitation: LinkInvitation, accept: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (accept) {
        await acceptLinkInvitation(token, invitation.id);
        setNotice(`Vínculo com ${invitation.nutritionist_name} confirmado.`);
      } else {
        await declineLinkInvitation(token, invitation.id);
        setNotice("Convite recusado.");
      }
      setInvitations(await listLinkInvitations(token));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível responder ao convite.");
    } finally {
      setBusy(false);
    }
  }

  if (!invitations.length && !notice) return error ? <ErrorToast message={error} /> : null;
  return <section className="patient-link-invitations" aria-label="Convites de nutricionistas">
    <ErrorToast message={error} />
    {notice && <p role="status">{notice}</p>}
    {invitations.length > 0 && <>
      <h2>Convites para acompanhamento</h2>
      {invitations.map((invitation) => <div className="patient-link-invitation" key={invitation.id}>
        <p><strong>{invitation.nutritionist_name}</strong> convidou você para um vínculo de acompanhamento.</p>
        <div><button type="button" disabled={busy} onClick={() => answer(invitation, true)}>Aceitar</button>
          <button type="button" disabled={busy} onClick={() => answer(invitation, false)}>Recusar</button></div>
      </div>)}
    </>}
  </section>;
}
