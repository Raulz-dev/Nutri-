import { apiRequest } from "../../lib/http-client";

export type UazapiPairing = {
  connected: boolean;
  logged_in: boolean;
  state: string;
  qr_code: string | null;
};

export const getUazapiPairing = (token: string) =>
  apiRequest<UazapiPairing>("/whatsapp/uazapi/pairing", { token });

export const connectUazapi = (token: string) =>
  apiRequest<UazapiPairing>("/whatsapp/uazapi/connect", {
    token,
    method: "POST",
  });
