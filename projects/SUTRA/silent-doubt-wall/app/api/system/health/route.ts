/**
 * GET /api/system/health
 * Safe public health check (no secrets, no infra details).
 *
 * GET /api/system/diagnostics?secret=<SUTRA_SCHEDULER_SECRET>
 * Authorized developer diagnostics — requires scheduler secret.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSystemDiagnostics, getSchedulerSecret } from "@/lib/env";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const requestedSecret = url.searchParams.get("secret");
  const schedulerSecret = getSchedulerSecret();

  // Public health endpoint
  if (!requestedSecret) {
    return NextResponse.json({ ok: true, status: "healthy" });
  }

  // Authorized diagnostics
  if (!schedulerSecret || requestedSecret !== schedulerSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const diagnostics = getSystemDiagnostics();
  return NextResponse.json({ ok: true, data: diagnostics });
}
