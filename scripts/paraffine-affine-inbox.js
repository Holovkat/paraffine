#!/usr/bin/env node

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_TEMPLATE_TITLE = "PARAFFINE Note Template";

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
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timeout waiting for ${method}`));
        }
      }, 20000);
    });
  }

  async tool(name, args) {
    const response = await this.request("tools/call", { name, arguments: args || {} });
    if (response.result?.isError) {
      const text = response.result?.content?.map((item) => item.text).join("\n") || `Tool call failed: ${name}`;
      throw new Error(text);
    }
    return response.result?.structuredContent || response.result;
  }

  async stop() {
    if (this.proc) this.proc.kill("SIGTERM");
  }
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
    metadataLine("status", "inbox"),
    metadataLine("captured_at", createdAt),
    metadataLine("source", args.source || "unknown"),
    metadataLine("source_ref", args["source-ref"] || ""),
    metadataLine("domain_hint", args["domain-hint"] || ""),
    metadataLine("kind_hint", args["kind-hint"] || ""),
    "",
    "## Raw Capture",
    "",
    rawBody,
    "",
  ];
  return lines.join("\n");
}

function paraffineTemplateMarkdown() {
  return [
    "# {{note_heading}}",
    "",
    "## Summary",
    "",
    "{{summary}}",
    "",
    "## Raw Capture",
    "",
    "{{raw_capture}}",
    "",
    "## Capture Updates",
    "",
    "{{capture_updates}}",
    "",
    "## Working Notes",
    "",
    "{{working_notes}}",
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

function sectionBetween(markdown, startHeading, endHeadings) {
  const text = String(markdown || "");
  const escapedStart = startHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startRegex = new RegExp(`^#{1,2} ${escapedStart}\\s*$`, "m");
  const startMatch = text.match(startRegex);
  if (!startMatch || startMatch.index == null) return "";
  const bodyStart = startMatch.index + startMatch[0].length;
  const body = text.slice(bodyStart).replace(/^\s+/, "");
  if (!endHeadings.length) return body.trim();
  const escapedEnds = endHeadings.map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const endRegex = new RegExp(`^## (?:${escapedEnds.join("|")})\\s*$`, "m");
  const endMatch = body.match(endRegex);
  const sectionText = endMatch && endMatch.index != null ? body.slice(0, endMatch.index) : body;
  return sectionText.trim();
}

function extractMetadataLines(markdown, heading) {
  const body = sectionBetween(markdown, heading, [
    "Raw Capture",
    "Capture Updates",
    "Curation",
    "Audit Trail",
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
  const plural = sectionBetween(markdown, "Capture Updates", ["Curation", "Audit Trail"]);
  if (plural) sections.push(plural);
  const regex = /^## Capture Update [^\n]*\n([\s\S]*?)(?=^## |\Z)/gm;
  let match;
  while ((match = regex.exec(String(markdown || "")))) {
    sections.push(match[1].trim());
  }
  return sections.filter(Boolean).join("\n\n");
}

function extractRawCapture(markdown) {
  return sectionBetween(markdown, "Raw Capture", ["Capture Updates", "Curation", "Audit Trail"]);
}

function extractFieldsFromMarkdown(markdown) {
  return {
    ...extractMetadataLines(markdown, "Inbox Capture"),
    ...extractMetadataLines(markdown, "Curation"),
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
    "# Inbox Capture",
    "",
    metadataLine("status", captureFields.status || "inbox"),
    metadataLine("captured_at", captureFields.captured_at || ""),
    metadataLine("source", captureFields.source || ""),
    metadataLine("source_ref", captureFields.source_ref || ""),
    metadataLine("domain_hint", captureFields.domain_hint || ""),
    metadataLine("kind_hint", captureFields.kind_hint || ""),
    "",
    "## Raw Capture",
    "",
    rawText.trim(),
    "",
  ];

  if (updatesText && updatesText.trim()) {
    captureSection.push("## Capture Updates", "", updatesText.trim(), "");
  }

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
  return `\n## Capture Update ${createdAt}\n\n${body.trim()}\n`;
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
  const folderMap = {};
  for (const node of topFolders) {
    folderMap[String(node.data || "").toLowerCase()] = node.id;
  }
  return {
    paraDocId: paraDoc?.docId || paraDoc?.id || null,
    inboxFolderId: inboxFolder?.id || null,
    projectsFolderId: folderMap.projects || null,
    areasFolderId: folderMap.areas || null,
    resourcesFolderId: folderMap.resources || null,
    archivesFolderId: archiveFolder?.id || null,
    topFolders: topFolders.map((node) => ({ id: node.id, name: node.data })),
    archiveFolderName: archiveFolder?.data || null,
    organizeNodes: nodes,
  };
}

async function ensureInboxSurface(client) {
  const structure = await getParaStructure(client);
  if (!structure.paraDocId) {
    throw new Error("Missing writable PARA root doc in AFFiNE. Create the PARA doc first.");
  }
  if (!structure.inboxFolderId) {
    throw new Error("Missing Inbox organize folder in AFFiNE. Create the Inbox folder in the sidebar first.");
  }
  return structure;
}

async function createInboxDoc(client, title, markdown, inboxFolderId) {
  const created = await client.tool("create_doc", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
    title,
    content: markdown,
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
  return {
    note_heading: args["note-heading"] || args.title || "PARAFFINE Note",
    summary: args.summary || "Write the short human-readable summary here.",
    raw_capture: args["raw-capture"] || args.body || "",
    capture_updates: args["capture-updates"] || "",
    working_notes: args["working-notes"] || "",
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

function pickCanonicalRef(duplicates) {
  const canonical = duplicates.find((item) => item.fields.status === "canonical");
  if (canonical) return canonical.docId;
  return "";
}

function reviewDueAtForStatus(status) {
  const now = new Date();
  if (status === "canonical") now.setDate(now.getDate() + 30);
  else if (status === "archived") now.setDate(now.getDate() + 90);
  else if (status === "discarded") now.setFullYear(now.getFullYear() + 10);
  else now.setDate(now.getDate() + 7);
  return now.toISOString().replace(/\.\d+Z$/, "Z");
}

function routeFolderId(structure, kind, status) {
  if (status === "archived" || status === "discarded" || kind === "archive") return structure.archivesFolderId;
  if (kind === "project") return structure.projectsFolderId;
  if (kind === "area") return structure.areasFolderId;
  return structure.resourcesFolderId;
}

async function moveDocToFolder(client, structure, docId, targetFolderId) {
  if (!targetFolderId) throw new Error("Missing target organize folder for curated note.");
  const docNodes = structure.organizeNodes.filter((node) => node.type === "doc" && node.data === docId);
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
  requireCaptureFields(doc);

  const kind = normalizeKind(doc.fields.kind_hint, doc.rawText);
  const domain = normalizeDomain(doc.fields.domain_hint, doc.rawText, doc.fields.source);
  const duplicateDocs = await findDuplicateDocs(client, doc);
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
  await moveDocToFolder(client, structure, doc.docId, targetFolderId);
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
  const existing = await searchDocByTitle(client, title);

  if (existing?.docId) {
    await client.tool("append_markdown", {
      workspaceId: client.env.AFFINE_WORKSPACE_ID,
      docId: existing.docId,
      markdown: appendMarkdown(args.body),
    });
    const doc = await readDoc(client, existing.docId);
    return { action: "appended", title, ...structure, doc };
  }

  const docId = await createInboxDoc(client, title, captureMarkdown(args), structure.inboxFolderId);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  const env = loadAffineEnv();
  ensureAffineEnv(env);
  if (!command) {
    throw new Error("Expected a command: inspect-structure, ensure-template, create-note-from-template, capture-note, get-note, append-note, or curate-note.");
  }

  const client = new McpClient(env);
  await client.start();
  try {
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
    throw new Error(`Unknown command: ${command}`);
  } finally {
    await client.stop();
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
