import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  MAX_FILE_BYTES,
  MAX_FILES_PER_TRANSFER,
  TRANSFER_BUCKET,
  checkFiles,
  generateTransferCode,
  isValidTransferCode,
  safeStorageName,
} from "./transfer-rules";

const fileSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().min(0).max(MAX_FILE_BYTES),
  type: z.string().max(255).optional(),
});

// Creates a transfer with a unique 6-digit code and returns one signed upload slot per file.
export const createTransfer = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ files: z.array(fileSchema).min(1).max(MAX_FILES_PER_TRANSFER) }).parse(data),
  )
  .handler(async ({ data }) => {
    const problem = checkFiles(data.files);
    if (problem) throw new Error(problem);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let transfer: { id: string; code: string } | null = null;
    for (let attempt = 0; attempt < 8 && !transfer; attempt++) {
      const { data: row, error } = await supabaseAdmin
        .from("transfers")
        .insert({ code: generateTransferCode() })
        .select("id, code")
        .single();
      if (row) transfer = row;
      else if (error && error.code !== "23505") throw new Error("Could not create a transfer code.");
    }
    if (!transfer) throw new Error("Could not create a transfer code. Please try again.");

    const rows = data.files.map((file, index) => ({
      transfer_id: transfer.id,
      name: file.name,
      size: file.size,
      mime_type: file.type || "application/octet-stream",
      storage_path: `${transfer.id}/${index}-${safeStorageName(file.name)}`,
    }));

    const { error: filesError } = await supabaseAdmin.from("transfer_files").insert(rows);
    if (filesError) throw new Error("Could not save the file list.");

    const uploads = await Promise.all(
      rows.map(async (row) => {
        const { data: slot, error } = await supabaseAdmin.storage
          .from(TRANSFER_BUCKET)
          .createSignedUploadUrl(row.storage_path);
        if (error || !slot) throw new Error("Could not prepare the upload.");
        return { path: slot.path, token: slot.token };
      }),
    );

    return { code: transfer.code, uploads };
  });

// Looks up a transfer by its exact code and returns short-lived download links.
export const getTransfer = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ code: z.string() }).parse(data))
  .handler(async ({ data }) => {
    if (!isValidTransferCode(data.code)) return { found: false as const, files: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: transfer } = await supabaseAdmin
      .from("transfers")
      .select("id, created_at, transfer_files(id, name, size, mime_type, storage_path, created_at)")
      .eq("code", data.code)
      .maybeSingle();

    if (!transfer) return { found: false as const, files: [] };

    const files = await Promise.all(
      [...transfer.transfer_files]
        .sort((a, b) => a.storage_path.localeCompare(b.storage_path, undefined, { numeric: true }))
        .map(async (file) => {
          const { data: signed } = await supabaseAdmin.storage
            .from(TRANSFER_BUCKET)
            .createSignedUrl(file.storage_path, 60 * 60, { download: file.name });
          // Return only the path so the browser joins it with its own backend address.
          const downloadPath = signed?.signedUrl
            ? new URL(signed.signedUrl).pathname + new URL(signed.signedUrl).search
            : null;
          return { id: file.id, name: file.name, size: file.size, downloadPath };
        }),
    );

    return { found: true as const, createdAt: transfer.created_at, files };
  });
