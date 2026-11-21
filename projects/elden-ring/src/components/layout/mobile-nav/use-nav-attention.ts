import { useNotesAdminBadge } from "../../../state/use-notes-admin";
import { useSupportBadges } from "../../../state/use-support";

/**
 * Does anything folded away inside the drawer want the user? The desktop title
 * bar shows those badges in place; once the same controls are hidden behind a
 * hamburger, the trigger has to carry the signal or it is lost.
 */
export const useNavAttention = (): boolean => {
  const { unreadReplies, inboxPending, isAdmin } = useSupportBadges();
  const notes = useNotesAdminBadge();
  // Staff see the queue waiting on them; everyone else sees replies waiting on them.
  const support = isAdmin ? unreadReplies + inboxPending : unreadReplies;
  return support > 0 || (notes.isAdmin && (notes.reported > 0 || notes.unreviewed > 0));
};
