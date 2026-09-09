export type UserRole = "admin" | "nutritionist" | "patient";
export type UserStatus = "active" | "blocked";

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
};
