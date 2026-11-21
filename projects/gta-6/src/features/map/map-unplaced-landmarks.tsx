import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { contentUrl } from "../../lib/content-url";
import MapLandmarkDetails from "./map-landmark-details";
import { matchesLandmarkFilters, useLandmarkFilters } from "./map-landmark-filters";
import type { LandmarkRecord } from "./map-landmark-types";
export default function MapUnplacedLandmarks() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<LandmarkRecord[]>([]);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const filters = useLandmarkFilters();
  useEffect(() => {
    const abort = new AbortController();
    void fetch(contentUrl("data/gta6/unplaced-landmarks.json"), { signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json() as { records: LandmarkRecord[] };
      setRecords(data.records);
    }).catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => abort.abort();
  }, []);
  const visible = records.filter(record => matchesLandmarkFilters(record.landmark, filters)
    && [record.name, record.landmark.inGameAddress, record.landmark.realWorldAddress, ...record.landmark.tags].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="mt-3 border-t border-white/10 pt-3">
    <button type="button" className="flex w-full cursor-pointer items-center justify-between text-left text-xs text-zinc-300" aria-expanded={open}
      onClick={() => setOpen(value => !value)}><span>{t("map.landmarks.unplaced")}</span><span>{records.length}</span></button>
    {open && <div className="mt-3">
      <p className="text-xs leading-relaxed text-muted">{t("map.landmarks.unplacedHint")}</p>
      <input value={query} onChange={event => setQuery(event.target.value)} aria-label={t("map.landmarks.searchUnplaced")}
        placeholder={t("map.landmarks.searchUnplaced")} className="my-2 w-full rounded border border-white/15 bg-transparent px-2 py-2 text-xs outline-none focus:border-white/50" />
      {error && <p className="text-xs text-muted">{t("map.landmarks.catalogError")}</p>}
      {!error && visible.length === 0 && <p className="py-2 text-xs text-muted">{t("map.landmarks.noMatches")}</p>}
      {visible.map(record => <div key={record.id} className="border-b border-white/10 py-2">
        <button type="button" onClick={() => setSelected(selected === record.id ? null : record.id)} aria-expanded={selected === record.id}
          className="w-full cursor-pointer text-left text-xs leading-relaxed text-zinc-200 hover:text-white">{record.name}</button>
        {selected === record.id && <MapLandmarkDetails key={record.id} landmark={record.landmark} name={record.name} />}
      </div>)}
    </div>}
  </section>;
}
