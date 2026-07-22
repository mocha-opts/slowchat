import type { Socket } from "socket.io";

import type { AuthContext } from "../modules/auth/auth.types.js";

export type AuthenticatedSocket = Socket<
  Record<string, (...args: unknown[]) => void>,
  Record<string, (...args: unknown[]) => void>,
  Record<string, (...args: unknown[]) => void>,
  { auth?: AuthContext }
>;
