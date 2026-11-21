import { BookOpen, Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapBalthazarSecretRoomProfile } from "./types";

const MapBalthazarSecretRoomProfileSection = ({ profile }: { profile: MapBalthazarSecretRoomProfile }) => {
  const { t } = useTranslation();

  return (
    <section className="map-dialogue-checks" aria-labelledby="map-balthazar-secret-title">
      <div className="map-dialogue-section-heading">
        {profile.role === "altar" ? <Heart size={14} aria-hidden="true" /> : <BookOpen size={14} aria-hidden="true" />}
        <h4 id="map-balthazar-secret-title">{profile.title}</h4>
      </div>
      <ul className="map-dialogue-events">
        {profile.books.map((book) => (
          <li key={book.contentId} className={book.effect === "reveals-heart-altar" ? "border-emerald-300/25 bg-emerald-300/[0.045]" : undefined}>
            <div className="flex items-center justify-between gap-3">
              <strong>{book.title}</strong>
              <span className="map-dialogue-tag">{t(`map.balthazarSecretRoom.${book.effect}`)}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="map-dialogue-hint">{t("map.balthazarSecretRoom.bodyPartHint")}</p>
      <p className="map-dialogue-hint">{t("map.balthazarSecretRoom.rewardHint", { research: profile.secretResearch.title })}</p>
    </section>
  );
};

export default MapBalthazarSecretRoomProfileSection;
