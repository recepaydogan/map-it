import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readDialogSpeakers } from "./dialog-item-transfers.mjs";

/** Apply a reviewed native call-chain role only to its exact dialog and slot. */
export const readDialogSpeakerRoleReviews = (filename, root) => {
  const catalog = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.entries)) throw new Error("Unsupported speaker-role review catalog");
  const sources = new Map(), byFile = new Map(), ids = new Set();
  const source = ({ sourcePath, sha256 }) => {
    const absolute = path.resolve(root, sourcePath), relative = path.relative(root, absolute);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Review source must be inside project: ${sourcePath}`);
    if (!sources.has(absolute)) sources.set(absolute, fs.readFileSync(absolute));
    const bytes = sources.get(absolute);
    if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error(`Stale speaker-role evidence: ${sourcePath}`);
    return bytes.toString("utf8");
  };
  for (const entry of catalog.entries) {
    if (!entry.id || ids.has(entry.id) || entry.role !== "player" || !entry.rationale
      || !Number.isInteger(entry.speakerIndex) || entry.speakerIndex < 0 || !entry.evidence?.length) {
      throw new Error(`Invalid or duplicate speaker-role review: ${entry.id}`);
    }
    ids.add(entry.id);
    for (const evidence of entry.evidence) source(evidence);
    const bank = JSON.parse(source(entry.resourceBank)).save?.regions?.DialogBank?.Resource ?? [];
    const resources = bank.filter((resource) => resource.ID?.value === entry.resourceId);
    if (resources.length !== 1 || resources[0].SourceFile?.value !== entry.nativeDialogPath) {
      throw new Error(`Native resource/dialog binding differs: ${entry.id}`);
    }
    const dialog = JSON.parse(source(entry.dialogSource)).save?.regions?.dialog;
    if (dialog?.UUID?.value !== entry.dialogId) throw new Error(`Native dialog identity differs: ${entry.id}`);
    const speaker = readDialogSpeakers(dialog).find(({ index }) => index === entry.speakerIndex);
    if (!speaker || !isDeepStrictEqual(speaker.participantIds, entry.participantIds)) throw new Error(`Native speaker binding differs: ${entry.id}`);
    const absolute = path.resolve(root, entry.dialogSource.sourcePath);
    const reviews = byFile.get(absolute) ?? new Map();
    if (reviews.has(entry.speakerIndex)) throw new Error(`Duplicate speaker-role slot: ${entry.id}`);
    reviews.set(entry.speakerIndex, entry);
    byFile.set(absolute, reviews);
  }
  return { catalog, byFile };
};
