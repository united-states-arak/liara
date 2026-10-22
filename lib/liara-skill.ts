import { crc32 } from "node:zlib";

export const SKILL_NAME = "liara";

export const SKILL_MD = `---
name: liara
description: Deploy, configure and monitor apps on Liara (Iranian cloud hosting) through the Liara API. Use when the user wants to create a Liara app, deploy code, set environment variables, add a domain or SSL, read logs or metrics, or restart, stop or resize an app.
---

# Liara

Operate Liara through its HTTP API. Docs: https://developers.liara.ir/ (OpenAPI) and https://docs.liara.ir/.

## Auth
- Base URL: \`https://api.liara.ir\`. Header: \`Authorization: Bearer $LIARA_API_TOKEN\`.
- Token comes from the environment only. Never print it, log it or write it to a file.
- Team accounts: send the \`teamID\` query parameter on every request (https://docs.liara.ir/references/api/about/).

## Endpoints (PaaS, from the official spec)
| Task | Method and path |
| --- | --- |
| List apps | GET /v1/projects |
| App details | GET /v1/projects/{name} |
| Create app | POST /v1/projects  { name, planID, platform } |
| Delete app | DELETE /v1/projects/{name} (ask first) |
| Start / stop | POST /v1/projects/{name}/actions/scale  { scale: 1 | 0 } |
| Restart | POST /v1/projects/{name}/actions/restart |
| Change plan | POST /v1/projects/{name}/resize  { planID } |
| Set env vars | POST /v1/projects/update-envs  { project, variables: [{key,value}] } (send the full list; merge with existing first) |
| Upload source | POST /v2/projects/{name}/sources  multipart field \`file\` = .tar.gz archive -> { sourceID } |
| Start release | POST /v2/projects/{name}/releases  { sourceID, port, type } -> { releaseID } |
| Releases | GET /v1/projects/{name}/releases?page=1&count=10 |
| Logs | GET /v1/projects/{name}/logs?since=<unix seconds> |
| Events | GET /v1/projects/{name}/events |
| Metrics | GET /v1/projects/{name}/metrics/summary, /metrics/cpu, /metrics/memory (cpu and memory need \`since\`) |
| Domains | GET /v1/domains?project={name}; POST /v1/domains { name, project, type: "PROJECT" } |
| SSL | POST /v1/domains/provision-ssl-certs  { domain } |
| Account and plans | GET /v1/me |

Platforms for create and deploy: node, next, react, vue, angular, static, python, django, flask, php, laravel, go, dotnet, docker.

## Deploy flow
1. Get plans from GET /v1/me. Never invent plan ids or prices.
2. Create the app (POST /v1/projects) if it does not exist.
3. Archive the project as .tar.gz without node_modules, .env and build caches. Upload it, then start a release with the returned sourceID, the port the app listens on, and the platform as \`type\`.
4. Verify: poll the releases list, then read logs and events. Report the real state, not the expected one.
5. Local code can also be deployed with the CLI: \`npm i -g @liara/cli\` then \`liara deploy --app NAME --platform node --port 3000 --api-token "$LIARA_API_TOKEN"\`.

## Rules
- Ask for confirmation before any write: create, deploy, restart, stop, resize, env change, domain, delete.
- After every write, re-read the app (status, releases, logs) and report what you see.
- Never echo env var values or tokens. Refer to variables by key.
- Release \`state\` has no documented values; report it as returned.
- If an endpoint is not in the spec, say so instead of guessing.
`;

function u16(n: number) {
  return Buffer.from([n & 255, (n >> 8) & 255]);
}
function u32(n: number) {
  return Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);
}

/** Minimal stored (uncompressed) zip with one file. */
export function buildSkillZip(): Buffer {
  const name = Buffer.from(`${SKILL_NAME}/SKILL.md`);
  const data = Buffer.from(SKILL_MD, "utf8");
  const crc = crc32(data);
  const header = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
    u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name,
  ]);
  const central = Buffer.concat([
    u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
    u32(crc), u32(data.length), u32(data.length), u16(name.length),
    u16(0), u16(0), u16(0), u16(0), u32(0), u32(0), name,
  ]);
  const localSize = header.length + data.length;
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(1), u16(1), u32(central.length), u32(localSize), u16(0),
  ]);
  return Buffer.concat([header, data, central, end]);
}
