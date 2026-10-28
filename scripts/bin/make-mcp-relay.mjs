// Relais MCP stdio → Make (Streamable HTTP), authentification par jeton uniquement.
// Volontairement sans OAuth : un jeton refusé produit une erreur, jamais une fenêtre de navigateur.
// Entrées (environnement) : MAKE_ZONE, MAKE_MCP_TOKEN — fournies par make-mcp.
import { createInterface } from 'node:readline';

const { MAKE_ZONE, MAKE_MCP_TOKEN } = process.env;
if (!MAKE_ZONE || !MAKE_MCP_TOKEN) {
  console.error('make-mcp: MAKE_ZONE et MAKE_MCP_TOKEN requis');
  process.exit(1);
}
const url = `https://${MAKE_ZONE}/mcp`;
let sessionId = null;
let protocolVersion = null;

const write = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const rpcError = (id, message) => id !== undefined && write({ jsonrpc: '2.0', id, error: { code: -32000, message } });

function parseBody(contentType, text) {
  if (!text.trim()) return [];
  if (contentType.includes('text/event-stream')) {
    return text
      .split(/\r?\n\r?\n/)
      .map((event) => event.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n'))
      .filter(Boolean)
      .map((data) => JSON.parse(data));
  }
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function forward(msg) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${MAKE_MCP_TOKEN}`,
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  if (protocolVersion) headers['mcp-protocol-version'] = protocolVersion;

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(msg) });
  } catch (err) {
    return rpcError(msg.id, `make-mcp: Make injoignable (${err.message})`);
  }

  if (res.status === 401 || res.status === 403) {
    const message = `make-mcp: jeton Make refusé (${res.status}) — vérifier MAKE_MCP_TOKEN dans le fichier de secrets`;
    console.error(message);
    rpcError(msg.id, message);
    if (msg.method === 'initialize') process.exit(1);
    return;
  }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    return rpcError(msg.id, `make-mcp: HTTP ${res.status} ${body}`);
  }

  sessionId = res.headers.get('mcp-session-id') || sessionId;
  let messages;
  try {
    messages = parseBody(res.headers.get('content-type') || '', await res.text());
  } catch (err) {
    return rpcError(msg.id, `make-mcp: réponse illisible (${err.message})`);
  }
  for (const m of messages) {
    if (msg.method === 'initialize' && m.result?.protocolVersion) protocolVersion = m.result.protocolVersion;
    write(m);
  }
}

const pending = new Set();
createInterface({ input: process.stdin })
  .on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return console.error('make-mcp: message JSON invalide ignoré');
    }
    const p = forward(msg).finally(() => pending.delete(p));
    pending.add(p);
  })
  .on('close', async () => {
    await Promise.allSettled([...pending]);
    process.exit(0);
  });
