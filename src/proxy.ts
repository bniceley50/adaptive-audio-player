import { NextRequest, NextResponse } from "next/server";

import {
  getLocalSessionBoundaryConfig,
  verifyLocalSessionRequest,
} from "@/lib/backend/local-session";

const privateResponseHeaders = {
  "cache-control": "no-store",
};

export function proxy(request: NextRequest) {
  const config = getLocalSessionBoundaryConfig();
  if (config === null) {
    return NextResponse.next();
  }

  const result = verifyLocalSessionRequest(request, config);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Local application access denied." },
      {
        status: result.status,
        headers: privateResponseHeaders,
      },
    );
  }

  return NextResponse.next();
}
