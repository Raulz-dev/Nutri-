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

export function registerPatientRequest(data: {
  name: string;
  email: string;
  password: string;
}) {
  return apiRequest<void>("/users", {
    method: "POST",
    body: JSON.stringify({ ...data, role: "patient" }),
  });
}

export function resetPasswordRequest(
  token: string,
  newPassword: string,
  newPasswordConfirmation: string,
) {
  return apiRequest<{ message: string }>("/auth/password/reset", {
    method: "POST",
    body: JSON.stringify({
      token,
      new_password: newPassword,
      new_password_confirmation: newPasswordConfirmation,
    }),
  });
}
