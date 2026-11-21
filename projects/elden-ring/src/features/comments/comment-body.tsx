import { EyeOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface CommentBodyProps {
  body: string;
  isSpoiler: boolean;
}

/**
 * The note itself — the one thing in a row that is meant to be read, so it is the
 * brightest and largest text in it.
 *
 * A spoiler-marked note is blurred until asked for. The blur is not security, it
 * is consent: someone reading a boss page to find the arena does not want to be
 * told the ending in the process. `select-none` + `pointer-events-none` matter —
 * a blurred paragraph you can still select and copy is not hidden at all.
 */
const CommentBody = ({ body, isSpoiler }: CommentBodyProps) => {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);

  const text = (
    <p className="whitespace-pre-wrap text-pretty text-[13px] leading-relaxed text-zinc-200">
      {body}
    </p>
  );

  if (!isSpoiler || revealed) return text;

  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      className="group relative block w-full cursor-pointer text-left"
      aria-label={t("comments.spoilerReveal")}
    >
      <div className="pointer-events-none select-none blur-[5px]" aria-hidden="true">
        {text}
      </div>
      <span className="absolute inset-0 flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-300 transition-colors group-hover:text-white">
        <EyeOff size={12} aria-hidden="true" />
        {t("comments.spoilerHidden")}
      </span>
    </button>
  );
};

export default CommentBody;
