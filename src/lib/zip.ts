/**
 * Minimal ZIP writer (STORE method — no compression), zero dependencies.
 *
 * Evidence packs must be byte-exact: the SHA-256 of the sealed document that a
 * court or counterparty re-computes from the ZIP has to equal the digest in the
 * signed manifest. Deflate round-trips are byte-exact too in theory, but STORE
 * removes an entire codec from the trust boundary, makes the writer trivial to
 * audit, and PDFs (the bulk of a pack) barely deflate anyway.
 *
 * Layout follows PKWARE APPNOTE: per-file local header + name + data, then a
 * central directory, then the EOCD record. Names are ASCII; the UTF-8 flag
 * (bit 11) is set regardless so non-ASCII names can never be misread.
 */

import { Buffer } from "node:buffer";

/** CRC-32 (IEEE 802.3), table-driven. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date/time pair for a JS Date (the ZIP timestamp format, 2s resolution). */
function dosDateTime(d: Date): { time: number; date: number } {
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date =
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export interface ZipEntry {
  path: string;
  data: Buffer;
}

/** Build a ZIP archive from entries. Paths use forward slashes; no directories. */
export function zipStore(entries: ZipEntry[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const { time, date } = dosDateTime(new Date());

  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const crc = crc32(entry.data);

    // Local file header (30 bytes) + name + data
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0); // signature
    lfh.writeUInt16LE(20, 4); // version needed (2.0)
    lfh.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
    lfh.writeUInt16LE(0, 8); // method: STORE
    lfh.writeUInt16LE(time, 10);
    lfh.writeUInt16LE(date, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(entry.data.length, 18); // compressed size
    lfh.writeUInt32LE(entry.data.length, 22); // uncompressed size
    lfh.writeUInt16LE(name.length, 26);
    lfh.writeUInt16LE(0, 28); // extra field length
    local.push(lfh, name, entry.data);

    // Central directory record (46 bytes) + name
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0); // signature
    cdh.writeUInt16LE(20, 4); // version made by
    cdh.writeUInt16LE(20, 6); // version needed
    cdh.writeUInt16LE(0x0800, 8); // flags: UTF-8 names
    cdh.writeUInt16LE(0, 10); // method: STORE
    cdh.writeUInt16LE(time, 12);
    cdh.writeUInt16LE(date, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(entry.data.length, 20);
    cdh.writeUInt32LE(entry.data.length, 24);
    cdh.writeUInt16LE(name.length, 28);
    cdh.writeUInt16LE(0, 30); // extra length
    cdh.writeUInt16LE(0, 32); // comment length
    cdh.writeUInt16LE(0, 34); // disk number start
    cdh.writeUInt16LE(0, 36); // internal attributes
    cdh.writeUInt32LE(0, 38); // external attributes
    cdh.writeUInt32LE(offset, 42); // offset of local header
    central.push(cdh, name);

    offset += 30 + name.length + entry.data.length;
  }

  const centralBuf = Buffer.concat(central);

  // End of central directory (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // this disk
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...local, centralBuf, eocd]);
}
