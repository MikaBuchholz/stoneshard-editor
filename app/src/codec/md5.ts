/** MD5 of a byte array, returned as a lowercase hex string. Browsers have no native MD5, and the game signs saves with it. */
export function md5Hex(input: Uint8Array): string {
  const paddedLength = (((input.length + 8) >>> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = input.length * 8;
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;
  const words = new Uint32Array(16);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index++) {
      words[index] = view.getUint32(offset + index * 4, true);
    }
    const startA = a;
    const startB = b;
    const startC = c;
    const startD = d;

    for (let round = 0; round < 64; round++) {
      let mix: number;
      let wordIndex: number;
      if (round < 16) {
        mix = (b & c) | (~b & d);
        wordIndex = round;
      } else if (round < 32) {
        mix = (d & b) | (~d & c);
        wordIndex = (5 * round + 1) % 16;
      } else if (round < 48) {
        mix = b ^ c ^ d;
        wordIndex = (3 * round + 5) % 16;
      } else {
        mix = c ^ (b | ~d);
        wordIndex = (7 * round) % 16;
      }
      const sum = (a + mix + SINE_TABLE[round] + words[wordIndex]) >>> 0;
      const rotated = (sum << SHIFTS[round]) | (sum >>> (32 - SHIFTS[round]));
      a = d;
      d = c;
      c = b;
      b = (b + rotated) >>> 0;
    }

    a = (a + startA) >>> 0;
    b = (b + startB) >>> 0;
    c = (c + startC) >>> 0;
    d = (d + startD) >>> 0;
  }

  return [a, b, c, d].map(wordToLittleEndianHex).join("");
}

function wordToLittleEndianHex(word: number): string {
  let hex = "";
  for (let byte = 0; byte < 4; byte++) {
    hex += ((word >>> (byte * 8)) & 0xff).toString(16).padStart(2, "0");
  }
  return hex;
}

const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const SINE_TABLE = Array.from({ length: 64 }, (_, index) =>
  Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0,
);
