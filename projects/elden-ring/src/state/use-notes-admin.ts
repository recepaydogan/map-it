import { useNotesAdminStore } from "../store/notes-admin-store";
import { useSupportStore } from "../store/support-store";

/** What the title-bar button needs: whether to render, and what to shout about. */
export const useNotesAdminBadge = () => {
  const isAdmin = useSupportStore((state) => state.isAdmin);
  const counts = useNotesAdminStore((state) => state.counts);
  return { isAdmin, reported: counts.reported, unreviewed: counts.unreviewed };
};
