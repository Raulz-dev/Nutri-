const apiUrl = import.meta.env.VITE_API_URL?.trim();

export const env = {
  apiUrl: apiUrl || "http://localhost:8000/api/v1",
};
