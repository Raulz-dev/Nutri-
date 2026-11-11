import { useEffect, useRef, useState } from "react";

const formats = [
  ["audio/ogg;codecs=opus", "ogg"],
  ["audio/webm;codecs=opus", "webm"],
  ["audio/mp4", "m4a"],
] as const;

export function UazapiAudioRecorder({
  disabled,
  onBusy,
  onRecorded,
  onError,
}: {
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onRecorded: (file: File) => void;
  onError: (error: string) => void;
}) {
  const [state, setState] = useState<"idle" | "opening" | "recording">("idle");
  const generation = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(
    () => () => {
      generation.current++;
      const current = recorder.current;
      if (current) {
        if (current.state !== "inactive") current.stop();
        current.stream.getTracks().forEach((track) => track.stop());
      }
      onBusy(false);
    },
    [onBusy],
  );

  async function start() {
    const format =
      typeof MediaRecorder === "undefined"
        ? undefined
        : formats.find(([mime]) => MediaRecorder.isTypeSupported(mime));
    if (!format || !navigator.mediaDevices?.getUserMedia) {
      onError(
        "O navegador não disponibilizou a gravação. Use HTTPS ou localhost.",
      );
      return;
    }

    const attempt = ++generation.current;
    setState("opening");
    onBusy(true);
    onError("");
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation.current !== attempt) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const [mime, extension] = format;
      const current = new MediaRecorder(stream, { mimeType: mime });
      recorder.current = current;
      const chunks: Blob[] = [];
      let size = 0;
      let failed = false;
      current.ondataavailable = ({ data }) => {
        if (!data.size) return;
        chunks.push(data);
        size += data.size;
        if (size >= 9 * 1024 * 1024 && current.state === "recording")
          current.stop();
      };
      current.onerror = () => {
        failed = true;
        if (generation.current === attempt)
          onError("Não foi possível gravar o áudio.");
        if (current.state !== "inactive") current.stop();
      };
      current.onstop = () => {
        current.stream.getTracks().forEach((track) => track.stop());
        if (generation.current !== attempt) return;
        recorder.current = null;
        setState("idle");
        onBusy(false);
        if (!failed && size) {
          onRecorded(
            new File(chunks, `audio-whatsapp.${extension}`, {
              type: mime.split(";")[0],
            }),
          );
        } else if (!failed) {
          onError("Nenhum áudio foi gravado. Tente novamente.");
        }
      };
      current.start(1000);
      setState("recording");
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      if (generation.current !== attempt) return;
      recorder.current = null;
      setState("idle");
      onBusy(false);
      onError(
        "Não foi possível acessar o microfone. Confira a permissão do navegador.",
      );
    }
  }

  return (
    <button
      type="button"
      className="uazapi-record-control"
      disabled={state === "opening" || (state === "idle" && disabled)}
      aria-label={state === "recording" ? "Parar gravação" : "Gravar áudio"}
      title={state === "recording" ? "Parar gravação" : "Gravar áudio"}
      onClick={() => {
        if (state === "recording") {
          if (recorder.current?.state === "recording") recorder.current.stop();
        } else if (state === "idle") {
          void start();
        }
      }}
    >
      <span aria-hidden="true">{state === "recording" ? "⏹" : "🎙️"}</span>
    </button>
  );
}
