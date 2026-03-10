import { NextResponse } from "next/server";

function normalizeOrigin(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function deriveExpectedOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) {
    return null;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol =
    forwardedProto ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");

  return `${protocol}://${host}`;
}

export function verifySameOriginMutation(request: Request) {
  const expectedOrigin = deriveExpectedOrigin(request);
  if (!expectedOrigin) {
    return NextResponse.json(
      { error: "Unable to verify request origin." },
      { status: 403 },
    );
  }

  const requestOrigin =
    normalizeOrigin(request.headers.get("origin")) ??
    normalizeOrigin(request.headers.get("referer"));

  if (!requestOrigin || requestOrigin !== expectedOrigin) {
    return NextResponse.json(
      { error: "Cross-site requests are not allowed." },
      { status: 403 },
    );
  }

  return null;
}
