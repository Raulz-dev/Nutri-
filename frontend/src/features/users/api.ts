import { apiRequest } from "../../lib/http-client";
import type { User } from "./types";

export function getCurrentUser(accessToken: string) {
  return apiRequest<User>("/users/me", { token: accessToken });
}
