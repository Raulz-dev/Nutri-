import { apiRequest } from "../../lib/http-client";
import type { AuthTokens, LoginCredentials } from "./types";

export function loginRequest(credentials: LoginCredentials) {
  return apiRequest<AuthTokens>("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export function logoutRequest(refreshToken: string) {
  return apiRequest<void>("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function forgotPasswordRequest(email: string) {
  return apiRequest<{ message: string }>("/auth/password/forgot", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
