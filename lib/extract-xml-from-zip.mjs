import { inflateRawSync } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

function findEndOfCentralDirectory(buffer) {
  const maxSearch = Math.min(buffer.length, 0xffff + 22);
  for (let i = buffer.length - 22; i >= buffer.length - maxSearch; i -= 1) {
    if (i < 0) {
      break;
    }
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      const totalEntries = buffer.readUInt16LE(i + 10);
      const centralDirectoryOffset = buffer.readUInt32LE(i + 16);
      return { totalEntries, centralDirectoryOffset };
    }
  }
  throw new Error('ZIP 중앙 디렉터리를 찾지 못했습니다.');
}

function readXmlEntryFromCentralDirectory(buffer, centralDirectoryOffset, totalEntries) {
  let offset = centralDirectoryOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_FILE_HEADER_SIGNATURE) {
      throw new Error('ZIP 중앙 디렉터리 헤더가 손상되었습니다.');
    }

    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);

    const nameStart = offset + 46;
    const fileName = buffer.toString('utf-8', nameStart, nameStart + fileNameLength);

    offset = nameStart + fileNameLength + extraFieldLength + fileCommentLength;

    if (!fileName.toLowerCase().endsWith('.xml')) {
      continue;
    }

    return { localHeaderOffset, compressedSize };
  }

  throw new Error('ZIP 아카이브에서 XML 파일을 찾지 못했습니다.');
}

function readXmlFromLocalHeader(buffer, { localHeaderOffset, compressedSize }) {
  if (buffer.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error('ZIP 로컬 파일 헤더가 손상되었습니다.');
  }

  const compressionMethod = buffer.readUInt16LE(localHeaderOffset + 8);
  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraFieldLength = buffer.readUInt16LE(localHeaderOffset + 28);

  const dataStart = localHeaderOffset + 30 + fileNameLength + extraFieldLength;
  const dataEnd = dataStart + compressedSize;
  const compressed = buffer.subarray(dataStart, dataEnd);

  if (compressionMethod === 0) {
    return compressed.toString('utf-8');
  }
  if (compressionMethod === 8) {
    return inflateRawSync(compressed).toString('utf-8');
  }

  throw new Error(`지원하지 않는 ZIP 압축 방식입니다: ${compressionMethod}`);
}

export function extractXmlFromZip(buffer) {
  const archive = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const { totalEntries, centralDirectoryOffset } = findEndOfCentralDirectory(archive);
  const entryInfo = readXmlEntryFromCentralDirectory(archive, centralDirectoryOffset, totalEntries);
  return readXmlFromLocalHeader(archive, entryInfo);
}