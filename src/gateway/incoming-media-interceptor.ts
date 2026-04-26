import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { resolveUserPath } from "../utils.js";
import { formatForLog } from "../infra/errors.js";

export async function interceptIncomingMedia(params: {
  channel: string;
  senderId: string;
  attachments: Array<{ label?: string; data?: string }>;
  logGateway: { warn: (msg: string) => void; debug: (msg: string) => void };
}) {
  if (!params.attachments || params.attachments.length === 0) {
    return;
  }

  const effectiveChannel = params.channel || "unknown";
  const senderId = params.senderId || "unknown";
  const sanitizedSenderId = senderId.replace(/[^a-zA-Z0-9_+-]/g, "_");
  const baseDir = resolveUserPath(`~/incoming-media/${effectiveChannel}/${sanitizedSenderId}`);

  // Ensure the base directory exists before processing attachments
  try {
    await fsPromises.mkdir(baseDir, { recursive: true });
  } catch (err) {
    params.logGateway.warn(`Failed to create directory for incoming media for ${senderId}: ${formatForLog(err)}`);
    return; // Cannot proceed if dir creation fails
  }

  for (const att of params.attachments) {
    if (!att || !att.data) continue;

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      let fileName = `media-${timestamp}-${crypto.randomUUID()}`;
      if (att.label) {
        const baseName = path.basename(att.label);
        if (baseName && baseName !== "." && baseName !== "/") {
          fileName = `${timestamp}-${baseName}`;
        }
      }

      const destPath = path.join(baseDir, fileName);
      const buf = Buffer.from(att.data, "base64");
      await fsPromises.writeFile(destPath, buf);
      params.logGateway.debug(`Saved incoming media to ${destPath}`);
    } catch (err) {
      params.logGateway.warn(`Failed to save incoming media for ${senderId}: ${formatForLog(err)}`);
    }
  }
}
