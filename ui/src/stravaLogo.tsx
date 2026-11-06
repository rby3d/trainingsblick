/* „Compatible with Strava“: offizielle Logos aus dem Strava-API-Paket (1.2-Strava-API-Logos), unverändert.
   Hell: Orange/Schwarz, dunkel: Weiß; welches sichtbar ist, entscheidet das Farbschema (styles.css .strava-logo). */
import hell from "./bilder/strava_kompatibel_hell.svg";
import dunkel from "./bilder/strava_kompatibel_dunkel.svg";

export function StravaLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`strava-logo ${className}`} role="img" aria-label="Compatible with Strava">
      <img className="hell" src={hell} alt="" />
      <img className="dunkel" src={dunkel} alt="" />
    </span>
  );
}
