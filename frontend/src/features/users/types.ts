export type UserRole = "admin" | "nutritionist" | "patient";
export type UserStatus = "active" | "blocked";

export type User = {
  id: string;
  name: string;
  email: string;
  cpf?: string | null;
  role: UserRole;
  status: UserStatus;
  deactivated_at?: string | null;
  first_access_pending?: boolean;
};
