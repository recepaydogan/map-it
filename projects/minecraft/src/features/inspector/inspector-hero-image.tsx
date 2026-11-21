const InspectorHeroImage = ({ src, alt }: { src?: string; alt: string }) => src ? <div className="aspect-video overflow-hidden rounded-[var(--radius-md)] border border-border bg-white/[0.03]">
  <img src={src} alt={alt} loading="eager" decoding="async" draggable={false} className="h-full w-full object-contain" />
</div> : null;

export default InspectorHeroImage;
