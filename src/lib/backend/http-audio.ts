import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

const maximumRangeHeaderLength = 128;

interface AudioStreamOptions {
  contentType: string;
  filePath: string;
}

interface ByteRange {
  end: number;
  start: number;
}

function parseDecimal(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseByteRange(rangeHeader: string, fileSize: number): ByteRange | null {
  if (
    fileSize === 0 ||
    rangeHeader.length > maximumRangeHeaderLength ||
    rangeHeader.includes(",")
  ) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) {
    return null;
  }

  const [, startValue, endValue] = match;
  if (!startValue) {
    const suffixLength = parseDecimal(endValue);
    if (suffixLength === null || suffixLength === 0) {
      return null;
    }

    return {
      end: fileSize - 1,
      start: Math.max(fileSize - suffixLength, 0),
    };
  }

  const start = parseDecimal(startValue);
  if (start === null || start >= fileSize) {
    return null;
  }

  if (!endValue) {
    return { end: fileSize - 1, start };
  }

  const requestedEnd = parseDecimal(endValue);
  if (requestedEnd === null || requestedEnd < start) {
    return null;
  }

  return {
    end: Math.min(requestedEnd, fileSize - 1),
    start,
  };
}

function createHeaders(contentType: string, contentLength: number) {
  return new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Length": String(contentLength),
    "Content-Type": contentType,
  });
}

function createFileBody(filePath: string, range: ByteRange) {
  const nodeStream = createReadStream(filePath, {
    end: range.end,
    start: range.start,
  });

  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

function isMissingFileError(error: unknown) {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

export async function createAudioStreamResponse(
  request: Request,
  { contentType, filePath }: AudioStreamOptions,
): Promise<Response> {
  let fileSize: number;

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      return new Response(null, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Length": "0",
        },
        status: 404,
      });
    }

    fileSize = fileStats.size;
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }

    return new Response(null, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Length": "0",
      },
      status: 404,
    });
  }

  const rangeHeader = request.headers.get("range");
  if (rangeHeader !== null) {
    const range = parseByteRange(rangeHeader, fileSize);
    if (!range) {
      const headers = createHeaders(contentType, 0);
      headers.set("Content-Range", `bytes */${fileSize}`);
      return new Response(null, { headers, status: 416 });
    }

    const headers = createHeaders(contentType, range.end - range.start + 1);
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${fileSize}`);
    return new Response(
      request.method === "HEAD" ? null : createFileBody(filePath, range),
      { headers, status: 206 },
    );
  }

  const headers = createHeaders(contentType, fileSize);
  const fullRange = { end: fileSize - 1, start: 0 };
  const body =
    request.method === "HEAD" || fileSize === 0
      ? null
      : createFileBody(filePath, fullRange);

  return new Response(body, { headers, status: 200 });
}
