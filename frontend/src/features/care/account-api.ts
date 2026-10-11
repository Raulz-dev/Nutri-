import { apiRequest } from "../../lib/http-client";
export type ProfessionalProfile = {
  name: string;
  crn: string;
  contact: string;
  bio: string;
  revision: number;
};
export type AccountSettings = {
  name: string;
  email: string;
  email_notifications: boolean;
};
export const getProfessionalProfile = (token: string) =>
  apiRequest<ProfessionalProfile>("/account/professional-profile", { token });
export const saveProfessionalProfile = (
  token: string,
  data: ProfessionalProfile,
) =>
  apiRequest<ProfessionalProfile>("/account/professional-profile", {
    token,
    method: "PUT",
    body: JSON.stringify(data),
  });
export const getSettings = (token: string) =>
  apiRequest<AccountSettings>("/account/settings", { token });
export const saveSettings = (
  token: string,
  data: AccountSettings & { current_password: string },
) =>
  apiRequest<AccountSettings>("/account/settings", {
    token,
    method: "PUT",
    body: JSON.stringify(data),
  });
export const changePassword = (
  token: string,
  current_password: string,
  new_password: string,
  new_password_confirmation: string,
) =>
  apiRequest("/users/me/password", {
    token,
    method: "POST",
    body: JSON.stringify({
      current_password,
      new_password,
      new_password_confirmation,
    }),
  });
