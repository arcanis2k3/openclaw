import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { resolveUserPath } from "../utils.js";
import { formatForLog } from "../infra/errors.js";

async function ensureUserDirectory(channel: string, senderId: string, logGateway: any) {
  const effectiveChannel = channel || "unknown";
  const safeSenderId = (senderId || "unknown").replace(/[^a-zA-Z0-9_+-]/g, "_");
  const baseDir = resolveUserPath(`~/incoming-media/${effectiveChannel}/${safeSenderId}`);

  try {
    await fsPromises.mkdir(baseDir, { recursive: true });
    return baseDir;
  } catch (err) {
    logGateway.warn(`Failed to create directory for incoming media for ${senderId}: ${formatForLog(err)}`);
    return null;
  }
}

export async function interceptIncomingMedia(params: {
  channel: string;
  senderId: string;
  messageText?: string;
  attachments: Array<{ label?: string; data?: string }>;
  logGateway: { warn: (msg: string) => void; debug: (msg: string) => void };
}) {
  const baseDir = await ensureUserDirectory(params.channel, params.senderId, params.logGateway);
  if (!baseDir) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  // Log inbound message text
  if (params.messageText && params.messageText.trim().length > 0) {
    try {
      const logFile = path.join(baseDir, "chat.log");
      const logLine = `[${timestamp}] [INBOUND]: ${params.messageText.trim()}\n`;
      await fsPromises.appendFile(logFile, logLine);
    } catch (err) {
      params.logGateway.warn(`Failed to write to chat log for ${params.senderId}: ${formatForLog(err)}`);
    }
  }

  if (!params.attachments || params.attachments.length === 0) {
    return;
  }

  for (const att of params.attachments) {
    if (!att || !att.data) continue;

    try {
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

      // Also log the media attachment in the chat log
      const logFile = path.join(baseDir, "chat.log");
      const logLine = `[${timestamp}] [INBOUND MEDIA]: saved as ${fileName}\n`;
      await fsPromises.appendFile(logFile, logLine);

      params.logGateway.debug(`Saved incoming media to ${destPath}`);
    } catch (err) {
      params.logGateway.warn(`Failed to save incoming media for ${params.senderId}: ${formatForLog(err)}`);
    }
  }
}

export async function interceptOutboundMessage(params: {
  channel: string;
  recipientId: string;
  messageText: string;
  logGateway?: { warn: (msg: string) => void; debug: (msg: string) => void };
}) {
  const dummyLog = {
    warn: params.logGateway?.warn ?? (() => {}),
    debug: params.logGateway?.debug ?? (() => {}),
  };

  const baseDir = await ensureUserDirectory(params.channel, params.recipientId, dummyLog);
  if (!baseDir) return;

  if (params.messageText && params.messageText.trim().length > 0) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const logFile = path.join(baseDir, "chat.log");
      const logLine = `[${timestamp}] [OUTBOUND]: ${params.messageText.trim()}\n`;
      await fsPromises.appendFile(logFile, logLine);
    } catch (err) {
      dummyLog.warn(`Failed to write outbound chat log for ${params.recipientId}: ${formatForLog(err)}`);
    }
  }
}
