// Shared limits and helpers for transfers (safe for both browser and server).
export const MAX_FILES_PER_TRANSFER = 20;
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per file
export const TRANSFER_BUCKET = "transfers";

export function isValidTransferCode(code: string) {
  return /^\d{6}$/.test(code);
}

export function generateTransferCode(random: () => number = secureRandom) {
  return Array.from({ length: 6 }, () => Math.floor(random() * 10)).join("");
}

function secureRandom() {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] ?? 0) / 2 ** 32;
}

export type TransferFileInput = { name: string; size: number; type?: string | undefined };

/** Returns an error message, or null when the files can be sent. */
export function checkFiles(files: TransferFileInput[]): string | null {
  if (files.length === 0) return "Add at least one file.";
  if (files.length > MAX_FILES_PER_TRANSFER) return `You can send up to ${MAX_FILES_PER_TRANSFER} files at once.`;
  const tooBig = files.find((file) => file.size > MAX_FILE_BYTES);
  if (tooBig) return `"${tooBig.name}" is larger than 50 MB.`;
  return null;
}

export function safeStorageName(name: string) {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (cleaned || "file").slice(-100);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
