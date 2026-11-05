import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../data/db";
import { cloudList } from "../api/cloud";
import { useAuth } from "../context/AuthContext";

export default function HomeRedirect() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!ready) return;
    let active = true;
    (async () => {
      try {
        if (user) {
          const diagrams = await cloudList();
          if (active) navigate(diagrams[0] ? `/editor/diagrams/${diagrams[0].diagramId}` : "/editor", { replace: true });
        } else {
          const latest = await db.diagrams.orderBy("lastModified").last();
          if (active) navigate(latest ? `/editor/diagrams/${latest.diagramId}` : "/editor", { replace: true });
        }
      } catch {
        if (active) navigate("/editor", { replace: true });
      }
    })();
    return () => { active = false; };
  }, [ready, user, navigate]);
  return <div className="min-h-screen grid place-items-center">Opening your diagram…</div>;
}
