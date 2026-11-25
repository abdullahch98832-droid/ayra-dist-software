import { crc32, deflateRawSync } from "node:zlib";

/** A ZIP archive, the container of an Excel workbook. */
export function zip(files: readonly { name: string; content: string }[]): Uint8Array {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.content, "utf8");
    const packed = deflateRawSync(data, { level: 9 });
    const sum = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // names are UTF-8
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0x21, 12); // 1 January 1980: the file does not depend on when it was made
    header.writeUInt32LE(sum, 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    parts.push(header, name, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    header.copy(entry, 6, 4, 30);
    entry.writeUInt32LE(offset, 42);
    directory.push(entry, name);
    offset += header.length + name.length + packed.length;
  }
  const size = directory.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, ...directory, end]));
}
