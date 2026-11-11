import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { NutritionistMessagesPage } from "../pages/MessagesPage";
import { UazapiConnectionPanel } from "./UazapiConnectionPanel";
import { UazapiChats, type PendingUazapiSends } from "./UazapiChats";
import "../styles/uazapi-connection.css";

export function MessagingChannels() {
  const { session } = useAuth();
  const token = session!.accessToken;
  const [pendingSends, setPendingSends] = useState<PendingUazapiSends>(
    () => new Map(),
  );
  const [params] = useSearchParams();
  const [channel, setChannel] = useState<"internal" | "whatsapp" | null>(null);
  const activeChannel =
    channel ??
    (params.has("conversa") || params.has("paciente")
      ? "internal"
      : "whatsapp");

  return (
    <div className="nutri-messaging-page">
      <h1 className="sr-only">Mensagens</h1>
      <div
        className="uazapi-channels"
        role="group"
        aria-label="Canal de atendimento"
      >
        <button
          type="button"
          aria-pressed={activeChannel === "whatsapp"}
          onClick={() => setChannel("whatsapp")}
        >
          WhatsApp
        </button>
        <button
          type="button"
          aria-pressed={activeChannel === "internal"}
          onClick={() => setChannel("internal")}
        >
          Chat da plataforma
        </button>
      </div>
      {activeChannel === "internal" ? (
        <NutritionistMessagesPage />
      ) : (
        <UazapiConnectionPanel token={token}>
          {(connected) => (
            <UazapiChats
              token={token}
              connected={connected}
              pendingSends={pendingSends}
              setPendingSends={setPendingSends}
            />
          )}
        </UazapiConnectionPanel>
      )}
    </div>
  );
}
