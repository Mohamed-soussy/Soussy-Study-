/**
 * MD5 (RFC 1321), used only to name a school's rooms without putting the school's name in
 * the channel name. It matches Postgres md5() in migration 0007. Not for security.
 */
export function md5(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  const bitLen = bytes.length * 8;
  words[bitLen >> 5] |= 0x80 << bitLen % 32;
  words[(((bitLen + 64) >>> 9) << 4) + 14] = bitLen;
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
  let [a, b, c, d] = [0x67452301, 0xefcdab89 | 0, 0x98badcfe | 0, 0x10325476];
  for (let i = 0; i < words.length; i += 16) {
    const [aa, bb, cc, dd] = [a, b, c, d];
    for (let j = 0; j < 64; j++) {
      let f: number;
      let g: number;
      if (j < 16) [f, g] = [(b & c) | (~b & d), j];
      else if (j < 32) [f, g] = [(d & b) | (~d & c), (5 * j + 1) % 16];
      else if (j < 48) [f, g] = [b ^ c ^ d, (3 * j + 5) % 16];
      else [f, g] = [c ^ (b | ~d), (7 * j) % 16];
      const s = S[(j >> 4) * 4 + (j % 4)];
      const x = (a + f + K[j] + (words[i + g] | 0)) | 0;
      [a, d, c] = [d, c, b];
      b = (b + ((x << s) | (x >>> (32 - s)))) | 0;
    }
    [a, b, c, d] = [(a + aa) | 0, (b + bb) | 0, (c + cc) | 0, (d + dd) | 0];
  }
  return [a, b, c, d].map((n) => Array.from({ length: 4 }, (_, i) => ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, "0")).join("")).join("");
}
