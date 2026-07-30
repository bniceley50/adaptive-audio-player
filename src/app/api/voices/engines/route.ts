import { NextResponse } from "next/server";

import { getNarrationEngineStatus } from "@/lib/backend/tts-engine-capabilities";

export async function GET() {
  const status = await getNarrationEngineStatus();
  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
