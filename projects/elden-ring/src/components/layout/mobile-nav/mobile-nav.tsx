import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import MobileNavDrawer from "./mobile-nav-drawer";
import { useMobileNav } from "./use-mobile-nav";
import { useNavAttention } from "./use-nav-attention";

/**
 * The hamburger that replaces the title bar's tab strip and control cluster
 * below `lg`. Overwolf's window floor is 1300px, so this never renders there —
 * the native app keeps the full desktop title bar untouched.
 */
const MobileNav = () => {
  const { t } = useTranslation();
  const { open, setOpen } = useMobileNav();
  const attention = useNavAttention();

  return (
    <>
      <button
        type="button"
        data-ow-no-drag
        data-tour="menu"
        onClick={() => setOpen(true)}
        aria-label={t("nav.menu")}
        aria-expanded={open}
        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white cursor-pointer lg:hidden"
      >
        <Menu size={20} aria-hidden="true" />
        {attention && (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent"
          />
        )}
      </button>

      {open && <MobileNavDrawer onClose={() => setOpen(false)} />}
    </>
  );
};

export default MobileNav;
