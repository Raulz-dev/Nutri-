export type LoginCredentials = {
  email: string;
  password: string;
};

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
};
