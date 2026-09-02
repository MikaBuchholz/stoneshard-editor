import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { md5Hex } from "./md5";
import { checksumFor, decodeSave, encodeSave, saltFor, verifyChecksum } from "./save";

const realSave = new Uint8Array(readFileSync(new URL("../../../test/character_1/save_2/data.sav", import.meta.url)));

describe("md5Hex", () => {
  it("matches known digests", () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    expect(md5Hex(encode(""))).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5Hex(encode("abc"))).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(md5Hex(encode("The quick brown fox jumps over the lazy dog"))).toBe("9e107d9d372bb6826bd81d3542a419d6");
    expect(md5Hex(encode("a".repeat(1000)))).toBe("cabe45dcc9ae5b66ba86600cca6b8ba8");
  });
});

describe("save codec", () => {
  it("decodes a real save and verifies its checksum with the right folder names", async () => {
    const decoded = await decodeSave(realSave);
    expect(decoded.document).toHaveProperty("characterDataMap");
    expect(decoded.storedChecksum).toBe("4f3d6d3b1823d5392dd83c153505c218");
    expect(verifyChecksum(decoded, saltFor("character_3", "save_2"))).toBe(true);
    expect(verifyChecksum(decoded, saltFor("character_1", "save_2"))).toBe(false);
  });

  it("round-trips through encode and decode with a fresh checksum", async () => {
    const decoded = await decodeSave(realSave);
    const character = decoded.document.characterDataMap as Record<string, unknown>;
    character.STR = 25;
    const salt = saltFor("character_3", "save_2");
    const encoded = await encodeSave(decoded.document, salt);
    const again = await decodeSave(encoded);
    expect((again.document.characterDataMap as Record<string, unknown>).STR).toBe(25);
    expect(again.storedChecksum).toBe(checksumFor(again.jsonText, salt));
    expect(verifyChecksum(again, salt)).toBe(true);
  });
});
