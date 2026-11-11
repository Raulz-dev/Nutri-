import { useEffect, useState, type ReactNode } from "react";
import {
  connectUazapi,
  getUazapiPairing,
  type UazapiPairing,
} from "../uazapi-api";
import "../styles/uazapi-connection.css";

export function UazapiConnectionPanel({
  token,
  children,
}: {
  token: string;
  children?: (connected: boolean) => ReactNode;
}) {
  const [connection, setConnection] = useState<UazapiPairing | null>(null);
  const [linked, setLinked] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let attempted = false;
    let timer: ReturnType<typeof setTimeout>;
    setConnection(null);
    setError("");
    setBusy(true);

    async function refresh() {
      try {
        let current = await getUazapiPairing(token);
        if (!active) return;
        setConnection(current);
        if (current.state !== "unlinked") setLinked(true);
        if (current.connected) attempted = false;
        if (
          !current.connected &&
          current.state !== "connecting" &&
          !attempted &&
          (current.state !== "unlinked" || attempt > 0)
        ) {
          attempted = true;
          setBusy(true);
          current = await connectUazapi(token);
          if (!active) return;
          setLinked(true);
        }
        setConnection(current);
        setError("");
        setBusy(false);
        function schedule(delay: number) {
          timer = setTimeout(() => {
            if (!active) return;
            if (document.visibilityState === "visible") void refresh();
            else schedule(5_000);
          }, delay);
        }
        schedule(current.connected ? 10_000 : 5_000);
      } catch (reason) {
        if (!active) return;
        setConnection(null);
        setBusy(false);
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível conectar o WhatsApp.",
        );
      }
    }
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [token, attempt]);

  return (
    <>
      <p className="uazapi-connection-status" role="status">
        <span
          aria-hidden="true"
          className={connection?.connected ? "is-connected" : "is-disconnected"}
        />
        {connection?.connected
          ? "Conectado"
          : busy && !connection
            ? "Verificando…"
            : "Desconectado"}
      </p>
      {!connection?.connected && (
        <section
          className="nutri-card uazapi-connection"
          aria-label="Pareamento do WhatsApp"
        >
          <div>
            <p>Use o WhatsApp no celular para ler o QR Code.</p>
            <ol>
              <li>Abra o WhatsApp no seu celular.</li>
              <li>
                Entre em <strong>Aparelhos conectados</strong> e toque em{" "}
                <strong>Conectar aparelho</strong>.
              </li>
              <li>Aponte a câmera para o QR Code exibido nesta tela.</li>
            </ol>
            {error && <p role="alert">{error}</p>}
            {!connection?.connected && !busy && (
              <button
                className="nutri-primary"
                onClick={() => setAttempt((value) => value + 1)}
              >
                {error
                  ? "Tentar novamente"
                  : connection?.state === "connecting"
                    ? "Verificar conexão"
                    : connection?.state === "unlinked"
                      ? "Conectar WhatsApp"
                      : "Gerar novo QR Code"}
              </button>
            )}
          </div>
          {!connection?.connected && (
            <div className="uazapi-qr" aria-live="polite" aria-busy={busy}>
              {connection?.qr_code ? (
                <>
                  <img
                    src={connection.qr_code}
                    alt="QR Code para conectar seu WhatsApp"
                    width={264}
                    height={264}
                  />
                  <p>Aguardando leitura no celular…</p>
                </>
              ) : (
                <p role="status">
                  {error
                    ? "QR Code indisponível."
                    : busy
                      ? "Preparando conexão…"
                      : connection?.state === "connecting"
                        ? "Aguardando QR Code…"
                        : connection?.state === "unlinked"
                          ? "Clique em Conectar WhatsApp para gerar o QR Code."
                          : "O pareamento terminou. Gere um novo QR Code para continuar."}
                </p>
              )}
            </div>
          )}
        </section>
      )}
      {linked && children?.(Boolean(connection?.connected))}
    </>
  );
}
