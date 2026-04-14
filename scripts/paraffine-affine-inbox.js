#!/usr/bin/env node

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_TEMPLATE_TITLE = "PARA Template - Edgeless";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const result = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

function loadAffineEnv() {
  const home = os.homedir();
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, ".secure", ".env"),
    path.join(home, ".pi", ".secure", ".env"),
    path.join(home, "workspace", "pi-extensions", ".secure", ".env"),
    path.join(home, ".secure", ".env"),
  ];
  const merged = {};
  for (const candidate of candidates) {
    Object.assign(merged, readEnvFile(candidate));
  }
  return {
    AFFINE_BASE_URL: process.env.AFFINE_BASE_URL || merged.AFFINE_BASE_URL || "",
    AFFINE_API_TOKEN: process.env.AFFINE_API_TOKEN || merged.AFFINE_API_TOKEN || "",
    AFFINE_WORKSPACE_ID: process.env.AFFINE_WORKSPACE_ID || merged.AFFINE_WORKSPACE_ID || "",
  };
}

class McpClient {
  constructor(env) {
    this.env = env;
    this.proc = null;
    this.buffer = "";
    this.nextId = 1;
    this.pending = new Map();
  }

  async start() {
    this.proc = spawn("npx", ["-y", "-p", "affine-mcp-server", "affine-mcp"], {
      env: { ...process.env, ...this.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout.on("data", (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        const pending = this.pending.get(msg.id);
        if (pending) {
          this.pending.delete(msg.id);
          pending.resolve(msg);
        }
      }
    });

    this.proc.stderr.on("data", () => {});
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await this.request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "paraffine-affine-inbox", version: "1.0" },
    });
  }

  request(method, params) {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timeout waiting for ${method}`));
        }
      }, 20000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  async tool(name, args) {
    const attempts = shouldRetryTool(name) ? 3 : 1;
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await this.request("tools/call", { name, arguments: args || {} });
        if (response.result?.isError) {
          const text = response.result?.content?.map((item) => item.text).join("\n") || `Tool call failed: ${name}`;
          if (attempt < attempts && isTransientToolError(text)) {
            await sleep(1000 * attempt);
            continue;
          }
          throw new Error(text);
        }
        return response.result?.structuredContent || response.result;
      } catch (error) {
        lastError = error;
        if (attempt < attempts && isTransientToolError(error?.message || String(error))) {
          await sleep(1000 * attempt);
          continue;
        }
        throw error;
      }
    }
    throw lastError || new Error(`Tool call failed: ${name}`);
  }

  async stop() {
    if (!this.proc) return;
    const proc = this.proc;
    this.proc = null;
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      proc.once("exit", finish);
      proc.once("close", finish);
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (settled) return;
        proc.kill("SIGKILL");
      }, 2000);
      setTimeout(finish, 4000);
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryTool(name) {
  return [
    "read_doc",
    "search_docs",
    "list_docs",
    "list_organize_nodes",
    "list_children",
    "list_backlinks",
    "get_doc",
    "get_doc_by_title",
  ].includes(name);
}

function isTransientToolError(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("timeout") || text.includes("socket connect");
}

function ensureAffineEnv(env) {
  if (!env.AFFINE_BASE_URL || !env.AFFINE_API_TOKEN || !env.AFFINE_WORKSPACE_ID) {
    throw new Error("Missing AFFINE_BASE_URL, AFFINE_API_TOKEN, or AFFINE_WORKSPACE_ID.");
  }
}

function asArray(value, ...keys) {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function firstResult(value, ...keys) {
  const list = asArray(value, ...keys);
  return list[0] || null;
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function nowStamp() {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

function captureTitle(args) {
  if (args.title) return args.title.trim();
  if (args["source-ref"]) return `Inbox ${slugify(args["source-ref"]) || nowStamp()}`;
  return `Inbox ${nowStamp()}`;
}

function parseJsonPayload(raw, sourceLabel = "payload") {
  try {
    return JSON.parse(String(raw || ""));
  } catch (error) {
    throw new Error(`Invalid JSON in ${sourceLabel}: ${error.message}`);
  }
}

function loadActionPayload(args) {
  if (args["payload-stdin"]) {
    return parseJsonPayload(fs.readFileSync(0, "utf8"), "stdin");
  }
  if (args["payload-file"]) {
    const payloadPath = path.resolve(String(args["payload-file"]));
    if (!fs.existsSync(payloadPath)) {
      throw new Error(`Payload file not found: ${payloadPath}`);
    }
    return parseJsonPayload(fs.readFileSync(payloadPath, "utf8"), payloadPath);
  }
  if (args.payload) {
    return parseJsonPayload(args.payload, "--payload");
  }
  throw new Error("Expected --payload or --payload-file.");
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeParaHome(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "projects" || raw === "project") return "Projects";
  if (raw === "areas" || raw === "area") return "Areas";
  if (raw === "resources" || raw === "resource") return "Resources";
  if (raw === "archives" || raw === "archive") return "Archives";
  if (raw === "quarantine") return "Quarantine";
  throw new Error(`Unknown PARA home: ${value}`);
}

function requireArray(value, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Expected non-empty array for ${field}.`);
  }
  return value;
}

function validateWritePayload(payload) {
  if (payload.mode !== "write") throw new Error("Write payload must use mode=write.");
  if (!["create", "append", "update"].includes(payload.operation)) {
    throw new Error("Write payload operation must be create, append, or update.");
  }
  if (!nonEmptyString(payload.body)) throw new Error("Write payload requires body.");
  if (!nonEmptyString(payload.audit_note)) throw new Error("Write payload requires audit_note.");
  const targetLocation = payload.target_location ? String(payload.target_location) : "Inbox";
  if (targetLocation !== "Inbox") {
    throw new Error("Write payloads may only target Inbox.");
  }
  if (payload.target_para_home) {
    throw new Error("Write payloads may not assign PARA residence.");
  }
  if (payload.operation === "create" && !nonEmptyString(payload.title)) {
    throw new Error("Write create payload requires title.");
  }
  if ((payload.operation === "append" || payload.operation === "update") && !payload.target_doc_id && !nonEmptyString(payload.title)) {
    throw new Error("Write append/update payload requires target_doc_id or title.");
  }
  return {
    mode: "write",
    operation: payload.operation,
    title: payload.title ? String(payload.title).trim() : "",
    body: String(payload.body),
    target_doc_id: payload.target_doc_id ? String(payload.target_doc_id) : "",
    target_location: "Inbox",
    summary: payload.summary ? String(payload.summary) : "",
    audit_note: String(payload.audit_note).trim(),
    source: payload.source ? String(payload.source) : "skill",
    source_ref: payload.source_ref ? String(payload.source_ref) : "paraffine-skill",
    domain_hint: payload.domain_hint ? String(payload.domain_hint) : "shared",
    kind_hint: payload.kind_hint ? String(payload.kind_hint) : "resource",
  };
}

function validateRetrievePayload(payload) {
  if (payload.mode !== "retrieve") throw new Error("Retrieve payload must use mode=retrieve.");
  if (!nonEmptyString(payload.query)) throw new Error("Retrieve payload requires query.");
  if (!nonEmptyString(payload.audit_note)) throw new Error("Retrieve payload requires audit_note.");
  return {
    mode: "retrieve",
    query: String(payload.query).trim(),
    limit: Number.parseInt(String(payload.limit || "10"), 10),
    statuses: Array.isArray(payload.statuses) ? payload.statuses.map((item) => String(item)) : null,
    audit_note: String(payload.audit_note).trim(),
  };
}

function validateCurationPayload(payload) {
  if (payload.mode !== "curate") throw new Error("Curation payload must use mode=curate.");
  if (!["place", "group", "quarantine", "archive", "discard", "refine"].includes(payload.operation)) {
    throw new Error("Curation payload operation must be place, group, quarantine, archive, discard, or refine.");
  }
  if (!nonEmptyString(payload.audit_note)) throw new Error("Curation payload requires audit_note.");
  const sourceDocIds = requireArray(payload.source_doc_ids, "source_doc_ids").map((item) => String(item));
  const targetParaHome = payload.target_para_home ? normalizeParaHome(payload.target_para_home) : "";
  if (payload.operation === "quarantine" && targetParaHome && targetParaHome !== "Quarantine") {
    throw new Error("Quarantine payloads may only target Quarantine.");
  }
  if (["place", "group", "archive", "discard", "refine"].includes(payload.operation) && !targetParaHome) {
    throw new Error("Curation payload requires target_para_home for this operation.");
  }
  return {
    mode: "curate",
    operation: payload.operation,
    source_doc_ids: sourceDocIds,
    target_para_home: targetParaHome || (payload.operation === "quarantine" ? "Quarantine" : ""),
    grouping: payload.grouping && typeof payload.grouping === "object" ? payload.grouping : {},
    audit_note: String(payload.audit_note).trim(),
  };
}

function validateActionEnvelope(payload) {
  if (Array.isArray(payload)) {
    if (payload.length === 0) throw new Error("Expected at least one action in payload array.");
    return { actions: payload };
  }
  if (payload && typeof payload === "object" && Array.isArray(payload.actions)) {
    if (payload.actions.length === 0) throw new Error("Expected at least one action in actions.");
    return {
      actions: payload.actions,
      audit_note: nonEmptyString(payload.audit_note) ? String(payload.audit_note).trim() : "",
      label: nonEmptyString(payload.label) ? String(payload.label).trim() : "",
    };
  }
  return { actions: [payload] };
}

function templateTitle(args) {
  return String(args["template-title"] || DEFAULT_TEMPLATE_TITLE).trim();
}

function metadataLine(key, value) {
  return value ? `- ${key}: ${value}` : `- ${key}:`;
}

function captureMarkdown(args) {
  const rawBody = (args.body || "").trim();
  const createdAt = nowStamp();
  const lines = [
    "# Inbox Capture",
    "",
    "## Summary",
    "",
    args.summary || rawBody || "_Pending summary._",
    "",
    "## Working Notes",
    "",
    rawBody,
    "",
    metadataLine("status", "inbox"),
    metadataLine("captured_at", createdAt),
    metadataLine("source", args.source || "unknown"),
    metadataLine("source_ref", args["source-ref"] || ""),
    metadataLine("domain_hint", args["domain-hint"] || ""),
    metadataLine("kind_hint", args["kind-hint"] || ""),
    "",
  ];
  return lines.join("\n");
}

function paraffineNoteMarkdown(args) {
  const vars = templateVariables(args);
  return [
    `# ${vars.note_heading}`,
    "",
    "## Summary",
    "",
    vars.summary || "_Pending summary._",
    "",
    "## Change Notes",
    "",
    vars.capture_updates || "_No updates yet._",
    "",
    "## Working Notes",
    "",
    vars.working_notes || args.body || "_No working notes yet._",
    "",
    "## Intake",
    "",
    metadataLine("status", vars.status || "inbox"),
    metadataLine("captured_at", vars.captured_at || ""),
    metadataLine("source", vars.source || ""),
    metadataLine("source_ref", vars.source_ref || ""),
    metadataLine("domain_hint", vars.domain_hint || ""),
    metadataLine("kind_hint", vars.kind_hint || ""),
    "",
  ].join("\n");
}

function paraffineTemplateMarkdown() {
  return [
    "# {{note_heading}}",
    "",
    "## Summary",
    "",
    "{{summary}}",
    "",
    "## Change Notes",
    "",
    "{{capture_updates}}",
    "",
    "## Working Notes",
    "",
    "{{working_notes}}",
    "",
    "## Intake",
    "",
    "- status: {{status}}",
    "- captured_at: {{captured_at}}",
    "- source: {{source}}",
    "- source_ref: {{source_ref}}",
    "- domain_hint: {{domain_hint}}",
    "- kind_hint: {{kind_hint}}",
    "",
  ].join("\n");
}

function bandForScore(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeWhitespace(input) {
  return String(input || "").replace(/\r/g, "").trim();
}

function sanitizeSectionText(input) {
  return String(input || "")
    .replace(/^#{2,3}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sectionBetween(markdown, startHeading, endHeadings) {
  const text = String(markdown || "");
  const escapedStart = startHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startRegex = new RegExp(`^#{1,3} ${escapedStart}\\s*$`, "m");
  const startMatch = text.match(startRegex);
  if (!startMatch || startMatch.index == null) return "";
  const bodyStart = startMatch.index + startMatch[0].length;
  const body = text.slice(bodyStart).replace(/^\s+/, "");
  if (!endHeadings.length) return body.trim();
  const escapedEnds = endHeadings.map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const endRegex = new RegExp(`^#{2,3} (?:${escapedEnds.join("|")})\\s*$`, "m");
  const endMatch = body.match(endRegex);
  const sectionText = endMatch && endMatch.index != null ? body.slice(0, endMatch.index) : body;
  return sanitizeSectionText(sectionText);
}

function extractMetadataLines(markdown, heading) {
  const body = sectionBetween(markdown, heading, [
    "Summary",
    "Working Notes",
    "Change Notes",
    "Capture Updates",
    "Curation",
    "Audit Trail",
    "Review State",
  ]);
  const fields = {};
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^- ([a-z_]+):\s*(.*)$/);
    if (match) fields[match[1]] = match[2];
  }
  return fields;
}

function extractCaptureUpdates(markdown) {
  const sections = [];
  const singularSections = [];
  const changeNotes = sectionBetween(markdown, "Change Notes", ["Working Notes", "Intake", "Curation", "Review State", "Audit Trail"]);
  if (changeNotes) sections.push(changeNotes);
  const plural = sectionBetween(markdown, "Capture Updates", ["Working Notes", "Intake", "Curation", "Review State", "Audit Trail"]);
  if (plural) sections.push(plural);
  const regex = /^#{2,3} (?:Capture Update|Change Note) [^\n]*\n([\s\S]*?)(?=^#{2,3} |\Z)/gm;
  let match;
  while ((match = regex.exec(String(markdown || "")))) {
    singularSections.push(match[1].trim());
  }
  return [...sections, ...singularSections].filter(Boolean).join("\n\n");
}

function extractRawCapture(markdown) {
  const sourceContext = sectionBetween(markdown, "Source Context", ["Change Notes", "Capture Updates", "Review State", "Audit Trail"]);
  if (sourceContext) return sourceContext;
  const workingNotes = sectionBetween(markdown, "Working Notes", ["Intake", "Curation", "Audit Trail", "Review State"]);
  if (workingNotes) return workingNotes;
  const summary = sectionBetween(markdown, "Summary", ["Change Notes", "Capture Updates", "Working Notes", "Intake", "Curation", "Audit Trail", "Review State"]);
  if (summary) return summary;
  return sectionBetween(markdown, "Raw Capture", ["Change Notes", "Capture Updates", "Working Notes", "Intake", "Curation", "Audit Trail", "Review State"]);
}

function extractFieldsFromMarkdown(markdown) {
  return {
    ...extractMetadataLines(markdown, "Inbox Capture"),
    ...extractMetadataLines(markdown, "Intake"),
    ...extractMetadataLines(markdown, "Curation"),
    ...extractMetadataLines(markdown, "Review State"),
  };
}

function summarizeText(rawText, maxLen = 220) {
  const compact = normalizeWhitespace(rawText).replace(/\s+/g, " ");
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, maxLen - 3).trimEnd()}...`;
}

function countKeywordHits(text, words) {
  let hits = 0;
  for (const word of words) {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const matches = text.match(regex);
    hits += matches ? matches.length : 0;
  }
  return hits;
}

function normalizeKind(input, rawText = "") {
  const value = String(input || "").toLowerCase();
  const text = String(rawText || "").toLowerCase();
  if (value.includes("project")) return "project";
  if (value.includes("area")) return "area";
  if (value.includes("resource") || value.includes("reference")) return "resource";
  if (value.includes("archive")) return "archive";
  if (/\b(ship|build|implement|feature|release|fix|milestone|launch|deliver)\b/.test(text)) return "project";
  if (/\b(maintenance|responsibility|health|ops|operations|finance|family|admin)\b/.test(text)) return "area";
  if (/\b(reference|research|notes|guide|documentation|article|reading)\b/.test(text)) return "resource";
  if (/\bobsolete|deprecated|archive|old\b/.test(text)) return "archive";
  return "resource";
}

function normalizeDomain(input, rawText = "", source = "") {
  const value = String(input || "").toLowerCase();
  const text = `${String(rawText || "").toLowerCase()} ${String(source || "").toLowerCase()}`;
  if (value.includes("software") || value.includes("engineering") || value.includes("code")) return "software";
  if (value.includes("business")) return "business";
  if (value.includes("personal")) return "personal";
  if (value.includes("shared")) return "shared";
  if (/\b(repo|code|bug|issue|deploy|build|mcp|script|agent|automation|api)\b/.test(text)) return "software";
  if (/\b(client|sales|marketing|finance|revenue|invoice|proposal|ops)\b/.test(text)) return "business";
  if (/\b(home|health|family|travel|personal|habit)\b/.test(text)) return "personal";
  return "shared";
}

function parseIsoDate(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? null : parsed;
}

function scoreFreshness(capturedAt, lastReviewedAt) {
  const base = parseIsoDate(lastReviewedAt) || parseIsoDate(capturedAt);
  if (!base) return 40;
  const ageDays = (Date.now() - base) / (1000 * 60 * 60 * 24);
  if (ageDays <= 7) return 90;
  if (ageDays <= 30) return 62;
  if (ageDays <= 90) return 35;
  return 15;
}

function scoreConfidence(rawText, source, sourceRef) {
  let score = 55;
  const text = String(rawText || "").toLowerCase();
  const sourceValue = String(source || "").toLowerCase();
  if (sourceValue.includes("manual")) score += 10;
  if (sourceValue.includes("agent") || sourceValue.includes("cli")) score += 5;
  if (sourceRef) score += 5;
  score -= countKeywordHits(text, ["maybe", "perhaps", "guess", "unclear", "unknown", "todo", "tbd", "draft", "question"]) * 6;
  score += countKeywordHits(text, ["decided", "confirmed", "verified", "done", "implemented"]) * 4;
  if (text.includes("?")) score -= 6;
  return clampScore(score);
}

function scoreComplexity(rawText, updatesText) {
  const text = normalizeWhitespace(rawText);
  const updates = normalizeWhitespace(updatesText);
  let score = 20;
  score += Math.min(45, Math.floor(text.length / 40));
  score += Math.min(20, Math.floor((text.match(/\n/g) || []).length * 2));
  score += Math.min(15, countKeywordHits(`${text} ${updates}`.toLowerCase(), [
    "refactor",
    "analysis",
    "investigate",
    "research",
    "compare",
    "design",
    "workflow",
    "architecture",
  ]) * 4);
  if (updates) score += 10;
  return clampScore(score);
}

function scoreRelevance(kind, rawText, freshness) {
  const text = String(rawText || "").toLowerCase();
  let score = 45;
  if (kind === "project") score += 25;
  if (kind === "area") score += 10;
  if (kind === "archive") score -= 25;
  score += countKeywordHits(text, ["now", "current", "active", "next", "sprint", "todo", "deliver", "urgent"]) * 5;
  if (freshness >= 70) score += 8;
  if (freshness <= 39) score -= 12;
  return clampScore(score);
}

function scoreDuplication(title, rawText, duplicateDocs) {
  let score = duplicateDocs.length > 0 ? 78 : 18;
  const text = String(rawText || "").toLowerCase();
  if (duplicateDocs.length > 1) score += 10;
  if (/\bduplicate|same as|superseded\b/.test(text)) score += 10;
  return clampScore(score);
}

function buildAuditEntry(lines) {
  return [`### ${nowStamp()}`, "", ...lines, ""].join("\n");
}

function buildCuratedMarkdown({ title, captureFields, rawText, updatesText, curationFields, auditBody }) {
  const captureSection = [
    `# ${title}`,
    "",
    "## Summary",
    "",
    curationFields.summary || summarizeText(rawText),
    "",
    "## Working Notes",
    "",
    rawText.trim(),
    "",
  ];

  if (updatesText && updatesText.trim()) {
    captureSection.push("## Change Notes", "", updatesText.trim(), "");
  }

  captureSection.push(
    "## Intake",
    "",
    metadataLine("status", captureFields.status || "inbox"),
    metadataLine("captured_at", captureFields.captured_at || ""),
    metadataLine("source", captureFields.source || ""),
    metadataLine("source_ref", captureFields.source_ref || ""),
    metadataLine("domain_hint", captureFields.domain_hint || ""),
    metadataLine("kind_hint", captureFields.kind_hint || ""),
    "",
  );

  const curationSection = [
    "## Curation",
    "",
    metadataLine("status", curationFields.status),
    metadataLine("kind", curationFields.kind),
    metadataLine("domain", curationFields.domain),
    metadataLine("summary", curationFields.summary),
    metadataLine("confidence", String(curationFields.confidence)),
    metadataLine("confidence_band", curationFields.confidence_band),
    metadataLine("complexity", String(curationFields.complexity)),
    metadataLine("complexity_band", curationFields.complexity_band),
    metadataLine("relevance", String(curationFields.relevance)),
    metadataLine("relevance_band", curationFields.relevance_band),
    metadataLine("duplication", String(curationFields.duplication)),
    metadataLine("duplication_band", curationFields.duplication_band),
    metadataLine("freshness", String(curationFields.freshness)),
    metadataLine("freshness_band", curationFields.freshness_band),
    metadataLine("review_due_at", curationFields.review_due_at),
    metadataLine("last_reviewed_at", curationFields.last_reviewed_at),
    metadataLine("retained_reason", curationFields.retained_reason || ""),
    metadataLine("discard_reason", curationFields.discard_reason || ""),
    metadataLine("canonical_ref", curationFields.canonical_ref || ""),
    metadataLine("refined_at", curationFields.refined_at || ""),
    metadataLine("archived_at", curationFields.archived_at || ""),
    metadataLine("discarded_at", curationFields.discarded_at || ""),
    "",
  ];

  const auditSection = [
    "## Audit Trail",
    "",
    auditBody.trim(),
    "",
  ];

  return [...captureSection, ...curationSection, ...auditSection].join("\n");
}

function appendMarkdown(body) {
  const createdAt = nowStamp();
  const lines = String(body || "").trim().split(/\r?\n/);
  if (!lines[0]) return "";
  const [first, ...rest] = lines;
  const formatted = [`\n- ${createdAt}: ${first.trim()}`];
  for (const line of rest) {
    if (!line.trim()) {
      formatted.push("");
      continue;
    }
    formatted.push(`  ${line}`);
  }
  formatted.push("");
  return formatted.join("\n");
}

async function searchDocByTitle(client, title) {
  const result = await client.tool("search_docs", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    query: title,
    matchMode: "exact",
    limit: 10,
  });
  const docs = asArray(result, "docs", "results");
  return docs.find((doc) => doc.title === title) || null;
}

async function ensureParaffineTemplate(client, args = {}) {
  const title = templateTitle(args);
  const existing = await searchDocByTitle(client, title);
  if (existing?.docId) {
    const existingDoc = await readDoc(client, existing.docId);
    if (!existingDoc.markdown.includes("## Intake")) {
      await client.tool("replace_doc_with_markdown", {
        workspaceId: client.env.AFFINE_WORKSPACE_ID,
        docId: existing.docId,
        markdown: paraffineTemplateMarkdown(),
      });
    }
    return {
      action: "existing",
      templateDocId: existing.docId,
      title,
      uiTemplateRegistrationRequired: true,
      note: "Turn on the Template property in AFFiNE once if you want this doc to appear in the UI template menu.",
    };
  }

  const structure = await ensureInboxSurface(client);
  const created = await client.tool("create_doc", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    title,
    content: paraffineTemplateMarkdown(),
  });
  const docId = created.docId || created.id;
  if (structure.resourcesFolderId) {
    await client.tool("add_organize_link", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      folderId: structure.resourcesFolderId,
      targetId: docId,
      type: "doc",
    });
  }
  return {
    action: "created",
    templateDocId: docId,
    title,
    uiTemplateRegistrationRequired: true,
    note: "Turn on the Template property in AFFiNE once if you want this doc to appear in the UI template menu.",
  };
}

async function getParaStructure(client) {
  const paraDoc = await searchDocByTitle(client, "PARA");
  const organize = await client.tool("list_organize_nodes", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
  });
  const nodes = asArray(organize, "nodes");
  const topFolders = nodes.filter((node) => node.type === "folder" && !node.parentId);
  const inboxFolder = topFolders.find((node) => node.data === "Inbox") || null;
  const archiveFolder = topFolders.find((node) => node.data === "Archive" || node.data === "Archives") || null;
  const inboxChildren = inboxFolder ? nodes.filter((node) => node.parentId === inboxFolder.id) : [];
  const quarantineFolder = inboxChildren.find((node) => node.type === "folder" && node.data === "Quarantine") || null;
  const folderMap = {};
  for (const node of topFolders) {
    folderMap[String(node.data || "").toLowerCase()] = node.id;
  }
  const paraChildren = paraDoc?.docId
    ? await client.tool("list_children", {
        workspaceId: client.env.AFFINE_WORKSPACE_ID,
        docId: paraDoc.docId,
      })
    : { children: [] };
  const paraChildDocs = asArray(paraChildren, "children").map((child) => ({
    docId: child.docId || child.id,
    title: child.title || "",
  }));
  const containerDocMap = {};
  for (const child of paraChildDocs) {
    containerDocMap[String(child.title || "").toLowerCase()] = child.docId;
  }
  return {
    paraDocId: paraDoc?.docId || paraDoc?.id || null,
    inboxFolderId: inboxFolder?.id || null,
    quarantineFolderId: quarantineFolder?.id || null,
    projectsFolderId: folderMap.projects || null,
    areasFolderId: folderMap.areas || null,
    resourcesFolderId: folderMap.resources || null,
    archivesFolderId: archiveFolder?.id || null,
    projectsDocId: containerDocMap.projects || null,
    areasDocId: containerDocMap.areas || null,
    resourcesDocId: containerDocMap.resources || null,
    archivesDocId: containerDocMap.archives || containerDocMap.archive || null,
    topFolders: topFolders.map((node) => ({ id: node.id, name: node.data })),
    paraChildDocs,
    archiveFolderName: archiveFolder?.data || null,
    organizeNodes: nodes,
  };
}

async function ensureChildFolder(client, parentId, folderName) {
  const current = await getParaStructure(client);
  const existing = current.organizeNodes.find(
    (node) => node.type === "folder" && node.parentId === parentId && String(node.data || "") === folderName
  );
  if (existing) return existing.id;
  const created = await client.tool("create_folder", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    parentId,
    name: folderName,
  });
  return created.folderId || created.id;
}

async function ensureInboxSurface(client) {
  const structure = await getParaStructure(client);
  if (!structure.paraDocId) {
    throw new Error("Missing writable PARA root doc in AFFiNE. Create the PARA doc first.");
  }
  if (!structure.inboxFolderId) {
    throw new Error("Missing Inbox organize folder in AFFiNE. Create the Inbox folder in the sidebar first.");
  }
  if (!structure.quarantineFolderId) {
    await ensureChildFolder(client, structure.inboxFolderId, "Quarantine");
  }
  return getParaStructure(client);
}

async function createInboxDoc(client, title, markdown, inboxFolderId) {
  const created = await client.tool("create_doc_from_markdown", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    title,
    markdown,
    strict: false,
  });
  const docId = created.docId || created.id;
  await client.tool("add_organize_link", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    folderId: inboxFolderId,
    targetId: docId,
    type: "doc",
  });
  return docId;
}

function templateVariables(args) {
  const capturedAt = args["captured-at"] || nowStamp();
  return {
    note_heading: args["note-heading"] || args.title || "PARAFFINE Note",
    summary: args.summary || args.body || "Write the short human-readable summary here.",
    capture_updates: args["capture-updates"] || "",
    working_notes: args["working-notes"] || args["raw-capture"] || args.body || "",
    status: args.status || "inbox",
    captured_at: capturedAt,
    source: args.source || "unknown",
    source_ref: args["source-ref"] || "",
    domain_hint: args["domain-hint"] || "",
    kind_hint: args["kind-hint"] || "",
  };
}

async function addDocToNamedFolder(client, structure, docId, folderName) {
  if (!folderName) return;
  const normalized = String(folderName).toLowerCase();
  const folderId =
    (normalized === "inbox" && structure.inboxFolderId) ||
    (normalized === "projects" && structure.projectsFolderId) ||
    (normalized === "areas" && structure.areasFolderId) ||
    (normalized === "resources" && structure.resourcesFolderId) ||
    ((normalized === "archive" || normalized === "archives") && structure.archivesFolderId);
  if (!folderId) {
    throw new Error(`Unknown or unavailable folder: ${folderName}`);
  }
  await client.tool("add_organize_link", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    folderId,
    targetId: docId,
    type: "doc",
  });
}

async function createNoteFromTemplate(client, args) {
  if (!args.title) throw new Error("--title is required");
  const structure = await ensureInboxSurface(client);
  const ensured = await ensureParaffineTemplate(client, args);
  const templateDocId = ensured.templateDocId;
  const variables = templateVariables(args);

  let created;
  try {
    created = await client.tool("instantiate_template_native", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      templateDocId,
      title: args.title,
      variables,
      allowFallback: true,
      preserveTags: true,
    });
  } catch (_error) {
    created = await client.tool("create_doc_from_template", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      templateDocId,
      title: args.title,
      variables,
    });
  }

  const docId = created.docId || created.id;
  if (args.folder) {
    await addDocToNamedFolder(client, structure, docId, args.folder);
  }
  const doc = await readDoc(client, docId);
  return {
    action: "instantiated",
    templateDocId,
    folder: args.folder || null,
    doc,
  };
}

async function readDoc(client, docId) {
  try {
    const result = await client.tool("read_doc", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      docId,
      includeMarkdown: true,
    });
    const markdown = result.markdown || "";
    return {
      docId,
      title: result.title || "",
      markdown,
      rawText: extractRawCapture(markdown),
      updatesText: extractCaptureUpdates(markdown),
      fields: extractFieldsFromMarkdown(markdown),
    };
  } catch (error) {
    const caller = new Error().stack
      ?.split("\n")
      .slice(2, 5)
      .map((line) => line.trim())
      .join(" | ");
    error.message = `[read_doc:${docId}] ${error.message || String(error)}${caller ? ` :: ${caller}` : ""}`;
    throw error;
  }
}

function isMissingDocError(error) {
  const message = String(error?.message || error || "");
  return message.includes("was not found in workspace");
}

async function deleteOrganizeNode(client, nodeId) {
  await client.tool("delete_organize_link", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    nodeId,
  });
}

async function docExists(client, docId) {
  try {
    const result = await client.tool("read_doc", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      docId,
      includeMarkdown: false,
    });
    if (typeof result?.exists === "boolean") return result.exists;
    return Boolean(result?.docId || result?.id || result?.title || result?.plainText || result?.markdown);
  } catch (error) {
    if (isMissingDocError(error)) return false;
    throw error;
  }
}

async function pruneMissingInboxLinks(client, structure) {
  const inboxNodes = structure.organizeNodes.filter((node) => node.type === "doc" && node.parentId === structure.inboxFolderId);
  const cleanedOrphans = [];
  for (const node of inboxNodes) {
    const docId = node.data;
    if (!docId) continue;
    const exists = await docExists(client, docId);
    if (exists) continue;
    await deleteOrganizeNode(client, node.id);
    cleanedOrphans.push({
      nodeId: node.id,
      docId,
      reason: "missing-doc",
    });
  }
  return cleanedOrphans;
}

async function listAllDocs(client, query) {
  const result = await client.tool("search_docs", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    query,
    matchMode: "substring",
    limit: 20,
  });
  return asArray(result, "docs", "results");
}

function requireCaptureFields(doc) {
  const required = ["captured_at", "source", "domain_hint", "kind_hint"];
  const missing = required.filter((key) => !normalizeWhitespace(doc.fields[key]));
  if (!normalizeWhitespace(doc.rawText)) missing.push("raw_text");
  if (missing.length) {
    throw new Error(`Missing required capture fields: ${missing.join(", ")}`);
  }
}

async function findDuplicateDocs(client, doc) {
  const candidates = await listAllDocs(client, doc.title);
  const matches = [];
  for (const candidate of candidates) {
    const candidateId = candidate.docId || candidate.id;
    if (!candidateId || candidateId === doc.docId) continue;
    if (candidate.title !== doc.title) continue;
    const full = await readDoc(client, candidateId);
    matches.push(full);
  }
  return matches;
}

async function loadPackRelations(_client, docs) {
  const relations = new Map();
  for (const doc of docs) {
    relations.set(doc.docId, {
      childDocIds: new Set(),
      parentDocIds: new Set(),
      children: [],
      parents: [],
    });
  }
  return relations;
}

function docTitleMentions(doc, otherDoc) {
  const text = normalizePackText([doc.title, doc.rawText, doc.fields.summary || ""].join(" "));
  const otherTitle = normalizePackText(otherDoc.title || "");
  if (!otherTitle) return false;
  return text.includes(otherTitle);
}

function areDocsPackRelated(leftDoc, rightDoc, relations, features) {
  const leftRelation = relations.get(leftDoc.docId);
  const rightRelation = relations.get(rightDoc.docId);
  if (leftRelation?.childDocIds.has(rightDoc.docId) || leftRelation?.parentDocIds.has(rightDoc.docId)) return true;
  if (rightRelation?.childDocIds.has(leftDoc.docId) || rightRelation?.parentDocIds.has(leftDoc.docId)) return true;

  const overlap = sharedTopicCount(features.get(leftDoc.docId), features.get(rightDoc.docId));
  if (overlap >= 2) return true;
  if (overlap >= 1 && sameCaptureBucket(leftDoc, rightDoc)) return true;
  if (sameCaptureBucket(leftDoc, rightDoc) && (docTitleMentions(leftDoc, rightDoc) || docTitleMentions(rightDoc, leftDoc))) {
    return true;
  }
  return false;
}

function buildPackGroups(docs, relations) {
  const features = new Map(docs.map((doc) => [doc.docId, topicTokensForDoc(doc)]));
  const visited = new Set();
  const groups = [];

  for (const doc of docs) {
    if (visited.has(doc.docId)) continue;
    const queue = [doc];
    const members = [];
    visited.add(doc.docId);
    while (queue.length) {
      const current = queue.shift();
      members.push(current);
      for (const candidate of docs) {
        if (visited.has(candidate.docId)) continue;
        if (!areDocsPackRelated(current, candidate, relations, features)) continue;
        visited.add(candidate.docId);
        queue.push(candidate);
      }
    }
    groups.push(members);
  }

  return groups;
}

function choosePackAnchor(group, relations) {
  const ranked = [...group]
    .map((doc) => ({
      doc,
      score: anchorScoreForDoc(doc, relations.get(doc.docId) || { childDocIds: new Set(), parentDocIds: new Set() }),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(left.doc.title || "").localeCompare(String(right.doc.title || ""));
    });
  return ranked[0]?.score > 0 ? ranked[0].doc : null;
}

function preferredPackChildren(group, relations, anchorDoc) {
  if (!anchorDoc) return new Map();
  const groupIds = new Set(group.map((item) => item.docId));
  const childAssignments = new Map();
  for (const doc of group) {
    if (doc.docId === anchorDoc.docId) continue;
    const relation = relations.get(doc.docId);
    const internalParent = [...(relation?.parentDocIds || [])].find((parentId) => groupIds.has(parentId));
    if (internalParent) {
      childAssignments.set(doc.docId, internalParent);
      continue;
    }
    if (!isExampleLikeDoc(doc)) continue;
    childAssignments.set(doc.docId, anchorDoc.docId);
  }
  return childAssignments;
}

function dominantPlacement(group) {
  const counts = new Map();
  for (const doc of group) {
    const key = doc.targetFolderId || "";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || null;
}

function titleCaseToken(token) {
  if (!token) return "";
  if (token.toLowerCase() === "para") return "PARA";
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function pickPackFolderName(group) {
  const rawGroupText = normalizePackText(group.map((doc) => [doc.title, doc.rawText, doc.fields.summary || ""].join(" ")).join(" "));
  if (rawGroupText.includes("para")) return "PARA";
  const tokenCounts = new Map();
  const featureSets = group.map((doc) => topicTokensForDoc(doc));
  for (const tokens of featureSets) {
    for (const token of tokens) {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    }
  }
  const ranked = [...tokenCounts.entries()]
    .filter(([, count]) => count >= Math.max(2, Math.ceil(group.length / 2)))
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    });
  return titleCaseToken(ranked[0]?.[0] || slugify(group[0]?.title || "pack").toUpperCase());
}

async function ensurePackFolder(client, structure, parentFolderId, folderName) {
  const current = await getParaStructure(client);
  const existing = current.organizeNodes.find(
    (node) => node.type === "folder" && node.parentId === parentFolderId && String(node.data || "") === folderName
  );
  if (existing) return existing.id;
  const created = await client.tool("create_folder", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    parentId: parentFolderId,
    name: folderName,
  });
  return created.folderId || created.id;
}

async function relinkDocToOrganizeFolder(client, docId, targetFolderId) {
  const current = await getParaStructure(client);
  const docNodes = current.organizeNodes.filter((node) => node.type === "doc" && node.data === docId);
  const targetNode = docNodes.find((node) => node.parentId === targetFolderId) || null;
  const primaryNode = targetNode || docNodes[0] || null;
  if (primaryNode && primaryNode.parentId !== targetFolderId) {
    await client.tool("move_organize_node", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      nodeId: primaryNode.id,
      parentId: targetFolderId,
    });
  }
  const staleNodes = docNodes.filter((node) => node.id !== primaryNode?.id && node.parentId !== targetFolderId);
  for (const node of staleNodes) {
    await client.tool("delete_organize_link", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      nodeId: node.id,
    });
  }
  if (!primaryNode) {
    await client.tool("add_organize_link", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      folderId: targetFolderId,
      targetId: docId,
      type: "doc",
    });
  }
}

function summarizeQuarantineReason(reason) {
  return String(reason || "").replace(/\s+/g, " ").trim();
}

function buildQuarantineMarkdown(doc, reason, relatedDocIds = []) {
  const relatedLines = relatedDocIds.length ? relatedDocIds.map((docId) => `- related_doc: ${docId}`) : ["- related_doc:"];
  return [
    `# ${doc.title}`,
    "",
    "## Quarantine",
    "",
    metadataLine("status", "quarantined"),
    metadataLine("quarantine_reason", summarizeQuarantineReason(reason)),
    "",
    "## Related Notes",
    "",
    ...relatedLines,
    "",
    "## Intake",
    "",
    metadataLine("captured_at", doc.fields.captured_at || ""),
    metadataLine("source", doc.fields.source || ""),
    metadataLine("source_ref", doc.fields.source_ref || ""),
    metadataLine("domain_hint", doc.fields.domain_hint || ""),
    metadataLine("kind_hint", doc.fields.kind_hint || ""),
    "",
    "## Working Notes",
    "",
    doc.rawText || "",
    "",
  ].join("\n");
}

async function quarantineDoc(client, structure, doc, reason, relatedDocIds = []) {
  if (!structure.quarantineFolderId) throw new Error("Missing Inbox/Quarantine folder.");
  await client.tool("replace_doc_with_markdown", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    docId: doc.docId,
    markdown: buildQuarantineMarkdown(doc, reason, relatedDocIds),
    strict: false,
  });
  await relinkDocToOrganizeFolder(client, doc.docId, structure.quarantineFolderId);
  return {
    action: "quarantined",
    docId: doc.docId,
    title: doc.title,
    reason: summarizeQuarantineReason(reason),
    relatedDocIds,
  };
}

async function applyPackPlacement(client, structure, group, relations) {
  if (!group.length) {
    return { docIds: [], rootDocIds: [], childAssignments: [] };
  }
  const distinctTargets = [...new Set(group.map((doc) => doc.targetFolderId).filter(Boolean))];
  if (distinctTargets.length > 1) {
    const reason = "Pack members resolved to multiple PARA destinations and require manual review.";
    const quarantined = [];
    for (const doc of group) {
      const relatedDocIds = group.filter((item) => item.docId !== doc.docId).map((item) => item.docId);
      quarantined.push(await quarantineDoc(client, structure, doc, reason, relatedDocIds));
    }
    return {
      action: "quarantined-pack",
      reason,
      docIds: group.map((doc) => doc.docId),
      quarantined,
    };
  }
  const anchorDoc = choosePackAnchor(group, relations);
  const childAssignments = preferredPackChildren(group, relations, anchorDoc);
  const rootDocs = group.filter((doc) => !childAssignments.has(doc.docId));
  const targetFolderId = dominantPlacement(group) || rootDocs[0]?.targetFolderId || routeFolderId(structure, "resource", "curated");
  const packFolderName = pickPackFolderName(group);
  const packFolderId = group.length > 1 ? await ensurePackFolder(client, structure, targetFolderId, packFolderName) : targetFolderId;

  for (const doc of group) {
    await relinkDocToOrganizeFolder(client, doc.docId, packFolderId);
  }

  return {
    docIds: group.map((doc) => doc.docId),
    anchorDocId: anchorDoc?.docId || null,
    rootDocIds: rootDocs.map((doc) => doc.docId),
    childAssignments: [...childAssignments.entries()].map(([docId, parentDocId]) => ({ docId, parentDocId })),
    targetFolderId,
    packFolderId,
    packFolderName,
  };
}

function pickCanonicalRef(duplicates) {
  const canonical = duplicates.find((item) => item.fields.status === "canonical");
  if (canonical) return canonical.docId;
  return "";
}

function captureFieldGaps(doc) {
  const missing = [];
  for (const key of ["captured_at", "source", "domain_hint", "kind_hint"]) {
    if (!normalizeWhitespace(doc.fields[key])) missing.push(key);
  }
  if (!normalizeWhitespace(doc.rawText)) missing.push("raw_text");
  return missing;
}

function quarantineReasonForDoc(doc, duplicateDocs) {
  const missing = captureFieldGaps(doc);
  if (missing.length) {
    return {
      reason: `Missing required capture fields: ${missing.join(", ")}`,
      relatedDocIds: [],
    };
  }
  if (duplicateDocs.length > 1 && !pickCanonicalRef(duplicateDocs)) {
    return {
      reason: "Multiple duplicate notes exist without a clear canonical target.",
      relatedDocIds: duplicateDocs.map((item) => item.docId),
    };
  }
  if (duplicateDocs.length > 0 && /contradict|conflict/i.test(String(doc.rawText || ""))) {
    return {
      reason: "Incoming note appears to conflict with existing related material.",
      relatedDocIds: duplicateDocs.map((item) => item.docId),
    };
  }
  return null;
}

function reviewDueAtForStatus(status) {
  const now = new Date();
  if (status === "canonical") now.setDate(now.getDate() + 30);
  else if (status === "archived") now.setDate(now.getDate() + 90);
  else if (status === "discarded") now.setFullYear(now.getFullYear() + 10);
  else if (status === "refined") now.setDate(now.getDate() + 7);
  else now.setDate(now.getDate() + 7);
  return now.toISOString().replace(/\.\d+Z$/, "Z");
}

function routeFolderId(structure, kind, status) {
  if (status === "archived" || status === "discarded" || kind === "archive") return structure.archivesFolderId;
  if (kind === "project") return structure.projectsFolderId;
  if (kind === "area") return structure.areasFolderId;
  return structure.resourcesFolderId;
}

function routeContainerDocId(structure, kind, status) {
  if (status === "archived" || status === "discarded" || kind === "archive") return structure.archivesDocId;
  if (kind === "project") return structure.projectsDocId;
  if (kind === "area") return structure.areasDocId;
  return structure.resourcesDocId;
}

function normalizePackText(input) {
  return String(input || "").toLowerCase();
}

const PACK_STOPWORDS = new Set([
  "about",
  "active",
  "agent",
  "archives",
  "areas",
  "capture",
  "classifies",
  "current",
  "detail",
  "details",
  "documentation",
  "example",
  "examples",
  "guide",
  "high",
  "inbox",
  "knowledge",
  "material",
  "method",
  "notes",
  "overview",
  "pattern",
  "place",
  "project",
  "projects",
  "reference",
  "resources",
  "retained",
  "review",
  "seed",
  "stage",
  "workflow",
]);

function topicTokensForDoc(doc) {
  const text = normalizePackText([
    doc.title,
    doc.fields.summary || "",
    doc.fields.source_ref || "",
    doc.rawText || "",
  ].join(" "));
  const tokens = new Set();
  for (const match of text.matchAll(/[a-z0-9]{4,}/g)) {
    const token = match[0];
    if (PACK_STOPWORDS.has(token)) continue;
    tokens.add(token);
    if (token.startsWith("para")) tokens.add("para");
  }
  return tokens;
}

function sharedTopicCount(leftTokens, rightTokens) {
  let hits = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) hits += 1;
  }
  return hits;
}

function sameCaptureBucket(leftDoc, rightDoc) {
  const leftSource = normalizePackText(leftDoc.fields.source || "");
  const rightSource = normalizePackText(rightDoc.fields.source || "");
  if (!leftSource || leftSource !== rightSource) return false;
  const leftAt = parseIsoDate(leftDoc.fields.captured_at);
  const rightAt = parseIsoDate(rightDoc.fields.captured_at);
  if (!leftAt || !rightAt) return false;
  return Math.abs(leftAt - rightAt) <= 1000 * 60 * 60 * 24 * 2;
}

function isExampleLikeDoc(doc) {
  return /\bexamples?$/i.test(String(doc.title || "").trim());
}

function anchorScoreForDoc(doc, relation) {
  let score = 0;
  const title = String(doc.title || "");
  if (/\bin detail\b/i.test(title)) score += 9;
  if (/\b(method|guide|reference|playbook|manual|library|primer)\b/i.test(title)) score += 7;
  if (/\boverview\b/i.test(title)) score += 3;
  if (relation.childDocIds.size > 0) score += 5;
  if (relation.parentDocIds.size > 0) score += 2;
  if (isExampleLikeDoc(doc)) score -= 8;
  return score;
}

async function listDocBacklinks(client, docId) {
  const result = await client.tool("list_backlinks", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    docId,
  });
  return asArray(result, "backlinks", "parents").map((item) => ({
    docId: item.docId || item.id,
    title: item.title || "",
  })).filter((item) => item.docId);
}

async function listDocChildren(client, docId) {
  const result = await client.tool("list_children", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    docId,
  });
  return asArray(result, "children").map((item) => ({
    docId: item.docId || item.id,
    title: item.title || "",
  })).filter((item) => item.docId);
}

async function getDocOrganizeLinks(client, docId) {
  const current = await getParaStructure(client);
  return current.organizeNodes.filter((node) => node.type === "doc" && node.data === docId);
}

async function clearDocFolderLinks(client, docId, keepFolderId = null) {
  const docNodes = await getDocOrganizeLinks(client, docId);
  for (const node of docNodes) {
    if (keepFolderId && node.parentId === keepFolderId) continue;
    await client.tool("delete_organize_link", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      nodeId: node.id,
    });
  }
}

async function ensureDocUnderParent(client, docId, parentDocId, options = {}) {
  const backlinks = await listDocBacklinks(client, docId);
  if (backlinks.some((item) => item.docId === parentDocId)) {
    return { action: "kept", docId, parentDocId };
  }
  if (backlinks.length > 0 && !options.forceMove) {
    return {
      action: "skipped-existing-parent",
      docId,
      parentDocId,
      existingParents: backlinks.map((item) => item.docId),
    };
  }
  const moveArgs = {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    docId,
    toParentDocId: parentDocId,
  };
  if (backlinks.length === 1) {
    moveArgs.fromParentDocId = backlinks[0].docId;
  }
  await client.tool("move_doc", moveArgs);
  return { action: "linked", docId, parentDocId };
}

async function moveDocToFolder(client, structure, docId, targetFolderId) {
  if (!targetFolderId) throw new Error("Missing target organize folder for curated note.");
  const backlinks = await listDocBacklinks(client, docId);
  const paraContainerDocIds = new Set(
    [structure.projectsDocId, structure.areasDocId, structure.resourcesDocId, structure.archivesDocId].filter(Boolean)
  );
  const hasNonContainerParent = backlinks.some((item) => item.docId && !paraContainerDocIds.has(item.docId));
  if (hasNonContainerParent) {
    await clearDocFolderLinks(client, docId);
    return { action: "child-only", docId };
  }
  const containerDocId = routeContainerDocId(structure, "resource", "curated");
  const targetContainerDocId =
    targetFolderId === structure.projectsFolderId
      ? structure.projectsDocId
      : targetFolderId === structure.areasFolderId
        ? structure.areasDocId
        : targetFolderId === structure.archivesFolderId
          ? structure.archivesDocId
          : structure.resourcesDocId || containerDocId;
  if (targetContainerDocId) {
    await ensureDocUnderParent(client, docId, targetContainerDocId, { forceMove: true });
    await clearDocFolderLinks(client, docId);
    return { action: "container-linked", docId, parentDocId: targetContainerDocId };
  }
  const docNodes = await getDocOrganizeLinks(client, docId);
  const alreadyLinked = docNodes.some((node) => node.parentId === targetFolderId);
  for (const node of docNodes) {
    if (node.parentId !== targetFolderId) {
      await client.tool("delete_organize_link", {
        workspaceId: client.env.AFFINE_WORKSPACE_ID,
        nodeId: node.id,
      });
    }
  }
  if (!alreadyLinked) {
    await client.tool("add_organize_link", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      folderId: targetFolderId,
      targetId: docId,
      type: "doc",
    });
  }
  return { action: "folder-linked", docId, folderId: targetFolderId };
}

function parseStoredScore(value, fallback = 0) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function buildDurableKnowledge(doc, curationFields) {
  const lines = [
    `- preferred_para_kind: ${curationFields.kind}`,
    `- preferred_domain: ${curationFields.domain}`,
    `- retrieval_status: ${curationFields.status}`,
  ];
  if (curationFields.canonical_ref) lines.push(`- canonical_ref: ${curationFields.canonical_ref}`);
  if (curationFields.retained_reason) lines.push(`- retained_reason: ${curationFields.retained_reason}`);
  return lines.join("\n");
}

function buildReuseGuidance(curationFields) {
  if (curationFields.status === "canonical") {
    return "Use this note as the preferred reference for future work. Link duplicate or derivative notes back here instead of keeping parallel copies.";
  }
  if (curationFields.status === "refined") {
    return "Use this note as the cleaned working draft for future retrieval. Promote it to canonical only after confirming that the summary and retained guidance remain stable.";
  }
  if (curationFields.status === "archived") {
    return "Keep this note for historical lookup only. Do not use it as the default retrieval surface unless it is explicitly reactivated.";
  }
  if (curationFields.status === "discarded") {
    return "Do not surface this note in normal retrieval. Reopen it manually only if later evidence shows the discard decision was too aggressive.";
  }
  return "Keep this note available for follow-up review and refinement if it becomes more relevant.";
}

function buildRefinedMarkdown({ title, captureFields, rawText, updatesText, curationFields, auditBody }) {
  const sections = [
    `# ${title}`,
    "",
    "## Durable Summary",
    "",
    curationFields.summary || summarizeText(rawText),
    "",
    "## Durable Knowledge",
    "",
    buildDurableKnowledge({ title }, curationFields),
    "",
    "## Reuse Guidance",
    "",
    buildReuseGuidance(curationFields),
    "",
    "## Source Context",
    "",
    rawText.trim(),
    "",
  ];

  if (updatesText && updatesText.trim()) {
    sections.push("## Change Notes", "", updatesText.trim(), "");
  }

  sections.push(
    "## Review State",
    "",
    metadataLine("status", curationFields.status),
    metadataLine("kind", curationFields.kind),
    metadataLine("domain", curationFields.domain),
    metadataLine("summary", curationFields.summary),
    metadataLine("confidence", String(curationFields.confidence)),
    metadataLine("confidence_band", curationFields.confidence_band),
    metadataLine("complexity", String(curationFields.complexity)),
    metadataLine("complexity_band", curationFields.complexity_band),
    metadataLine("relevance", String(curationFields.relevance)),
    metadataLine("relevance_band", curationFields.relevance_band),
    metadataLine("duplication", String(curationFields.duplication)),
    metadataLine("duplication_band", curationFields.duplication_band),
    metadataLine("freshness", String(curationFields.freshness)),
    metadataLine("freshness_band", curationFields.freshness_band),
    metadataLine("review_due_at", curationFields.review_due_at),
    metadataLine("last_reviewed_at", curationFields.last_reviewed_at),
    metadataLine("retained_reason", curationFields.retained_reason || ""),
    metadataLine("discard_reason", curationFields.discard_reason || ""),
    metadataLine("canonical_ref", curationFields.canonical_ref || ""),
    metadataLine("refined_at", curationFields.refined_at || ""),
    metadataLine("archived_at", curationFields.archived_at || ""),
    metadataLine("discarded_at", curationFields.discarded_at || ""),
    "",
    "## Intake",
    "",
    metadataLine("captured_at", captureFields.captured_at || ""),
    metadataLine("source", captureFields.source || ""),
    metadataLine("source_ref", captureFields.source_ref || ""),
    metadataLine("domain_hint", captureFields.domain_hint || ""),
    metadataLine("kind_hint", captureFields.kind_hint || ""),
    "",
    "## Audit Trail",
    "",
    auditBody.trim(),
    "",
  );

  return sections.join("\n");
}

function qualifyForRefinement(curationFields) {
  return curationFields.complexity >= 70 && curationFields.relevance >= 40 && curationFields.status !== "discarded";
}

function deriveRefinedStatus(curationFields) {
  if (curationFields.confidence >= 70 && curationFields.duplication < 70 && curationFields.relevance >= 50) {
    return "canonical";
  }
  return "refined";
}

function determineReviewAction(doc, curationFields) {
  if (curationFields.status === "discarded") {
    return { action: "skip", reason: "discarded notes require manual reopen" };
  }
  if (curationFields.relevance < 40 && curationFields.freshness < 40) {
    if (curationFields.confidence < 40 && curationFields.duplication >= 70) {
      return { action: "discard", reason: "low-confidence duplicate with low relevance" };
    }
    return { action: "archive", reason: "stale material retained for audit and future reference" };
  }
  if (curationFields.status === "archived" && curationFields.relevance >= 50) {
    return { action: "reactivate", reason: "archived note regained relevance" };
  }
  if ((curationFields.status === "curated" || curationFields.status === "refined") && qualifyForRefinement(curationFields)) {
    return { action: "refine", reason: "high-complexity note qualifies for durable synthesis" };
  }
  if (curationFields.status === "canonical" && curationFields.relevance < 40 && curationFields.freshness < 40) {
    return { action: "archive", reason: "canonical note is no longer active enough for default retrieval" };
  }
  return { action: "retain", reason: "note remains in its current retained state" };
}

function buildReviewFields(doc) {
  const fields = doc.fields;
  const kind = normalizeKind(fields.kind || fields.kind_hint, doc.rawText);
  const domain = normalizeDomain(fields.domain || fields.domain_hint, doc.rawText, fields.source);
  const freshness = scoreFreshness(fields.captured_at, fields.last_reviewed_at);
  return {
    status: fields.status || "curated",
    kind,
    domain,
    summary: fields.summary || summarizeText(doc.rawText),
    confidence: parseStoredScore(fields.confidence, scoreConfidence(doc.rawText, fields.source, fields.source_ref)),
    complexity: parseStoredScore(fields.complexity, scoreComplexity(doc.rawText, doc.updatesText)),
    relevance: parseStoredScore(fields.relevance, scoreRelevance(kind, doc.rawText, freshness)),
    duplication: parseStoredScore(fields.duplication, 18),
    freshness: parseStoredScore(fields.freshness, freshness),
    retained_reason: fields.retained_reason || "",
    discard_reason: fields.discard_reason || "",
    canonical_ref: fields.canonical_ref || "",
    refined_at: fields.refined_at || "",
    archived_at: fields.archived_at || "",
    discarded_at: fields.discarded_at || "",
    review_due_at: fields.review_due_at || reviewDueAtForStatus(fields.status || "curated"),
    last_reviewed_at: fields.last_reviewed_at || fields.captured_at || nowStamp(),
  };
}

function withBands(curationFields) {
  return {
    ...curationFields,
    confidence_band: bandForScore(curationFields.confidence),
    complexity_band: bandForScore(curationFields.complexity),
    relevance_band: bandForScore(curationFields.relevance),
    duplication_band: bandForScore(curationFields.duplication),
    freshness_band: bandForScore(curationFields.freshness),
  };
}

async function refineNote(client, args) {
  const structure = await ensureInboxSurface(client);
  const doc = await getNote(client, args);
  requireCaptureFields(doc);
  const current = withBands(buildReviewFields(doc));

  if (!qualifyForRefinement(current) && current.status !== "refined") {
    return {
      action: "skipped",
      reason: "note does not qualify for refinement",
      doc,
      curation: current,
    };
  }

  const reviewedAt = nowStamp();
  const nextStatus = deriveRefinedStatus(current);
  const updated = withBands({
    ...current,
    status: nextStatus,
    complexity: clampScore(Math.max(18, current.complexity - 35)),
    confidence: clampScore(Math.min(100, current.confidence + 5)),
    summary: summarizeText(`${doc.rawText} ${doc.updatesText}`),
    refined_at: reviewedAt,
    last_reviewed_at: reviewedAt,
    review_due_at: reviewDueAtForStatus(nextStatus),
    retained_reason:
      nextStatus === "canonical"
        ? "Refined into stable durable knowledge suitable for direct retrieval."
        : "Refined into a cleaner durable-knowledge draft for future reuse.",
    discard_reason: "",
  });

  const auditLines = [
    `- action: refined`,
    `- status: ${updated.status}`,
    `- kind: ${updated.kind}`,
    `- domain: ${updated.domain}`,
    `- confidence: ${updated.confidence} (${updated.confidence_band})`,
    `- complexity: ${updated.complexity} (${updated.complexity_band})`,
    `- relevance: ${updated.relevance} (${updated.relevance_band})`,
    `- duplication: ${updated.duplication} (${updated.duplication_band})`,
    `- freshness: ${updated.freshness} (${updated.freshness_band})`,
    `- retained_reason: ${updated.retained_reason}`,
    `- fallback: deterministic`,
  ];
  const priorAudit = sectionBetween(doc.markdown, "Audit Trail", []);
  const auditBody = [buildAuditEntry(auditLines), priorAudit].filter(Boolean).join("\n");
  const markdown = buildRefinedMarkdown({
    title: doc.title,
    captureFields: doc.fields,
    rawText: doc.rawText,
    updatesText: doc.updatesText,
    curationFields: updated,
    auditBody,
  });

  await client.tool("replace_doc_with_markdown", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    docId: doc.docId,
    markdown,
  });

  const targetFolderId = routeFolderId(structure, updated.kind, updated.status);
  await moveDocToFolder(client, structure, doc.docId, targetFolderId);
  return {
    action: "refined",
    deterministicFallback: true,
    targetFolderId,
    targetFolderName: structure.topFolders.find((folder) => folder.id === targetFolderId)?.name || null,
    doc: await readDoc(client, doc.docId),
  };
}

async function reviewNote(client, args) {
  const structure = await ensureInboxSurface(client);
  const doc = await getNote(client, args);
  requireCaptureFields(doc);
  const current = withBands(buildReviewFields(doc));
  const decision = determineReviewAction(doc, current);

  if (decision.action === "skip" || decision.action === "retain") {
    return {
      action: decision.action,
      reason: decision.reason,
      doc,
      curation: current,
    };
  }

  if (decision.action === "refine") {
    return refineNote(client, { ...args, "doc-id": doc.docId });
  }

  const reviewedAt = nowStamp();
  const nextStatus = decision.action === "archive" ? "archived" : decision.action === "discard" ? "discarded" : "curated";
  const updated = withBands({
    ...current,
    status: nextStatus,
    last_reviewed_at: reviewedAt,
    review_due_at: reviewDueAtForStatus(nextStatus),
    retained_reason: decision.action === "archive" || decision.action === "reactivate" ? decision.reason : "",
    discard_reason: decision.action === "discard" ? decision.reason : "",
    archived_at: decision.action === "archive" ? reviewedAt : current.archived_at,
    discarded_at: decision.action === "discard" ? reviewedAt : current.discarded_at,
  });

  const auditLines = [
    `- action: ${decision.action}`,
    `- status: ${updated.status}`,
    `- kind: ${updated.kind}`,
    `- domain: ${updated.domain}`,
    `- retained_reason: ${updated.retained_reason || ""}`,
    `- discard_reason: ${updated.discard_reason || ""}`,
    `- fallback: deterministic`,
  ];
  const priorAudit = sectionBetween(doc.markdown, "Audit Trail", []);
  const auditBody = [buildAuditEntry(auditLines), priorAudit].filter(Boolean).join("\n");
  const markdown =
    updated.status === "curated" || updated.status === "canonical" || updated.status === "refined"
      ? buildRefinedMarkdown({
          title: doc.title,
          captureFields: doc.fields,
          rawText: doc.rawText,
          updatesText: doc.updatesText,
          curationFields: updated,
          auditBody,
        })
      : buildCuratedMarkdown({
          title: doc.title,
          captureFields: {
            ...doc.fields,
            status: "inbox",
          },
          rawText: doc.rawText,
          updatesText: doc.updatesText,
          curationFields: updated,
          auditBody,
        });

  await client.tool("replace_doc_with_markdown", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    docId: doc.docId,
    markdown,
  });

  const targetFolderId = routeFolderId(structure, updated.kind, updated.status);
  await moveDocToFolder(client, structure, doc.docId, targetFolderId);
  return {
    action: decision.action,
    reason: decision.reason,
    deterministicFallback: true,
    targetFolderId,
    targetFolderName: structure.topFolders.find((folder) => folder.id === targetFolderId)?.name || null,
    doc: await readDoc(client, doc.docId),
  };
}

async function reviewQueue(client, args) {
  let docs;
  if (args.query) {
    const searchResult = await client.tool("search_docs", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      query: String(args.query),
      matchMode: "substring",
      limit: Number.parseInt(String(args.limit || "20"), 10),
    });
    docs = asArray(searchResult, "docs", "results");
  } else {
    const listResult = await client.tool("list_docs", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      first: Number.parseInt(String(args.limit || "50"), 10),
    });
    docs = asArray(listResult, "docs").length
      ? asArray(listResult, "docs")
      : asArray(listResult, "edges").map((edge) => edge.node).filter(Boolean);
  }
  const statuses = String(args.statuses || "curated,refined,canonical,archived")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const results = [];

  for (const entry of docs) {
    const docId = entry.id || entry.docId;
    if (!docId) continue;
    const doc = await readDoc(client, docId);
    if (!doc.fields.status || !statuses.includes(doc.fields.status)) continue;
    const result = await reviewNote(client, { "doc-id": docId });
    results.push({
      docId,
      title: doc.title,
      action: result.action,
      reason: result.reason || null,
      targetFolderName: result.targetFolderName || null,
    });
  }

  return {
    action: "reviewed",
    count: results.length,
    deterministicFallback: true,
    results,
  };
}

async function reviewDocIds(client, docIds, statuses) {
  const results = [];
  for (const docId of docIds) {
    const doc = await readDoc(client, docId);
    if (!doc.fields.status || !statuses.includes(doc.fields.status)) continue;
    const result = await reviewNote(client, { "doc-id": docId });
    results.push({
      docId,
      title: doc.title,
      action: result.action,
      reason: result.reason || null,
      targetFolderName: result.targetFolderName || null,
    });
  }
  return {
    action: "reviewed",
    count: results.length,
    deterministicFallback: true,
    results,
  };
}

function parseStatusList(input, fallback) {
  const raw = String(input || fallback)
    .trim()
    .toLowerCase();
  if (!raw || raw === "none" || raw === "false" || raw === "off" || raw === "skip") return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function listDocsForQuery(client, args) {
  if (args.query) {
    const searchResult = await client.tool("search_docs", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      query: String(args.query),
      matchMode: "substring",
      limit: Number.parseInt(String(args.limit || "20"), 10),
    });
    return asArray(searchResult, "docs", "results");
  }
  const listResult = await client.tool("list_docs", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    first: Number.parseInt(String(args.limit || "50"), 10),
  });
  return asArray(listResult, "docs").length
    ? asArray(listResult, "docs")
    : asArray(listResult, "edges").map((edge) => edge.node).filter(Boolean);
}

async function deleteNotes(client, args) {
  const docs = await listDocsForQuery(client, args);
  const titles = parseStatusList(args.titles, "");
  const requirePrefix = args.prefix ? String(args.prefix) : "";
  const exactQuery = args.exact ? String(args.exact) : "";
  const deleted = [];
  const skipped = [];

  const organize = await client.tool("list_organize_nodes", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
  });
  const organizeNodes = asArray(organize, "nodes");

  for (const entry of docs) {
    const docId = entry.id || entry.docId;
    const title = entry.title || "";
    if (!docId) continue;

    if (exactQuery && title !== exactQuery) {
      skipped.push({ docId, title, reason: "exact-mismatch" });
      continue;
    }
    if (requirePrefix && !title.startsWith(requirePrefix)) {
      skipped.push({ docId, title, reason: "prefix-mismatch" });
      continue;
    }
    if (titles.length && !titles.includes(title)) {
      skipped.push({ docId, title, reason: "title-filter" });
      continue;
    }

    const linkedNodes = organizeNodes.filter((node) => node.type === "doc" && node.data === docId);
    for (const node of linkedNodes) {
      await client.tool("delete_organize_link", {
        workspaceId: client.env.AFFINE_WORKSPACE_ID,
        nodeId: node.id,
      });
    }
    await client.tool("delete_doc", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      docId,
    });
    deleted.push({ docId, title, removedLinks: linkedNodes.length });
  }

  return {
    action: "deleted",
    query: args.query || null,
    prefix: requirePrefix || null,
    exact: exactQuery || null,
    deletedCount: deleted.length,
    skippedCount: skipped.length,
    deleted,
    skipped,
  };
}

async function retrieveNotes(client, args) {
  const statuses = parseStatusList(args.statuses, "curated,canonical,refined");
  const docs = await listDocsForQuery(client, args);
  const notes = [];

  for (const entry of docs) {
    const docId = entry.id || entry.docId;
    if (!docId) continue;
    let doc;
    try {
      doc = await readDoc(client, docId);
    } catch (error) {
      if (!isMissingDocError(error)) throw error;
      continue;
    }
    const fields = buildReviewFields(doc);
    if (!fields.status || !statuses.includes(fields.status)) continue;
    notes.push({
      docId,
      title: doc.title,
      status: fields.status,
      kind: fields.kind,
      domain: fields.domain,
      summary: fields.summary,
      confidence: fields.confidence,
      confidence_band: bandForScore(fields.confidence),
      relevance: fields.relevance,
      relevance_band: bandForScore(fields.relevance),
      freshness: fields.freshness,
      freshness_band: bandForScore(fields.freshness),
      retained_reason: fields.retained_reason,
      canonical_ref: fields.canonical_ref || "",
      source_ref: doc.fields.source_ref || "",
    });
  }

  notes.sort((a, b) => {
    const statusRank = { canonical: 0, curated: 1, refined: 2, archived: 3, discarded: 4 };
    const rankDiff = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
    if (rankDiff !== 0) return rankDiff;
    return b.relevance - a.relevance;
  });

  return {
    action: "retrieved",
    statuses,
    count: notes.length,
    notes,
  };
}

async function retrieveDocIds(client, docIds, statuses) {
  const notes = [];
  for (const docId of docIds) {
    let doc;
    try {
      doc = await readDoc(client, docId);
    } catch (error) {
      if (!isMissingDocError(error)) throw error;
      continue;
    }
    const fields = buildReviewFields(doc);
    if (!fields.status || !statuses.includes(fields.status)) continue;
    notes.push({
      docId,
      title: doc.title,
      status: fields.status,
      kind: fields.kind,
      domain: fields.domain,
      summary: fields.summary,
      confidence: fields.confidence,
      confidence_band: bandForScore(fields.confidence),
      relevance: fields.relevance,
      relevance_band: bandForScore(fields.relevance),
      freshness: fields.freshness,
      freshness_band: bandForScore(fields.freshness),
      retained_reason: fields.retained_reason,
      canonical_ref: fields.canonical_ref || "",
      source_ref: doc.fields.source_ref || "",
    });
  }
  notes.sort((a, b) => {
    const statusRank = { canonical: 0, curated: 1, refined: 2, archived: 3, discarded: 4 };
    const rankDiff = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
    if (rankDiff !== 0) return rankDiff;
    return b.relevance - a.relevance;
  });
  return {
    action: "retrieved",
    statuses,
    count: notes.length,
    notes,
  };
}

async function runCycle(client, args) {
  const initialStructure = await ensureInboxSurface(client);
  const cleanedOrphans = await pruneMissingInboxLinks(client, initialStructure);
  const structure = cleanedOrphans.length ? await getParaStructure(client) : initialStructure;
  const query = String(args.query || "").trim().toLowerCase();
  const limit = Number.parseInt(String(args.limit || "20"), 10);
  const inboxNodes = structure.organizeNodes.filter((node) => node.type === "doc" && node.parentId === structure.inboxFolderId);

  const curated = [];
  const quarantined = [];
  let processedInbox = 0;
  for (const node of inboxNodes) {
    if (processedInbox >= limit) break;
    const docId = node.data;
    if (!docId) continue;
    let doc;
    try {
      doc = await readDoc(client, docId);
    } catch (error) {
      if (!isMissingDocError(error)) throw error;
      await deleteOrganizeNode(client, node.id);
      cleanedOrphans.push({
        nodeId: node.id,
        docId,
        reason: "missing-doc",
      });
      continue;
    }
    if (query && !String(doc.title || "").toLowerCase().includes(query)) continue;
    const existingStatus = String(doc.fields.status || "").trim().toLowerCase();
    if (existingStatus && existingStatus !== "inbox") {
      const existing = buildReviewFields(doc);
      const targetFolderId = routeFolderId(structure, existing.kind, existing.status);
      processedInbox += 1;
      curated.push({
        docId,
        title: doc.title,
        rawText: doc.rawText,
        fields: {
          ...doc.fields,
          status: existing.status,
          kind: existing.kind,
          domain: existing.domain,
          summary: existing.summary,
          confidence: existing.confidence,
          complexity: existing.complexity,
          relevance: existing.relevance,
          duplication: existing.duplication,
          freshness: existing.freshness,
          retained_reason: existing.retained_reason,
          discard_reason: existing.discard_reason,
          canonical_ref: existing.canonical_ref,
          review_due_at: existing.review_due_at,
          last_reviewed_at: existing.last_reviewed_at,
          refined_at: existing.refined_at,
          archived_at: existing.archived_at,
          discarded_at: existing.discarded_at,
        },
        status: existing.status,
        targetFolderId: targetFolderId || null,
        targetFolderName: structure.topFolders.find((folder) => folder.id === targetFolderId)?.name || null,
      });
      continue;
    }
    const result = await curateNote(client, { "doc-id": docId, "defer-placement": true });
    processedInbox += 1;
    if (result.action === "quarantined") {
      quarantined.push(result);
      continue;
    }
    curated.push({
      docId,
      title: result.doc.title,
      rawText: result.doc.rawText,
      fields: result.doc.fields,
      status: result.doc.fields.status || "",
      targetFolderId: result.targetFolderId || null,
      targetFolderName: result.targetFolderName || null,
    });
  }

  const curatedDocs = curated.map((item) => ({
    docId: item.docId,
    title: item.title,
    rawText: item.rawText,
    fields: item.fields,
    targetFolderId: item.targetFolderId,
  }));
  const relations = await loadPackRelations(client, curatedDocs);
  const packGroups = buildPackGroups(curatedDocs, relations);
  const placements = [];
  for (const group of packGroups) {
    const placement = await applyPackPlacement(client, structure, group, relations);
    placements.push(placement);
  }

  const processedDocIds = curated.map((item) => item.docId);
  const reviewStatuses = parseStatusList(args.reviewStatuses, "");
  const retrieveStatuses = parseStatusList(args.retrieveStatuses, "");
  const reviewResult = reviewStatuses.length
    ? await reviewDocIds(client, processedDocIds, reviewStatuses)
    : { action: "reviewed", count: 0, deterministicFallback: true, results: [] };
  const retrieval = retrieveStatuses.length
    ? await retrieveDocIds(client, processedDocIds, retrieveStatuses)
    : { action: "retrieved", statuses: [], count: 0, notes: [] };

  return {
    action: "cycle-complete",
    deterministicFallback: true,
    processedInbox,
    cleanedOrphans,
    curated,
    quarantined,
    placements,
    reviewed: reviewResult.results,
    retrieval,
  };
}

function decideOutcome({ kind, scores, duplicateDocs }) {
  const result = {
    status: "curated",
    retainedReason: "Retained as curated material.",
    discardReason: "",
    canonicalRef: "",
    refinedAt: "",
    archivedAt: "",
    discardedAt: "",
  };

  const hasDuplicate = duplicateDocs.length > 0;
  if (scores.duplication >= 70 && scores.confidence < 40 && scores.relevance < 40) {
    result.status = "discarded";
    result.discardReason = "Low-confidence duplicate with low relevance.";
    result.retainedReason = "";
    result.discardedAt = nowStamp();
    result.canonicalRef = pickCanonicalRef(duplicateDocs);
    return result;
  }

  if (scores.relevance < 40 && scores.freshness < 40) {
    result.status = "archived";
    result.retainedReason = "Low-relevance material retained for audit and future reference.";
    result.archivedAt = nowStamp();
    if (hasDuplicate) result.canonicalRef = pickCanonicalRef(duplicateDocs);
    return result;
  }

  if (hasDuplicate && scores.confidence >= 40) {
    result.status = "archived";
    result.retainedReason = "Superseded by existing canonical or duplicate knowledge.";
    result.archivedAt = nowStamp();
    result.canonicalRef = pickCanonicalRef(duplicateDocs);
    return result;
  }

  if (scores.complexity >= 70 && scores.relevance >= 40) {
    result.status = "refined";
    result.retainedReason = "Requires refinement before durable reuse.";
    result.refinedAt = nowStamp();
    return result;
  }

  if (scores.confidence >= 70 && scores.complexity < 40 && scores.relevance >= 50 && scores.duplication < 70) {
    result.status = "canonical";
    result.retainedReason = "Stable, high-value knowledge suitable for direct retrieval.";
    return result;
  }

  if (kind === "archive") {
    result.status = "archived";
    result.retainedReason = "Explicit archive-class material retained outside active work.";
    result.archivedAt = nowStamp();
    return result;
  }

  return result;
}

async function curateNote(client, args) {
  const structure = await ensureInboxSurface(client);
  const doc = await getNote(client, args);
  const duplicateDocs = await findDuplicateDocs(client, doc);
  const quarantine = quarantineReasonForDoc(doc, duplicateDocs);
  if (quarantine) {
    return quarantineDoc(client, structure, doc, quarantine.reason, quarantine.relatedDocIds);
  }
  requireCaptureFields(doc);

  const kind = normalizeKind(doc.fields.kind_hint, doc.rawText);
  const domain = normalizeDomain(doc.fields.domain_hint, doc.rawText, doc.fields.source);
  const freshness = scoreFreshness(doc.fields.captured_at, doc.fields.last_reviewed_at);
  const confidence = scoreConfidence(doc.rawText, doc.fields.source, doc.fields.source_ref);
  const complexity = scoreComplexity(doc.rawText, doc.updatesText);
  const relevance = scoreRelevance(kind, doc.rawText, freshness);
  const duplication = scoreDuplication(doc.title, doc.rawText, duplicateDocs);
  const scores = { confidence, complexity, relevance, duplication, freshness };
  const outcome = decideOutcome({ kind, scores, duplicateDocs });
  const reviewedAt = nowStamp();
  const summary = summarizeText(doc.rawText);
  const curationFields = {
    status: outcome.status,
    kind,
    domain,
    summary,
    confidence,
    confidence_band: bandForScore(confidence),
    complexity,
    complexity_band: bandForScore(complexity),
    relevance,
    relevance_band: bandForScore(relevance),
    duplication,
    duplication_band: bandForScore(duplication),
    freshness,
    freshness_band: bandForScore(freshness),
    review_due_at: reviewDueAtForStatus(outcome.status),
    last_reviewed_at: reviewedAt,
    retained_reason: outcome.retainedReason,
    discard_reason: outcome.discardReason,
    canonical_ref: outcome.canonicalRef,
    refined_at: outcome.refinedAt,
    archived_at: outcome.archivedAt,
    discarded_at: outcome.discardedAt,
  };

  const auditLines = [
    `- action: curated`,
    `- status: ${curationFields.status}`,
    `- kind: ${curationFields.kind}`,
    `- domain: ${curationFields.domain}`,
    `- confidence: ${curationFields.confidence} (${curationFields.confidence_band})`,
    `- complexity: ${curationFields.complexity} (${curationFields.complexity_band})`,
    `- relevance: ${curationFields.relevance} (${curationFields.relevance_band})`,
    `- duplication: ${curationFields.duplication} (${curationFields.duplication_band})`,
    `- freshness: ${curationFields.freshness} (${curationFields.freshness_band})`,
    `- retained_reason: ${curationFields.retained_reason || ""}`,
    `- discard_reason: ${curationFields.discard_reason || ""}`,
    `- canonical_ref: ${curationFields.canonical_ref || ""}`,
  ];

  const priorAudit = sectionBetween(doc.markdown, "Audit Trail", []);
  const auditBody = [buildAuditEntry(auditLines), priorAudit].filter(Boolean).join("\n");
  const updatedMarkdown = buildCuratedMarkdown({
    title: doc.title,
    captureFields: {
      ...doc.fields,
      status: "inbox",
    },
    rawText: doc.rawText,
    updatesText: doc.updatesText,
    curationFields,
    auditBody,
  });

  await client.tool("replace_doc_with_markdown", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    docId: doc.docId,
    markdown: updatedMarkdown,
  });

  const targetFolderId = routeFolderId(structure, kind, outcome.status);
  if (!args["defer-placement"]) {
    await moveDocToFolder(client, structure, doc.docId, targetFolderId);
  }
  const updatedDoc = await readDoc(client, doc.docId);

  return {
    action: "curated",
    paraDocId: structure.paraDocId,
    targetFolderId,
    targetFolderName: structure.topFolders.find((folder) => folder.id === targetFolderId)?.name || null,
    duplicateDocIds: duplicateDocs.map((item) => item.docId),
    doc: updatedDoc,
  };
}

async function captureNote(client, args) {
  if (!args.body) throw new Error("--body is required");
  const structure = await ensureInboxSurface(client);
  const title = captureTitle(args);
  const existing = args["allow-duplicate"] ? null : await searchDocByTitle(client, title);

  if (existing?.docId) {
    await client.tool("append_markdown", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      docId: existing.docId,
      markdown: appendMarkdown(args.body),
    });
    const doc = await readDoc(client, existing.docId);
    return { action: "appended", title, ...structure, doc };
  }

  const createArgs = {
    ...args,
    title,
    folder: "Inbox",
    summary: args.summary || args.body,
    "raw-capture": args.body,
    "capture-updates": args["capture-updates"] || "",
    "working-notes": args["working-notes"] || "",
    status: "inbox",
  };

  let docId;
  if (args.lightweight || args.direct || args["skip-template"]) {
    docId = await createInboxDoc(client, title, paraffineNoteMarkdown(createArgs), structure.inboxFolderId);
    return {
      action: "created",
      title,
      ...structure,
      doc: {
        docId,
        title,
        markdown: paraffineNoteMarkdown(createArgs),
        rawText: args.body,
        updatesText: args["capture-updates"] || "",
        fields: {
          status: "inbox",
          captured_at: createArgs["captured-at"] || createArgs.captured_at || "",
          source: createArgs.source || "",
          source_ref: createArgs["source-ref"] || "",
          domain_hint: createArgs["domain-hint"] || "",
          kind_hint: createArgs["kind-hint"] || "",
        },
      },
    };
  } else {
    const created = await createNoteFromTemplate(client, createArgs);
    docId = created.doc.docId;
  }
  const doc = await readDoc(client, docId);
  return { action: "created", title, ...structure, doc };
}

async function appendToNote(client, args) {
  if (!args["doc-id"]) throw new Error("--doc-id is required");
  if (!args.body) throw new Error("--body is required");
  await client.tool("append_markdown", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    docId: args["doc-id"],
    markdown: appendMarkdown(args.body),
  });
  return readDoc(client, args["doc-id"]);
}

async function getNote(client, args) {
  if (args["doc-id"]) return readDoc(client, args["doc-id"]);
  const title = captureTitle(args);
  const existing = await searchDocByTitle(client, title);
  if (!existing?.docId) throw new Error(`No inbox note found for title: ${title}`);
  return readDoc(client, existing.docId);
}

async function resolveTargetDoc(client, payload) {
  if (payload.target_doc_id) {
    return readDoc(client, payload.target_doc_id);
  }
  const existing = await searchDocByTitle(client, payload.title);
  if (!existing?.docId) {
    throw new Error(`No note found for title: ${payload.title}`);
  }
  return readDoc(client, existing.docId);
}

function mergeCaptureUpdates(existingUpdates, newBody, auditNote) {
  const additions = [String(newBody || "").trim(), auditNote ? `\nAudit: ${auditNote}` : ""].join("").trim();
  return [String(existingUpdates || "").trim(), additions].filter(Boolean).join("\n\n");
}

async function executeWritePayload(client, payload) {
  const structure = await ensureInboxSurface(client);
  if (payload.operation === "create") {
    return captureNote(client, {
      title: payload.title,
      body: payload.body,
      source: payload.source,
      "source-ref": payload.source_ref,
      "domain-hint": payload.domain_hint,
      "kind-hint": payload.kind_hint,
      summary: payload.summary || payload.body,
      lightweight: true,
    });
  }

  const targetDoc = await resolveTargetDoc(client, payload);
  if (payload.operation === "append") {
    await client.tool("append_markdown", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      docId: targetDoc.docId,
      markdown: appendMarkdown(payload.body),
    });
    return {
      action: "appended",
      audit_note: payload.audit_note,
      doc: await readDoc(client, targetDoc.docId),
    };
  }

  const updatedMarkdown = paraffineNoteMarkdown({
    title: targetDoc.title,
    "note-heading": targetDoc.title,
    summary: payload.summary || targetDoc.fields.summary || summarizeText(`${targetDoc.rawText} ${payload.body}`),
    "capture-updates": mergeCaptureUpdates(targetDoc.updatesText, payload.body, payload.audit_note),
    "working-notes": targetDoc.rawText || payload.body,
    status: targetDoc.fields.status || "inbox",
    "captured-at": targetDoc.fields.captured_at || nowStamp(),
    source: targetDoc.fields.source || payload.source,
    "source-ref": targetDoc.fields.source_ref || payload.source_ref,
    "domain-hint": targetDoc.fields.domain_hint || payload.domain_hint,
    "kind-hint": targetDoc.fields.kind_hint || payload.kind_hint,
  });

  await client.tool("replace_doc_with_markdown", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    docId: targetDoc.docId,
    markdown: updatedMarkdown,
    strict: false,
  });

  return {
    action: "updated",
    audit_note: payload.audit_note,
    doc: await readDoc(client, targetDoc.docId),
  };
}

function paraHomeToFolderId(structure, paraHome) {
  if (paraHome === "Projects") return structure.projectsFolderId;
  if (paraHome === "Areas") return structure.areasFolderId;
  if (paraHome === "Resources") return structure.resourcesFolderId;
  if (paraHome === "Archives") return structure.archivesFolderId;
  if (paraHome === "Quarantine") return structure.quarantineFolderId;
  return null;
}

function paraHomeToKind(paraHome) {
  if (paraHome === "Projects") return "project";
  if (paraHome === "Areas") return "area";
  if (paraHome === "Archives") return "archive";
  return "resource";
}

async function replaceDocTitle(client, docId, title) {
  if (!nonEmptyString(title)) return;
  await client.tool("update_doc_title", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    docId,
    title: String(title).trim(),
  });
}

async function applyExplicitStatusUpdate(client, structure, doc, payload) {
  const reviewedAt = nowStamp();
  const current = withBands(buildReviewFields(doc));
  const targetKind = paraHomeToKind(payload.target_para_home);
  const nextStatus =
    payload.operation === "archive" ? "archived" :
    payload.operation === "discard" ? "discarded" :
    payload.operation === "refine" ? "refined" :
    current.status || "curated";
  const nextFields = withBands({
    ...current,
    kind: targetKind,
    status: nextStatus,
    summary: current.summary,
    last_reviewed_at: reviewedAt,
    review_due_at: reviewDueAtForStatus(nextStatus),
    retained_reason: payload.operation === "discard" ? "" : payload.audit_note,
    discard_reason: payload.operation === "discard" ? payload.audit_note : "",
    refined_at: payload.operation === "refine" ? reviewedAt : current.refined_at,
    archived_at: payload.operation === "archive" ? reviewedAt : current.archived_at,
    discarded_at: payload.operation === "discard" ? reviewedAt : current.discarded_at,
  });
  const auditLines = [
    `- action: ${payload.operation}`,
    `- status: ${nextFields.status}`,
    `- kind: ${nextFields.kind}`,
    `- audit_note: ${payload.audit_note}`,
  ];
  const priorAudit = sectionBetween(doc.markdown, "Audit Trail", []);
  const auditBody = [buildAuditEntry(auditLines), priorAudit].filter(Boolean).join("\n");
  const markdown =
    payload.operation === "refine"
      ? buildRefinedMarkdown({
          title: doc.title,
          captureFields: doc.fields,
          rawText: doc.rawText,
          updatesText: doc.updatesText,
          curationFields: nextFields,
          auditBody,
        })
      : buildCuratedMarkdown({
          title: doc.title,
          captureFields: {
            ...doc.fields,
            status: doc.fields.status || "inbox",
          },
          rawText: doc.rawText,
          updatesText: doc.updatesText,
          curationFields: nextFields,
          auditBody,
        });
  await client.tool("replace_doc_with_markdown", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    docId: doc.docId,
    markdown,
    strict: false,
  });
  const targetFolderId = paraHomeToFolderId(structure, payload.target_para_home);
  await moveDocToFolder(client, structure, doc.docId, targetFolderId);
  return {
    action: payload.operation,
    docId: doc.docId,
    target_para_home: payload.target_para_home,
  };
}

async function executeRetrievePayload(client, payload) {
  const docs = await listDocsForQuery(client, {
    query: payload.query,
    limit: payload.limit,
  });
  const notes = [];
  for (const entry of docs) {
    const docId = entry.id || entry.docId;
    if (!docId) continue;
    const doc = await readDoc(client, docId);
    const fields = buildReviewFields(doc);
    if (payload.statuses && payload.statuses.length && !payload.statuses.includes(fields.status)) continue;
    notes.push({
      docId,
      title: doc.title,
      status: fields.status || doc.fields.status || "",
      kind: fields.kind,
      domain: fields.domain,
      summary: fields.summary || summarizeText(doc.rawText),
      source_ref: doc.fields.source_ref || "",
    });
  }
  return {
    action: "retrieved",
    audit_note: payload.audit_note,
    count: notes.length,
    notes,
  };
}

async function executeCurationPayload(client, payload) {
  const structure = await ensureInboxSurface(client);
  const docs = [];
  for (const docId of payload.source_doc_ids) {
    docs.push(await readDoc(client, docId));
  }
  if (payload.operation === "quarantine") {
    const quarantined = [];
    for (const doc of docs) {
      const relatedDocIds = docs.filter((item) => item.docId !== doc.docId).map((item) => item.docId);
      quarantined.push(await quarantineDoc(client, structure, doc, payload.audit_note, relatedDocIds));
    }
    return {
      action: "quarantined",
      audit_note: payload.audit_note,
      quarantined,
    };
  }

  if (payload.operation === "group") {
    const targetFolderId = paraHomeToFolderId(structure, payload.target_para_home);
    const packName = nonEmptyString(payload.grouping.pack_name) ? String(payload.grouping.pack_name).trim() : "Pack";
    const packFolderId = await ensurePackFolder(client, structure, targetFolderId, packName);
    for (const doc of docs) {
      await relinkDocToOrganizeFolder(client, doc.docId, packFolderId);
    }
    return {
      action: "grouped",
      audit_note: payload.audit_note,
      pack_name: packName,
      pack_folder_id: packFolderId,
      doc_ids: docs.map((doc) => doc.docId),
    };
  }

  if (payload.operation === "place") {
    const targetFolderId = paraHomeToFolderId(structure, payload.target_para_home);
    const moved = [];
    for (const doc of docs) {
      await moveDocToFolder(client, structure, doc.docId, targetFolderId);
      moved.push({ docId: doc.docId, title: doc.title });
    }
    return {
      action: "placed",
      audit_note: payload.audit_note,
      target_para_home: payload.target_para_home,
      moved,
    };
  }

  const updated = [];
  for (const doc of docs) {
    updated.push(await applyExplicitStatusUpdate(client, structure, doc, payload));
  }
  return {
    action: payload.operation,
    audit_note: payload.audit_note,
    updated,
  };
}

async function executeAction(client, payload) {
  const envelope = validateActionEnvelope(payload);
  const results = [];
  for (const item of envelope.actions) {
    if (!item || typeof item !== "object") throw new Error("Expected JSON object action payload.");
    if (item.mode === "write") {
      results.push(await executeWritePayload(client, validateWritePayload(item)));
      continue;
    }
    if (item.mode === "retrieve") {
      results.push(await executeRetrievePayload(client, validateRetrievePayload(item)));
      continue;
    }
    if (item.mode === "curate") {
      results.push(await executeCurationPayload(client, validateCurationPayload(item)));
      continue;
    }
    throw new Error(`Unknown payload mode: ${item.mode}`);
  }
  if (results.length === 1 && !envelope.label && !envelope.audit_note) {
    return results[0];
  }
  return {
    action: "batch-executed",
    label: envelope.label || null,
    audit_note: envelope.audit_note || null,
    count: results.length,
    results,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const env = loadAffineEnv();
  ensureAffineEnv(env);
  if (!command) {
    throw new Error("Expected a command: execute-action, inspect-structure, ensure-template, create-note-from-template, capture-note, get-note, append-note, curate-note, refine-note, review-note, review-queue, retrieve-notes, delete-notes, or run-cycle.");
  }

  const client = new McpClient(env);
  await client.start();
  try {
    if (command === "execute-action") {
      const result = await executeAction(client, loadActionPayload(args));
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "inspect-structure") {
      const structure = await getParaStructure(client);
      console.log(JSON.stringify(structure, null, 2));
      return;
    }
    if (command === "ensure-template") {
      const result = await ensureParaffineTemplate(client, args);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "create-note-from-template") {
      const result = await createNoteFromTemplate(client, args);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "capture-note") {
      const result = await captureNote(client, args);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "get-note") {
      const result = await getNote(client, args);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "append-note") {
      const result = await appendToNote(client, args);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "curate-note") {
      const result = await curateNote(client, args);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "refine-note") {
      const result = await refineNote(client, args);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "review-note") {
      const result = await reviewNote(client, args);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "review-queue") {
      const result = await reviewQueue(client, args);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "retrieve-notes") {
      const result = await retrieveNotes(client, args);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "delete-notes") {
      const result = await deleteNotes(client, args);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "run-cycle") {
      const result = await runCycle(client, args);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    throw new Error(`Unknown command: ${command}`);
  } finally {
    await client.stop();
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
