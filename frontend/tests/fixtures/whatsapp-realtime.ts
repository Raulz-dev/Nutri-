import { useWhatsAppRealtime } from "../../src/features/nutritionist/useWhatsAppRealtime";
import { useVisiblePolling } from "../../src/hooks/useVisiblePolling";

export function useRealtimeTest(
  token: string,
  refresh: () => Promise<unknown>,
  onError: (reason: unknown) => void,
) {
  const state = useWhatsAppRealtime(token, refresh, onError);
  useVisiblePolling(refresh, onError, true, !state.connected);
  return state;
}
