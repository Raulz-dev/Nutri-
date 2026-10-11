import { env } from "./env";

type RequestOptions = RequestInit & { token?: string };
let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;
let generation = 0;
export function clearAccessToken() {
  accessToken = null;
  generation += 1;
}
export function setAccessToken(token: string) {
  accessToken = token;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function refreshAccess(): Promise<string> {
  if (!refreshPromise) {
    const started = generation;
    const refresh = async () => {
      const response = await fetch(`${env.apiUrl}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok)
        throw new ApiError(
          "Sua sessão terminou. Entre novamente.",
          response.status,
        );
      const body = (await response.json()) as { access_token: string };
      if (started !== generation) throw new ApiError("Sessão encerrada.", 401);
      accessToken = body.access_token;
      return accessToken;
    };
    refreshPromise = (
      typeof navigator !== "undefined" && navigator.locks
        ? navigator.locks.request("nutri-session-refresh", refresh)
        : refresh()
    ).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { token, headers, ...requestInit } = options;
  const send = (credential?: string) =>
    fetch(`${env.apiUrl}${path}`, {
      ...requestInit,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...headers,
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      },
    });
  let response: Response;
  try {
    response = await send(token ? (accessToken ?? token) : undefined);
    if (response.status === 401 && token && path !== "/users/me/password") {
      try {
        response = await send(await refreshAccess());
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearAccessToken();
          window.dispatchEvent(new Event("nutri-session-ended"));
        }
        throw error;
      }
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Não foi possível conectar ao servidor.", 0);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: unknown;
    } | null;
    throw new ApiError(
      typeof body?.detail === "string"
        ? body.detail
        : response.status === 422
          ? "Confira os campos informados e seus limites e tente novamente."
          : "Não foi possível concluir a solicitação.",
      response.status,
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
