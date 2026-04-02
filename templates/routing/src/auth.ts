import { signal } from "sibujs";

const [isAuthenticated, setAuthenticated] = signal(false);

export const auth = {
  isAuthenticated,
  login: () => setAuthenticated(true),
  logout: () => setAuthenticated(false),
};
