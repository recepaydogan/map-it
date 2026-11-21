import { createContext, useContext } from "react";
export const SharedAccountContext = createContext<{ open: boolean; show: () => void; showSupport: () => void } | null>(null);
export function useOpenSharedAccount() {
  const account = useContext(SharedAccountContext);
  if (!account) throw new Error("Shared account provider is missing");
  return account.show;
}
export const useSharedAccountVisible = () => useContext(SharedAccountContext)?.open ?? false;
export function useOpenSharedSupport() {
  const surface = useContext(SharedAccountContext);
  if (!surface) throw new Error("Shared surface provider is missing");
  return surface.showSupport;
}
