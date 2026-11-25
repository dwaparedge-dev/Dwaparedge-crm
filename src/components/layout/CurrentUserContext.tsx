"use client";
import { createContext, useContext } from "react";
import type { Permission } from "@/lib/auth/permissions";

export interface CurrentUserValue {
  id: string;
  name: string;
  email: string;
  /** Permission keys held by the signed-in account. Used to show or hide controls; the server still decides. */
  permissions: Permission[];
}

const CurrentUserContext = createContext<CurrentUserValue | null>(null);

/** Hands the signed-in user, read once on the server by the dashboard layout, to every client component below it. */
export function CurrentUserProvider({ user, children }: { user: CurrentUserValue; children: React.ReactNode }) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUserValue {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error("useCurrentUser must be used inside <CurrentUserProvider> (the dashboard layout provides it).");
  return user;
}
