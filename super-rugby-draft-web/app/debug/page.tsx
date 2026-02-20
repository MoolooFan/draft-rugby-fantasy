"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function DebugPage() {
  const [effectRan, setEffectRan] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    setEffectRan(true);

    (async () => {
      try {
        const { data, error } = await supabase.from("leagues").select("id").limit(1);
        setResult({ ok: true, data, error });
        // still log too
        console.log("SUPABASE TEST", { data, error });
      } catch (e: any) {
        setResult({ ok: false, message: e?.message ?? String(e) });
        console.log("SUPABASE TEST FAILED", e);
      }
    })();
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <h1>Debug</h1>

      <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <div>
          <b>Effect ran:</b> {effectRan ? "YES ✅" : "NO ❌"}
        </div>
        <div style={{ marginTop: 10 }}>
          <b>Supabase result:</b>
          <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
            {result ? JSON.stringify(result, null, 2) : "Waiting..."}
          </pre>
        </div>
      </div>
    </div>
  );
}