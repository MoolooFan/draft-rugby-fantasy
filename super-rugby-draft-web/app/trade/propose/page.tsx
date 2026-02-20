import { Suspense } from "react";
import TradeProposePageInner from "./TradeProposePageInner";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100svh" }} />}>
      <TradeProposePageInner />
    </Suspense>
  );
}