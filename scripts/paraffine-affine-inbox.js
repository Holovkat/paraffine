#!/usr/bin/env node

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

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

function appendMarkdown(body) {
  const createdAt = nowStamp();
  return `\n## Capture Update ${createdAt}\n\n${body.trim()}\n`;
}

function extractFieldsFromMarkdown(markdown) {
  const fields = {};
  const match = markdown.match(/# Inbox Capture\s+([\s\S]*?)## Raw Capture/);
  const region = match ? match[1] : markdown;
  for (const line of region.split(/\r?\n/)) {
    const m = line.match(/^- ([a-z_]+):\s*(.*)$/);
    if (m) fields[m[1]] = m[2];
  }
  return fields;
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

async function getParaStructure(client) {
  const paraDoc = await searchDocByTitle(client, "PARA");
  const organize = await client.tool("list_organize_nodes", {
    workspaceId: client.env.AFFINE_WORKSPACE_ID,
  });
  const nodes = asArray(organize, "nodes");
  const topFolders = nodes.filter((node) => node.type === "folder" && !node.parentId);
  const inboxFolder = topFolders.find((node) => node.data === "Inbox") || null;
  const archiveFolder = topFolders.find((node) => node.data === "Archive" || node.data === "Archives") || null;
  return {
    paraDocId: paraDoc?.docId || paraDoc?.id || null,
    inboxFolderId: inboxFolder?.id || null,
    topFolders: topFolders.map((node) => ({ id: node.id, name: node.data })),
    archiveFolderName: archiveFolder?.data || null,
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
    fields: extractFieldsFromMarkdown(markdown),
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
    throw new Error("Expected a command: inspect-structure, capture-note, get-note, or append-note.");
  }

  const client = new McpClient(env);
  await client.start();
  try {
    if (command === "inspect-structure") {
      const structure = await getParaStructure(client);
      console.log(JSON.stringify(structure, null, 2));
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
    throw new Error(`Unknown command: ${command}`);
  } finally {
    await client.stop();
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
