import { Character, CharacterBook, CharacterBookEntry } from "../types";
import JSZip from "jszip";
import { saveImage } from "./imageService";

// ─── Helpers ────────────────────────────────────────────────────────────────

const readText = (buffer: Uint8Array, start: number, length: number): string =>
  new TextDecoder("utf-8").decode(buffer.slice(start, start + length));

const decodeBase64Utf8 = (base64: string): string => {
  const clean = base64.replace(/\s/g, "");
  try {
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    if (clean.trim().startsWith("{")) return clean;
    throw new Error("Base64 decode failed");
  }
};

const encodeBase64Utf8 = (str: string): string => {
  const bytes = new TextEncoder().encode(str);
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
};

const decompressZlib = async (data: Uint8Array): Promise<string> => {
  for (const fmt of ["deflate-raw", "deflate"] as CompressionFormat[]) {
    try {
      const ds = new DecompressionStream(fmt);
      const w = ds.writable.getWriter();
      w.write(data); w.close();
      return new TextDecoder("utf-8").decode(await new Response(ds.readable).arrayBuffer());
    } catch { /* try next */ }
  }
  // Strip 2-byte zlib header + 4-byte checksum
  if (data.length > 6) {
    try {
      const ds = new DecompressionStream("deflate-raw");
      const w = ds.writable.getWriter();
      w.write(data.slice(2, data.length - 4)); w.close();
      return new TextDecoder("utf-8").decode(await new Response(ds.readable).arrayBuffer());
    } catch { /* ignore */ }
  }
  return "";
};

// ─── Build Character from raw ST data ───────────────────────────────────────
//
// Strategy (matches HTML version):
//   - Unwrap v1/v2 spec to get the "data" object
//   - Store the ENTIRE original data object as rawData
//   - Map known fields to typed Character properties for UI editing
//   - On export: spread rawData first, then override with edited fields → no data loss

const buildCharacter = (
  rawRoot: any,       // the full parsed JSON (may have spec/data wrapper)
  file: File,
  avatarUrl: string,
  id: string,
  format: "png" | "json"
): Character => {
  // Unwrap v2 spec
  let d: Record<string, any> = rawRoot;
  if (rawRoot.spec === "chara_card_v2" && rawRoot.data) d = rawRoot.data;
  else if (!rawRoot.name && rawRoot.data?.name) d = rawRoot.data;

  // Tags
  let tags: string[] = [];
  if (Array.isArray(d.tags)) tags = d.tags.map((t: any) => String(t).trim()).filter(Boolean);
  else if (typeof d.tags === "string") tags = d.tags.split(",").map((t: string) => t.trim()).filter(Boolean);

  // Character book — add keysInput helper for editor UI
  let character_book: CharacterBook | undefined = d.character_book;
  if (character_book?.entries) {
    character_book = {
      ...character_book,
      entries: character_book.entries.map((e: CharacterBookEntry) => ({
        ...e,
        keysInput: Array.isArray(e.keys) ? e.keys.join(", ") : "",
      })),
    };
  }

  return {
    id,
    name: d.name || "Unknown",
    description: d.description || "",
    personality: d.personality || "",
    firstMessage: d.first_mes || d.firstMessage || d.intro || d.greeting || "",
    alternate_greetings: d.alternate_greetings || d.alternate_greeting || [],
    scenario: d.scenario || "",
    character_book,
    tags,
    avatarUrl,
    qrList: d.qrList || [],
    originalFilename: file.name,
    sourceUrl: d.sourceUrl || "",
    creator_notes: d.creator_notes || d.creatorcomment || "",
    mes_example: d.mes_example || "",
    system_prompt: d.system_prompt || "",
    post_history_instructions: d.post_history_instructions || "",
    creator: d.creator || "",
    character_version: d.character_version || "",
    extensions: d.extensions || {},
    // Store the complete original data object for lossless export
    rawData: d,
    importDate: Date.now(),
    extra_qr_data: d.extra_qr_data,
    importFormat: format,
  };
};

// ─── Build ST export data object ─────────────────────────────────────────────
//
// Mirrors HTML: { ...rawData, ...editedFields }
// This means ANY field from the original card (unknown extensions, custom fields)
// is preserved, and only the fields the user may have edited are overridden.

const buildExportData = (character: Character): { spec: string; spec_version: string; data: Record<string, any> } => {
  // Start from the original raw data (all original fields preserved)
  const base: Record<string, any> = character.rawData ? { ...character.rawData } : {};

  // Override with current edited values
  const editedFields: Record<string, any> = {
    name: character.name,
    description: character.description,
    personality: character.personality,
    first_mes: character.firstMessage,
    alternate_greetings: character.alternate_greetings || [],
    scenario: character.scenario || "",
    mes_example: character.mes_example || "",
    system_prompt: character.system_prompt || "",
    post_history_instructions: character.post_history_instructions || "",
    creator_notes: character.creator_notes || "",
    creator: character.creator || "",
    character_version: character.character_version || "",
    tags: character.tags || [],
    extensions: character.extensions || {},
    // Character book — strip UI-only keysInput field before export
    character_book: character.character_book
      ? {
          ...character.character_book,
          entries: (character.character_book.entries || []).map((e) => {
            const { keysInput, ...rest } = e as any;
            return rest;
          }),
        }
      : base.character_book,
  };

  // Merge: base (original) ← editedFields (user edits)
  const data = { ...base, ...editedFields };

  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data,
  };
};

// ─── PNG Parser ─────────────────────────────────────────────────────────────

export const parseCharacterCard = async (file: File): Promise<Character> => {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const dataView = new DataView(arrayBuffer);

  const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (uint8Array[i] !== PNG_SIG[i]) throw new Error("不是有效的 PNG 文件");
  }

  let offset = 8;
  let characterData: any = null;
  const fallbackChunks: string[] = [];
  const KNOWN_KEYS = new Set(["chara", "character", "tavern", "sillytavern", "ccv3"]);

  while (offset < uint8Array.length) {
    if (offset + 8 > uint8Array.length) break;
    const length = dataView.getUint32(offset);
    const type = readText(uint8Array, offset + 4, 4);
    offset += 8;
    const dataStart = offset;
    const dataEnd = offset + length;
    if (dataEnd > uint8Array.length) break;

    if (type === "tEXt") {
      let sep = -1;
      for (let i = dataStart; i < dataEnd; i++) if (uint8Array[i] === 0) { sep = i; break; }
      if (sep !== -1) {
        const kw = readText(uint8Array, dataStart, sep - dataStart).toLowerCase();
        const txt = readText(uint8Array, sep + 1, dataEnd - sep - 1);
        if (txt.trim().startsWith("{") || txt.trim().startsWith("ey")) fallbackChunks.push(txt);
        if (KNOWN_KEYS.has(kw)) {
          try { characterData = JSON.parse(decodeBase64Utf8(txt)); }
          catch { try { characterData = JSON.parse(txt); } catch { /* ignore */ } }
        }
      }
    } else if (type === "zTXt") {
      let sep = -1;
      for (let i = dataStart; i < dataEnd; i++) if (uint8Array[i] === 0) { sep = i; break; }
      if (sep !== -1) {
        const kw = readText(uint8Array, dataStart, sep - dataStart).toLowerCase();
        const compressed = uint8Array.slice(sep + 2, dataEnd);
        try {
          const txt = await decompressZlib(compressed);
          if (txt) {
            if (txt.trim().startsWith("{") || txt.trim().startsWith("ey")) fallbackChunks.push(txt);
            if (KNOWN_KEYS.has(kw)) {
              try { characterData = JSON.parse(decodeBase64Utf8(txt)); }
              catch { try { characterData = JSON.parse(txt); } catch { /* ignore */ } }
            }
          }
        } catch { /* ignore */ }
      }
    } else if (type === "iTXt") {
      let sep = -1;
      for (let i = dataStart; i < dataEnd; i++) if (uint8Array[i] === 0) { sep = i; break; }
      if (sep !== -1) {
        const kw = readText(uint8Array, dataStart, sep - dataStart).toLowerCase();
        const compFlag = uint8Array[sep + 1];
        let cur = sep + 3; let nc = 0; let textStart = -1;
        while (cur < dataEnd) { if (uint8Array[cur] === 0) { nc++; if (nc === 2) { textStart = cur + 1; break; } } cur++; }
        if (textStart !== -1 && textStart < dataEnd) {
          const raw = uint8Array.slice(textStart, dataEnd);
          let txt = "";
          try {
            txt = compFlag === 1 ? await decompressZlib(raw) : readText(uint8Array, textStart, dataEnd - textStart);
          } catch { /* ignore */ }
          if (txt) {
            if (txt.trim().startsWith("{") || txt.trim().startsWith("ey")) fallbackChunks.push(txt);
            if (KNOWN_KEYS.has(kw) || kw === "") {
              try { characterData = JSON.parse(decodeBase64Utf8(txt)); }
              catch { try { characterData = JSON.parse(txt); } catch { /* ignore */ } }
            }
          }
        }
      }
    }

    offset += length + 4; // skip CRC
  }

  // Fallback
  if (!characterData && fallbackChunks.length > 0) {
    for (const chunk of fallbackChunks) {
      try {
        const d = JSON.parse(decodeBase64Utf8(chunk));
        if (d.name || d.data?.name) { characterData = d; break; }
      } catch {
        try {
          const d = JSON.parse(chunk);
          if (d.name || d.data?.name) { characterData = d; break; }
        } catch { /* ignore */ }
      }
    }
  }

  if (!characterData) throw new Error("未在此图片中找到角色数据。请确保这是标准的 Tavern PNG 角色卡。");

  const id = crypto.randomUUID();
  const avatarUrl = URL.createObjectURL(file);
  await saveImage(id, file);

  return buildCharacter(characterData, file, avatarUrl, id, "png");
};

// ─── JSON Parser ─────────────────────────────────────────────────────────────

export const parseCharacterJson = async (file: File): Promise<Character> => {
  const text = await file.text();
  let data: any;
  try { data = JSON.parse(text); }
  catch { throw new Error("Invalid JSON file"); }

  const id = crypto.randomUUID();
  const avatarUrl = `https://picsum.photos/seed/${id}/400/400`;
  return buildCharacter(data, file, avatarUrl, id, "json");
};

// ─── QR Parser ───────────────────────────────────────────────────────────────

export const parseQrFile = async (file: File): Promise<{ list: any[]; raw: any }> => {
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    if (data && Array.isArray(data.qrList)) return { list: data.qrList, raw: data };
    if (data && Array.isArray(data.quickReplySlots)) return { list: data.quickReplySlots, raw: data };
    if (Array.isArray(data)) return { list: data, raw: { qrList: data } };
    throw new Error("无效的 QR 配置文件: 未找到 qrList/quickReplySlots 数组");
  } catch (e: any) {
    throw new Error("解析 QR 配置文件失败: " + e.message);
  }
};

export const exportQrData = (qrList: any[], extraData: any = {}) => {
  const exportData = {
    version: 2, name: "QR Export",
    disableSend: false, placeBeforeInput: false, injectInput: false,
    color: "rgba(0, 0, 0, 0)", onlyBorderColor: false,
    ...extraData,
    qrList,
  };
  downloadBlob(new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" }),
    `qr_export_${Date.now()}.json`);
};

// ─── PNG Creator ─────────────────────────────────────────────────────────────

export const createTavernPng = async (character: Character): Promise<Blob> => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = character.avatarUrl;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("无法加载图片，可能是跨域问题。请先上传一张本地图片作为头像。"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context failed");
  ctx.drawImage(img, 0, 0);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("Failed to create PNG blob");

  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  const exportRoot = buildExportData(character);
  const base64Data = encodeBase64Utf8(JSON.stringify(exportRoot));

  const keywordBytes = new TextEncoder().encode("chara");
  const textBytes = new TextEncoder().encode(base64Data);
  const chunkLength = keywordBytes.length + 1 + textBytes.length;

  const chunkBuffer = new Uint8Array(4 + 4 + chunkLength + 4);
  const view = new DataView(chunkBuffer.buffer);
  view.setUint32(0, chunkLength);
  chunkBuffer.set([116, 69, 88, 116], 4); // "tEXt"
  chunkBuffer.set(keywordBytes, 8);
  chunkBuffer[8 + keywordBytes.length] = 0;
  chunkBuffer.set(textBytes, 8 + keywordBytes.length + 1);

  const crcInput = chunkBuffer.slice(4, 4 + 4 + chunkLength);
  view.setUint32(4 + 4 + chunkLength, crc32(crcInput));

  // Find IEND and insert before it
  let iendOffset = -1;
  for (let i = 0; i < uint8Array.length - 7; i++) {
    if (uint8Array[i] === 0x49 && uint8Array[i+1] === 0x45 &&
        uint8Array[i+2] === 0x4e && uint8Array[i+3] === 0x44) {
      iendOffset = i - 4;
      break;
    }
  }
  if (iendOffset === -1) throw new Error("Invalid PNG: No IEND chunk found");

  const final = new Uint8Array(uint8Array.length + chunkBuffer.length);
  final.set(uint8Array.slice(0, iendOffset), 0);
  final.set(chunkBuffer, iendOffset);
  final.set(uint8Array.slice(iendOffset), iendOffset + chunkBuffer.length);

  return new Blob([final], { type: "image/png" });
};

// ─── Export ──────────────────────────────────────────────────────────────────

export const exportCharacterData = async (
  character: Character,
  format: "json" | "png",
  forceZip = false
) => {
  const base = character.originalFilename
    ? character.originalFilename.replace(/\.[^/.]+$/, "")
    : character.name.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, "_").toLowerCase();

  if (!forceZip) {
    if (format === "png") {
      try { downloadBlob(await createTavernPng(character), `${base}.png`); }
      catch (e: any) { alert(`导出 PNG 失败: ${e.message}`); }
    } else {
      downloadBlob(
        new Blob([JSON.stringify(buildExportData(character), null, 2)], { type: "application/json" }),
        `${base}.json`
      );
    }
    return;
  }

  // ZIP (card + QR)
  const zip = new JSZip();
  if (format === "png") {
    try { zip.file(`${base}.png`, await createTavernPng(character)); }
    catch (e) {
      console.error("PNG failed, falling back to JSON", e);
      zip.file(`${base}.json`, JSON.stringify(buildExportData(character), null, 2));
    }
  } else {
    zip.file(`${base}.json`, JSON.stringify(buildExportData(character), null, 2));
  }

  if (character.qrList && character.qrList.length > 0) {
    const qrData = { version: 2, name: `${character.name} QR`, qrList: character.qrList, ...(character.extra_qr_data || {}) };
    const qrName = character.qrFileName || `${base}_qr.json`;
    zip.file(qrName, JSON.stringify(qrData, null, 2));
  }

  downloadBlob(await zip.generateAsync({ type: "blob" }), `${base}.zip`);
};

export const exportBulkCharacters = async (characters: Character[], collections: string[] = []) => {
  const zip = new JSZip();
  const timestamp = new Date().toISOString().slice(0, 10);

  for (const char of characters) {
    let filename = char.originalFilename || "";
    const ext = char.importFormat === "json" ? "json" : "png";
    if (!filename) {
      const safe = char.name.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, "_").toLowerCase();
      filename = `${safe}.${ext}`;
    }
    const base = filename.replace(/\.[^/.]+$/, "");
    let fileData: Blob | string;
    let finalFilename = filename;

    if (char.importFormat === "json") {
      fileData = JSON.stringify(buildExportData(char), null, 2);
      finalFilename = `${base}.json`;
    } else {
      try {
        fileData = await createTavernPng(char);
        finalFilename = `${base}.png`;
      } catch (e) {
        console.error(`PNG failed for ${char.name}, using JSON`, e);
        fileData = JSON.stringify(buildExportData(char), null, 2);
        finalFilename = `${base}.json`;
      }
    }

    let collectionFolder = "";
    if (char.tags) {
      const found = char.tags.find((t) => collections.includes(t));
      if (found) collectionFolder = found;
    }

    const target: JSZip = collectionFolder ? (zip.folder(collectionFolder) || zip) : zip;
    const hasQr = char.qrList && char.qrList.length > 0;

    if (hasQr) {
      const charFolder = target.folder(base);
      if (charFolder) {
        charFolder.file(finalFilename, fileData);
        const qrData = { version: 2, name: `${char.name} QR`, qrList: char.qrList, ...(char.extra_qr_data || {}) };
        const qrName = char.qrFileName || `${base}_qr.json`;
        charFolder.file(qrName, JSON.stringify(qrData, null, 2));
      }
    } else {
      target.file(finalFilename, fileData);
    }
  }

  downloadBlob(await zip.generateAsync({ type: "blob" }), `tavern_export_${timestamp}.zip`);
};

// ─── Utilities ───────────────────────────────────────────────────────────────

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}

const crc32 = (buf: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
