import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useVisiblePolling } from "../../../hooks/useVisiblePolling";
import { ApiError } from "../../../lib/http-client";
import { listPatients, type PatientRow } from "../../care/api";
import { MessageBubble, MessageComposer } from "../../care/ConversationParts";
import {
  recoverUazapiMessages,
  startUazapiConversation,
  uazapiConversations,
  uazapiHistory,
  uazapiSend,
  type UazapiConversation,
  type UazapiMessage,
} from "../uazapi-api";

import { UazapiAudioRecorder } from "./UazapiAudioRecorder";
import { UazapiAvatar } from "./UazapiAvatar";
import { UazapiPatientForm } from "./UazapiPatientForm";
import { UazapiMedia, uazapiMediaKind } from "./UazapiMedia";

export type PendingUazapiSends = Map<
  string,
  {
    id: string | null;
    text: string;
    file: File | null;
    running: boolean;
    error?: string;
  }
>;

const uploadTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/ogg",
  "audio/opus",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/webm",
];

async function encodeUpload(file: File) {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
  return { name: file.name, mime_type: file.type, base64: data };
}

const pageSize = 50;
const statusText = {
  sending: "Enviando…",
  unknown: "",
  failed: "Falha no envio",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  played: "Reproduzida",
};
const errorText = (reason: unknown) =>
  reason instanceof Error
    ? reason.message
    : "Não foi possível carregar o WhatsApp.";

function mergeMessages(previous: UazapiMessage[], incoming: UazapiMessage[]) {
  const byId = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(
    (a, b) =>
      Date.parse(a.occurred_at) - Date.parse(b.occurred_at) ||
      a.id.localeCompare(b.id),
  );
}

export function UazapiChats({
  token,
  connected,
  pendingSends,
  setPendingSends,
}: {
  token: string;
  connected: boolean;
  pendingSends: PendingUazapiSends;
  setPendingSends: Dispatch<SetStateAction<PendingUazapiSends>>;
}) {
  const [conversations, setConversations] = useState<
    UazapiConversation[] | null
  >(null);
  const [selected, setSelected] = useState<UazapiConversation | null>(null);
  const [error, setError] = useState("");
  const [pageCount, setPageCount] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [patients, setPatients] = useState<PatientRow[] | null>(null);
  const [patientId, setPatientId] = useState("");
  const [phone, setPhone] = useState("");
  const [action, setAction] = useState("");
  const [actionError, setActionError] = useState("");
  const [recoveryStatus, setRecoveryStatus] = useState("");
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    const pages = await Promise.all(
      Array.from({ length: pageCount }, (_, page) =>
        uazapiConversations(token, pageSize, page * pageSize),
      ),
    );
    if (request !== sequence.current) return;
    setConversations([
      ...new Map(pages.flat().map((chat) => [chat.id, chat])).values(),
    ]);
    setHasMore(pages.at(-1)?.length === pageSize);
    setLoadingMore(false);
    setError("");
  }, [token, pageCount]);
  useVisiblePolling(
    refresh,
    (reason) => {
      setError(errorText(reason));
      setLoadingMore(false);
    },
    true,
  );

  async function openNewConversation() {
    setAction("patients");
    setActionError("");
    try {
      const patients: PatientRow[] = [];
      let offset = 0;
      for (;;) {
        const page = await listPatients(token, offset, "", false, false, 100);
        patients.push(
          ...page.items.filter((patient) => patient.status === "active"),
        );
        offset += page.items.length;
        if (!page.items.length || offset >= page.total) break;
      }
      setPatients(patients);
    } catch (reason) {
      setActionError(errorText(reason));
    } finally {
      setAction("");
    }
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    setAction("start");
    setActionError("");
    try {
      const chat = await startUazapiConversation(token, patientId, phone);
      setSelected(chat);
      setPatients(null);
      setPatientId("");
      setPhone("");
      await refresh();
    } catch (reason) {
      setActionError(errorText(reason));
    } finally {
      setAction("");
    }
  }

  async function recover() {
    setAction("recover");
    setActionError("");
    setRecoveryStatus("Recuperando mensagens…");
    try {
      let offset: number | null = 0;
      let skipped = 0;
      while (offset !== null) {
        const page = await recoverUazapiMessages(token, offset);
        offset = page.next_offset;
        skipped += page.skipped;
      }
      await refresh();
      setRecoveryStatus(
        skipped
          ? `Recuperação concluída. ${skipped} mensagem(ns) incompatível(is) ignorada(s).`
          : "Recuperação concluída.",
      );
    } catch (reason) {
      setRecoveryStatus("");
      setActionError(errorText(reason));
    } finally {
      setAction("");
    }
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div>
        <button
          type="button"
          disabled={!connected || !!action}
          onClick={() => void openNewConversation()}
        >
          Nova conversa
        </button>
        <button
          type="button"
          disabled={!connected || !!action}
          onClick={() => void recover()}
        >
          Recuperar mensagens
        </button>
        {recoveryStatus && <p role="status">{recoveryStatus}</p>}
        {actionError && <p role="alert">{actionError}</p>}
        {patients && (
          <form onSubmit={start}>
            <label>
              Paciente vinculado
              <select
                required
                value={patientId}
                onChange={(event) => setPatientId(event.target.value)}
              >
                <option value="">Selecione um paciente</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              WhatsApp confirmado do paciente (DDI + DDD + número)
              <input
                required
                inputMode="tel"
                pattern="[1-9][0-9]{7,14}"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
            <button type="submit" disabled={!connected || !!action}>
              Abrir conversa
            </button>
            <button
              type="button"
              disabled={!!action}
              onClick={() => setPatients(null)}
            >
              Cancelar
            </button>
          </form>
        )}
      </div>
      <div className={`nutri-chat uazapi-chat ${selected ? "is-open" : ""}`}>
        <aside aria-label="Conversas do WhatsApp">
          {conversations === null && (
            <p className="nutri-empty">Carregando conversas…</p>
          )}
          {conversations?.length === 0 && (
            <p className="nutri-empty">Nenhuma conversa no WhatsApp.</p>
          )}
          {conversations?.map((chat) => (
            <button
              type="button"
              key={chat.id}
              className={selected?.id === chat.id ? "active" : ""}
              aria-pressed={selected?.id === chat.id}
              onClick={() => setSelected(chat)}
            >
              <UazapiAvatar
                token={token}
                chatId={chat.id}
                title={chat.title}
                connected={connected}
              />
              <span>{chat.title}</span>
            </button>
          ))}
          {hasMore && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => {
                setLoadingMore(true);
                setPageCount(pageCount + 1);
              }}
            >
              Carregar mais conversas
            </button>
          )}
        </aside>
        <section>
          {selected ? (
            <UazapiThread
              key={selected.id}
              chat={selected}
              token={token}
              connected={connected}
              pendingSends={pendingSends}
              setPendingSends={setPendingSends}
              onBack={() => setSelected(null)}
            />
          ) : (
            <p className="nutri-empty">Selecione uma conversa.</p>
          )}
        </section>
      </div>
    </>
  );
}

function UazapiThread({
  chat,
  token,
  connected,
  onBack,
  pendingSends,
  setPendingSends,
}: {
  chat: UazapiConversation;
  token: string;
  connected: boolean;
  onBack: () => void;
  pendingSends: PendingUazapiSends;
  setPendingSends: Dispatch<SetStateAction<PendingUazapiSends>>;
}) {
  const [phone, setPhone] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [addPatientOpen, setAddPatientOpen] = useState(false);
  const [messages, setMessages] = useState<UazapiMessage[] | null>(null);
  const [before, setBefore] = useState<string | null>(null);
  const [localDraft, setDraft] = useState("");
  const pending = pendingSends.get(chat.id);
  const draft = pending?.text ?? localDraft;
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const file = pending ? pending.file : localFile;
  const locked = Boolean(pending?.id);
  const [recording, setRecording] = useState(false);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file?.type.startsWith("audio/")) {
      setAudioPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setAudioPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function changeFile(next: File | null) {
    if (locked) return;
    if (
      next &&
      (!uploadTypes.includes(next.type) ||
        next.size === 0 ||
        next.size > 10 * 1024 * 1024)
    ) {
      setFileError("Escolha um PDF, áudio ou foto de até 10 MB.");
      return;
    }
    setFileError("");
    if (!pending) setLocalFile(next);
    else {
      setPendingSends((current) => {
        const saved = current.get(chat.id);
        if (saved?.id !== null) return current;
        return new Map(current).set(chat.id, { ...saved, file: next });
      });
    }
  }
  const [error, setError] = useState("");
  const sendError = pending?.error;
  const [loadingOlder, setLoadingOlder] = useState(false);
  const sending = useRef(false);
  const oldestLoaded = useRef<string | null | undefined>(undefined);
  const historyView = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const revision = useRef(0);

  const refresh = useCallback(async () => {
    const current = revision.current;
    const result = await uazapiHistory(token, chat.id);
    const incoming = [...result.items];
    const boundary = oldestLoaded.current;
    let cursor = result.next_before;
    while (
      boundary !== undefined &&
      cursor &&
      !incoming.some((message) => message.id === boundary)
    ) {
      const page = await uazapiHistory(token, chat.id, cursor);
      if (current !== revision.current) return;
      incoming.unshift(...page.items);
      cursor = page.next_before;
    }
    if (current !== revision.current) return;
    setMessages((previous) => mergeMessages(previous ?? [], incoming));
    setPhone(result.phone ?? null);
    setPatientId(result.patient_id ?? null);
    if (boundary === undefined) setBefore(result.next_before);
    oldestLoaded.current = incoming[0]?.id ?? null;
    setError("");
  }, [token, chat.id]);
  useVisiblePolling(refresh, (reason) => setError(errorText(reason)), true);

  useLayoutEffect(() => {
    const view = historyView.current;
    if (view && followLatest.current) view.scrollTop = view.scrollHeight;
  }, [messages]);

  async function loadOlder() {
    if (!before || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const result = await uazapiHistory(token, chat.id, before);
      followLatest.current = false;
      setMessages((previous) => mergeMessages(result.items, previous ?? []));
      setBefore(result.next_before);
      oldestLoaded.current = result.items[0]?.id ?? oldestLoaded.current;
      revision.current++;
      setError("");
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (
      !connected ||
      recording ||
      sending.current ||
      pending?.running ||
      (!draft.trim() && !file)
    )
      return;
    const text = draft.trim();
    if (file?.type.startsWith("audio/") && text) {
      setFileError("Envie o áudio e o texto em mensagens separadas.");
      return;
    }
    setFileError("");
    const attempt = { id: pending?.id ?? crypto.randomUUID(), text, file };
    setPendingSends((current) =>
      new Map(current).set(chat.id, { ...attempt, running: true }),
    );
    setDraft("");
    setLocalFile(null);
    sending.current = true;
    function finishAttempt(failure?: { retry: boolean; error: string }) {
      setPendingSends((current) => {
        if (current.get(chat.id)?.id !== attempt.id) return current;
        const next = new Map(current);
        if (failure)
          next.set(chat.id, {
            text: attempt.text,
            file: attempt.file,
            id: failure.retry ? attempt.id : null,
            running: false,
            error: failure.error,
          });
        else next.delete(chat.id);
        return next;
      });
    }
    try {
      let attachment;
      try {
        attachment = attempt.file
          ? await encodeUpload(attempt.file)
          : undefined;
      } catch (reason) {
        finishAttempt({ retry: false, error: errorText(reason) });
        return;
      }
      const message = await uazapiSend(
        token,
        chat.id,
        attempt.id,
        attempt.text,
        attachment,
      );
      revision.current++;
      followLatest.current = true;
      setMessages((previous) => mergeMessages(previous ?? [], [message]));
      finishAttempt();
    } catch (reason) {
      if (
        reason instanceof ApiError &&
        [400, 401, 403, 404, 409, 413, 415, 422].includes(reason.status)
      ) {
        finishAttempt({ retry: false, error: errorText(reason) });
      } else {
        finishAttempt({
          retry: true,
          error:
            "Envio sem confirmação. Use Enviar para consultar a mesma tentativa.",
        });
      }
    } finally {
      sending.current = false;
    }
  }

  return (
    <>
      <button type="button" className="nutri-chat-back" onClick={onBack}>
        ← Conversas
      </button>
      <div className="chat-panel">
        <header className="chat-header">
          <div>
            <strong>
              {phone && chat.title.includes("@") ? phone : chat.title}
            </strong>
            {phone && chat.title !== phone && !chat.title.includes("@") && (
              <small>{phone}</small>
            )}
          </div>
          {phone && !patientId && (
            <div className="uazapi-add-patient">
              <button
                type="button"
                className="nutri-primary"
                onClick={() => setAddPatientOpen(true)}
              >
                <span aria-hidden="true">👤+</span> Adicionar paciente
              </button>
            </div>
          )}
        </header>
        <div
          className="chat-history"
          role="log"
          aria-label="Histórico do WhatsApp"
          ref={historyView}
          onScroll={({ currentTarget }) => {
            followLatest.current =
              currentTarget.scrollHeight -
                currentTarget.scrollTop -
                currentTarget.clientHeight <
              80;
          }}
        >
          {before && (
            <button
              type="button"
              disabled={loadingOlder}
              onClick={() => {
                void loadOlder();
              }}
            >
              Carregar mensagens anteriores
            </button>
          )}
          {messages === null && (
            <p className="nutri-empty">Carregando mensagens…</p>
          )}
          {messages
            ?.filter(
              ({ kind }) =>
                !["sticker", "stickermessage"].includes(kind.toLowerCase()),
            )
            .map((message) => {
              const label = uazapiMediaKind(message.kind);
              return (
                <MessageBubble
                  key={message.id}
                  own={message.direction === "outbound"}
                  text={message.text || label || `[${message.kind}]`}
                >
                  {label &&
                    (message.direction === "inbound" ||
                      message.media_available) && (
                      <UazapiMedia
                        token={token}
                        chatId={chat.id}
                        messageId={message.id}
                        label={label}
                      />
                    )}
                  <time dateTime={message.occurred_at}>
                    {new Date(message.occurred_at).toLocaleString("pt-BR")}
                    {message.delivery_status &&
                      ` · ${statusText[message.delivery_status]}`}
                  </time>
                </MessageBubble>
              );
            })}
        </div>
        <div className="uazapi-chat-footer">
          {error && <p role="alert">{error}</p>}
          {sendError && <p role="alert">{sendError}</p>}
          {fileError && <p role="alert">{fileError}</p>}
          {file && (
            <div className="uazapi-selected-file">
              <span>{file.name}</span>
              {audioPreview && (
                <audio
                  controls
                  src={audioPreview}
                  aria-label="Prévia do áudio"
                />
              )}
              <button
                type="button"
                disabled={locked}
                onClick={() => changeFile(null)}
                aria-label="Remover anexo"
              >
                ×
              </button>
            </div>
          )}
          {connected ? (
            <MessageComposer
              id="uazapi-message"
              draft={draft}
              compact
              hasAttachment={Boolean(file)}
              attachmentControl={
                <div className="uazapi-composer-tools">
                  <label
                    className="uazapi-attachment-control"
                    title="Anexar PDF, áudio ou foto"
                  >
                    <span aria-hidden="true">📎</span>
                    <input
                      className="sr-only"
                      type="file"
                      aria-label="Anexar PDF, áudio ou foto"
                      disabled={locked || recording}
                      accept={uploadTypes.join(",")}
                      onChange={(event) => {
                        const next = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (next) changeFile(next);
                      }}
                    />
                  </label>
                  <UazapiAudioRecorder
                    disabled={locked || Boolean(file)}
                    onBusy={setRecording}
                    onRecorded={changeFile}
                    onError={setFileError}
                  />
                </div>
              }
              busy={recording || (pending?.running ?? false)}
              onChange={(value) => {
                if (!pending) setDraft(value);
                else if (pending.id === null) {
                  setPendingSends((current) => {
                    const saved = current.get(chat.id);
                    if (saved?.id !== null) return current;
                    return new Map(current).set(chat.id, {
                      ...saved,
                      text: value,
                    });
                  });
                }
              }}
              onSubmit={send}
            />
          ) : (
            <p role="status">Reconecte o WhatsApp para enviar mensagens.</p>
          )}
        </div>
      </div>
      {addPatientOpen && phone && (
        <UazapiPatientForm
          token={token}
          chatId={chat.id}
          phone={phone}
          title={chat.title}
          onClose={() => setAddPatientOpen(false)}
          onSaved={(id) => {
            revision.current++;
            setPatientId(id);
            setAddPatientOpen(false);
          }}
        />
      )}
    </>
  );
}
