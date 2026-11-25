import { Link, useLocation } from "react-router-dom";
import { Glitch } from "../components/Glitch";

export function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <div className="lost">
      <Glitch as="h1" text="404" hot />
      <div className="eyebrow">Signal lost</div>
      <p className="muted" style={{ margin: 0 }}>
        Nothing is broadcasting on <code>{pathname}</code>.
      </p>
      <div>
        <Link to="/" className="btn">Back to triage</Link>
      </div>
    </div>
  );
}
