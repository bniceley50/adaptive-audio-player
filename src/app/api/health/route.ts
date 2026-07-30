import { NextResponse } from "next/server";

export const appHealthContract = Object.freeze({
  component: "adaptive-audio-player-app",
  protocolVersion: 1,
  ready: true,
});

export function GET() {
  return NextResponse.json(appHealthContract, {
    headers: {
      "cache-control": "no-store",
    },
  });
}
