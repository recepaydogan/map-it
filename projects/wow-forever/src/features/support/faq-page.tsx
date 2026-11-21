import { useTranslation } from "react-i18next";

export default function FaqPage() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="faq-title" className="h-full overflow-y-auto px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <h1 id="faq-title" className="mb-6 text-2xl font-bold text-white">{t("faq.title")}</h1>
        <article className="rounded-lg border border-border bg-background p-6">
          <h2 className="text-lg font-semibold text-white">{t("faq.trackingQuestion")}</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-6 text-sm leading-relaxed text-zinc-200 marker:text-zinc-400">
            <li>{t("faq.checkVersion", { version: "5.0.0" })}</li>
            <li>{t("faq.startTracker", { command: "/start-tracker" })}</li>
            <li>{t("faq.reloadTwice", { command: "/reload" })}</li>
          </ol>
        </article>
      </div>
    </section>
  );
}
