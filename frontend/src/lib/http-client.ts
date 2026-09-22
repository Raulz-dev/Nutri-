import { env } from "./env";

type RequestOptions = RequestInit & {
  token?: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...requestInit } = options;
  const response = await fetch(`${env.apiUrl}${path}`, {
    ...requestInit,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    const message =
      typeof body?.detail === "string"
        ? body.detail
        : response.status === 422
          ? "Confira os campos informados e seus limites e tente novamente."
          : "Não foi possível concluir a solicitação.";
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
