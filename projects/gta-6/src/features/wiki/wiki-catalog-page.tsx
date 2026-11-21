import { LEONIDA_MAP_ARTWORK } from "../map/map-registry";
import { WEAPON_CATEGORY_ARTWORK_IDS } from "../../game-config";
import ItemCatalog, { ItemCatalogCategory } from "../../components/layout/item-catalog";
import { useEffect, useId, useRef, useState } from 'react';
import { BookOpen, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { contentUrl } from '../../lib/content-url';
import { cn } from '../../lib/cn';
import CategoryDropdown from '../../components/category-dropdown';
import { filterWikiEntries, loadWikiCatalog, type WikiEntry, type WikiKind } from './wiki-data';
import './wiki.css';

const PAGE_SIZE = 60;

const RIFLE_ICON = 'M2 8h7l2-3h9l2 2h4v1h4v2h-9l-1 5h-3l-1-5h-3l-2 4H8l2-4H8l-6 3V8Z';
const WEAPON_ICONS: Readonly<Partial<Record<string, string>>> = {
  Handguns: 'M4 4h24v4h-9v4h-6l-2 5H6l2-9H4V4Zm10 5-1 2h4V9h-3Z',
  Shotguns: 'M2 10l8-1 3-3h17v2h-8v2h-6l-1 3h-2v-3l-4 2-7 2v-4Z',
  SMG: 'M2 7h6l2-2h13v2h7v2h-9l-1 6h-3l-1-6h-3l-2 5H8l2-5H8l-6 3V7Z',
  LMG: 'M2 9h7l2-4h8v2h7v1h4v2h-8l3 6h-2l-3-6h-1v6h-6v-6h-2l-2 4H7l2-4-7 3V9Z',
  'Sniper Rifles': 'M11 3h10v2h-4v2h4v1h8V7h2v4h-2v-1h-8l1 5h-2l-2-5h-5l-2 4H8l2-4H8l-6 4V9h7l3-2h2V5h-3V3Z',
  'Tactical Rifles': 'M13 4h6v2h-2v2h5v1h8v2h-9l1 3h-4l-1-3h-4l-2 4H8l2-4H8l-6 3V9h7l3-1h3V6h-2V4Z',
  Launchers: 'M2 6h19l2-1h5v7h-5l-2-1h-6l-2 5h-3l1-5H2V6Z',
  Melee: 'M5 14l5-5 2 2 7-7 8-1-2 5-9 7 1 1-2 2-3-4-5 4H4l1-4Z',
  Throwable: 'M13 6V3h8a3 3 0 0 1 0 6h-1l2 3v3l-2 3h-8l-2-3v-3l3-6Zm6-1v2h2a1 1 0 0 0 0-2h-2Z',
};

function WeaponIcon({ category, size }: { category: string; size: number }) {
  return <svg className="catalog-weapon-icon" width={size * 1.5} height={size} viewBox="0 0 32 20" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d={WEAPON_ICONS[category] ?? RIFLE_ICON} />
  </svg>;
}

function Artwork({ entry, large = false }: { entry: WikiEntry; large?: boolean }) {
  const { t } = useTranslation();
  const [failedPath, setFailedPath] = useState<string>();
  const path = large ? entry.image : entry.thumbnail;
  const missing = !path || path === failedPath;
  const iconSize = large ? 30 : 20;
  const Placeholder = entry.kind === 'characters' ? UserRound : BookOpen;
  return <div className={cn('catalog-artwork', large && 'catalog-artwork-large', missing && 'catalog-artwork-missing')}>
    {missing ? <>
      {entry.kind === 'weapons' ? <WeaponIcon category={entry.category} size={iconSize} /> : <Placeholder size={iconSize} aria-hidden="true" />}
      {large && <span>{t('encyclopedia.imageUnavailable')}</span>}
    </>
      : <img src={contentUrl(path)} alt={large ? entry.name : ''}
          loading={large ? 'eager' : 'lazy'} decoding="async" onError={() => setFailedPath(path)} />}
  </div>;
}
function EntryDetails({ entry, records, onSelect }: { entry: WikiEntry; records: WikiEntry[]; onSelect: (entry: WikiEntry) => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'overview' | 'details'>('overview');
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const related = records.filter(r => r.id !== entry.id && r.kind === entry.kind && r.category === entry.category).slice(0, 3);
  const tabs: Array<'overview' | 'details'> = entry.facts.length ? ['overview', 'details'] : ['overview'];
  return <article className="catalog-detail" data-wiki-entry={entry.id}>
    <header className="catalog-detail-heading"><Artwork entry={entry} />
      <div className="min-w-0"><h2>{entry.name}</h2><p>{[entry.manufacturer, entry.category].filter(Boolean).join(' · ')}</p>
        {entry.newToSeries && <span className="catalog-new">{t('encyclopedia.new')}</span>}
      </div>
    </header>
    <div className="catalog-detail-tabs" role="tablist" aria-label={t('encyclopedia.sections')}>
      {tabs.map(key => <button key={key} id={`${id}-${key}`} role="tab" type="button" aria-selected={tab === key} aria-controls={`${id}-panel`}
        tabIndex={tab === key ? 0 : -1} onClick={() => { setTab(key); panel.current?.scrollTo(0, 0); }}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(tabs.indexOf(key) + 1) % tabs.length];
          setTab(next); document.getElementById(`${id}-${next}`)?.focus(); panel.current?.scrollTo(0, 0);
        }}>{t(`encyclopedia.${key}`)}</button>)}
    </div>
    <div className="catalog-detail-scroll scroll-slim" ref={panel} role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0}>
      <div className="catalog-detail-content">
        {tab === 'overview' ? <><Artwork entry={entry} large />
          <section className="catalog-description"><h3>{t('encyclopedia.overview')}</h3>
            {entry.description.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </section>
          {related.length > 0 && <section className="catalog-related"><h3>{t('encyclopedia.moreCategory', { category: entry.category })}</h3>
            {related.map(item => <button key={item.id} type="button" onClick={() => onSelect(item)}><Artwork entry={item} /><span>{item.name}</span></button>)}
          </section>}
        </> : <section className="catalog-facts"><h3>{t('encyclopedia.details')}</h3>
          <dl>{entry.facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
        </section>}
      </div>
    </div>
  </article>;
}
export default function WikiCatalogPage({ kind }: { kind: WikiKind }) {
  const { t } = useTranslation();
  const [records, setRecords] = useState<WikiEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [sort, setSort] = useState('name');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    loadWikiCatalog().then(catalog => { if (active) { setRecords(catalog.records); setError(false); } })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);
  if (!records) return <div className="catalog-page" data-catalog-kind={kind}>
    {error ? <div className="catalog-state" role="alert">
      <BookOpen size={28} aria-hidden="true" />
      <h1>{t('encyclopedia.loadError')}</h1>
      <p>{t('encyclopedia.tryAgainHint')}</p>
      <button type="button" onClick={() => { setError(false); setAttempt(value => value + 1); }}>{t('encyclopedia.retry')}</button>
    </div> : <div className="catalog-state" role="status">{t('encyclopedia.loading')}</div>}
  </div>;

  const resetList = () => { setSelectedId(null); setLimit(PAGE_SIZE); };
  const resetFilters = () => { setQuery(''); setCategory(''); setManufacturer(''); resetList(); };
  const selectCategory = (id: string) => { setCategory(id); resetList(); };
  const filtered = filterWikiEntries(records, kind, query, category, manufacturer)
    .sort((a, b) => sort === 'reverse' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
  const current = filtered.find(entry => entry.id === selectedId);
  const entries = records.filter(entry => entry.kind === kind);
  const categories = [...new Set(entries.flatMap(entry => entry.categories ?? [entry.category]))].sort();
  const manufacturers = [...new Set(entries.map(entry => entry.manufacturer).filter(Boolean))].sort();
  const open = (entry: WikiEntry) => {
    if (!filtered.some(item => item.id === entry.id)) resetFilters();
    setSelectedId(entry.id);
  };
  const label = t(`encyclopedia.kinds.${kind}`);
  const classLabel = t(`encyclopedia.classLabels.${kind}`);
  const categoryOptions = [
    { id: '', label: t(`encyclopedia.allClassLabels.${kind}`), entries },
    ...categories.map(id => ({ id, label: id, entries: entries.filter(entry => (entry.categories ?? [entry.category]).includes(id)) })),
  ];
  const secondColumn = kind === 'characters' ? t('encyclopedia.actor') : t('encyclopedia.manufacturer');

  return <div className="flex h-full min-h-0" data-catalog-kind={kind}>
    <ItemCatalog
      label={label} gameName="GTA 6" artwork={LEONIDA_MAP_ARTWORK} wordmark="/item-catalog-logo.webp"
      search={{ query, label: t('encyclopedia.search'),
        placeholder: t('encyclopedia.searchPlaceholder', { category: label.toLowerCase() }),
        clearLabel: t('encyclopedia.clearSearch'),
        onChange: (value) => { setQuery(value); resetList(); } }}
      categoryLabel={classLabel}
      landingCategories={categoryOptions.map(option => {
        const preferredId = kind === 'weapons' ? WEAPON_CATEGORY_ARTWORK_IDS[option.id] : undefined;
        const item = option.entries.find(entry => entry.id === preferredId && entry.thumbnail)
          ?? option.entries.find(entry => entry.thumbnail);
        return { id: option.id, label: option.label, onSelect: () => selectCategory(option.id),
          icon: item?.thumbnail && <img src={contentUrl(item.thumbnail)} alt="" width={54} height={54} draggable={false} /> };
      })}
      categories={categoryOptions.map(option => <div key={option.id}>
        <ItemCatalogCategory label={option.label} count={option.entries.length.toLocaleString()}
          active={category === option.id} onSelect={() => selectCategory(option.id)} />
      </div>)}
      toolbar={<>
        {manufacturers.length > 0 && <CategoryDropdown ariaLabel={t('encyclopedia.manufacturer')} value={manufacturer}
          triggerClassName="w-auto min-h-[38px]" onChange={value => { setManufacturer(value); resetList(); }}
          options={[{ key: '', label: t('encyclopedia.allManufacturers') }, ...manufacturers.map(key => ({ key, label: key }))]} />}
        <CategoryDropdown ariaLabel={t('encyclopedia.sort')} value={sort} triggerClassName="w-auto min-h-[38px]"
          onChange={value => { setSort(value); resetList(); }}
          options={[{ key: 'name', label: t('encyclopedia.sortName') }, { key: 'reverse', label: t('encyclopedia.sortReverse') }]} />
        {(category || manufacturer) && <button type="button" className="item-catalog-clear-filters" onClick={resetFilters}>
          {t('encyclopedia.reset')}
        </button>}
      </>}
      columns={[{ label: classLabel }, { label: secondColumn }]}
      rows={filtered.slice(0, limit).map(entry => ({ id: entry.id, label: entry.name, subtitle: entry.category,
        cells: [entry.category, (kind === 'characters'
          ? entry.facts.find(fact => fact.label === 'Performer / Actor')?.value : entry.manufacturer) || '—'],
        icon: <Artwork entry={entry} />,
      }))}
      filterKey={JSON.stringify([query, category, manufacturer, sort])}
      onOpen={id => { const entry = filtered.find(item => item.id === id); if (entry) open(entry); }}
      onBack={() => setSelectedId(null)}
      backLabel={t('encyclopedia.back', { category: label })}
      backToCategories={{ label: t('encyclopedia.back', { category: t('itemCatalog.categories') }), onBack: resetFilters }}
      detail={current ? <EntryDetails key={current.id} entry={current} records={records} onSelect={open} /> : undefined}
      emptyMessage={t('encyclopedia.noResults')}
      afterRows={filtered.length > limit && <button type="button" onClick={() => setLimit(value => value + PAGE_SIZE)}>
        {t('encyclopedia.showMore')}
      </button>}
    />
  </div>;
}
