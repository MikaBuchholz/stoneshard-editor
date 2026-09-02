import { md5Hex } from "./md5";

/**
 * Stoneshard save codec.
 *
 * A save file is zlib(JSON + md5hex(JSON + salt) + "\0"), where the salt is built
 * from the two folder names above the file: characters_v1/<character>/<save>/data.sav.
 */

const CHECKSUM_LENGTH = 32;
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export type SaveDocument = Record<string, unknown>;

export interface DecodedSave {
  document: SaveDocument;
  /** The checksum stored in the file; compare with `saltFor(...)` to verify folder names. */
  storedChecksum: string;
  /** Exact JSON text as written by the game, kept for checksum verification. */
  jsonText: string;
}

export function saltFor(characterFolder: string, saveFolder: string): string {
  return `stOne!characters_v1!${characterFolder}!${saveFolder}!shArd`;
}

export async function decodeSave(fileBytes: Uint8Array): Promise<DecodedSave> {
  let payload: Uint8Array;
  try {
    payload = await inflate(fileBytes);
  } catch {
    throw new Error("This file is not a readable Stoneshard save (it could not be decompressed).");
  }
  let end = payload.length;
  while (end > 0 && payload[end - 1] === 0) end--;
  const body = payload.subarray(0, end);
  if (body.length <= CHECKSUM_LENGTH) throw new Error("File is too short to be a Stoneshard save.");
  const storedChecksum = textDecoder.decode(body.subarray(body.length - CHECKSUM_LENGTH));
  const jsonText = textDecoder.decode(body.subarray(0, body.length - CHECKSUM_LENGTH));
  const document = JSON.parse(jsonText) as SaveDocument;
  return { document, storedChecksum, jsonText };
}

export function checksumFor(jsonText: string, salt: string): string {
  return md5Hex(textEncoder.encode(jsonText + salt));
}

export function verifyChecksum(decoded: DecodedSave, salt: string): boolean {
  return checksumFor(decoded.jsonText, salt) === decoded.storedChecksum;
}

export async function encodeSave(document: SaveDocument, salt: string): Promise<Uint8Array> {
  const jsonText = JSON.stringify(document);
  const checksum = checksumFor(jsonText, salt);
  const body = textEncoder.encode(jsonText + checksum + "\0");
  return deflate(body);
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(bytes, new DecompressionStream("deflate"));
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pipeThrough(bytes, new CompressionStream("deflate"));
}

type ByteTransform = { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> };

async function pipeThrough(bytes: Uint8Array, transform: ByteTransform): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
