import { useEffect, useState } from "react";
import { uazapiMedia } from "../uazapi-api";

export function uazapiMediaKind(kind: string) {
  switch (kind.toLowerCase()) {
    case "image":
    case "imagemessage":
      return "Imagem";
    case "audio":
    case "audiomessage":
    case "ptt":
    case "pttmessage":
      return "Áudio";
    case "document":
    case "documentmessage":
    case "documentwithcaptionmessage":
      return "Documento";
    default:
      return null;
  }
}

export function UazapiMedia({
  token,
  chatId,
  messageId,
  label,
}: {
  token: string;
  chatId: string;
  messageId: string;
  label: string;
}) {
  const [media, setMedia] = useState<{ url: string; mime: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let pdfUrl: string | undefined;
    void uazapiMedia(token, chatId, messageId)
      .then(({ mime_type, base64 }) => {
        if (!active) return;
        if (mime_type === "application/pdf") {
          const decoded = atob(base64);
          const bytes = Uint8Array.from(decoded, (character) =>
            character.charCodeAt(0),
          );
          pdfUrl = URL.createObjectURL(new Blob([bytes], { type: mime_type }));
        }
        setMedia({
          mime: mime_type,
          url: pdfUrl ?? `data:${mime_type};base64,${base64}`,
        });
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Anexo indisponível.",
          );
      });
    return () => {
      active = false;
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [token, chatId, messageId, attempt]);

  if (error)
    return (
      <div>
        <span>{error}</span>{" "}
        <button
          type="button"
          onClick={() => {
            setError("");
            setAttempt((value) => value + 1);
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  if (!media) return <small>Carregando {label.toLowerCase()}…</small>;
  if (media.mime.startsWith("image/")) {
    return (
      <img
        className="uazapi-chat-image"
        src={media.url}
        alt="Imagem recebida pelo WhatsApp"
      />
    );
  }
  if (media.mime.startsWith("audio/")) {
    return (
      <audio
        className="uazapi-chat-audio"
        controls
        src={media.url}
        aria-label="Áudio recebido pelo WhatsApp"
      />
    );
  }
  return (
    <div className="uazapi-chat-pdf">
      <iframe
        title="Prévia do PDF recebido pelo WhatsApp"
        src={`${media.url}#page=1&toolbar=0`}
        loading="lazy"
      />
      <a href={media.url} target="_blank" rel="noopener noreferrer">
        Abrir PDF
      </a>
      {" · "}
      <a href={media.url} download="documento-whatsapp.pdf">
        Baixar PDF
      </a>
    </div>
  );
}
