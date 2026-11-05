import { useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { NutritionistMessagesPage } from "../pages/MessagesPage";
import { UazapiConnectionPanel } from "./UazapiConnectionPanel";
import "../styles/uazapi-connection.css";

export function MessagingChannels() {
  const { session } = useAuth();
  const [channel, setChannel] = useState<"internal" | "whatsapp">("internal");
  return (
    <>
      <div
        className="uazapi-channels"
        role="group"
        aria-label="Canal de atendimento"
      >
        <button
          aria-pressed={channel === "internal"}
          onClick={() => setChannel("internal")}
        >
          Chat da plataforma
        </button>
        <button
          aria-pressed={channel === "whatsapp"}
          onClick={() => setChannel("whatsapp")}
        >
          WhatsApp
        </button>
      </div>
      {channel === "internal" ? (
        <NutritionistMessagesPage />
      ) : (
        <UazapiConnectionPanel token={session!.accessToken} />
      )}
    </>
  );
}
