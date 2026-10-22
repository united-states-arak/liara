import { buildSkillZip, SKILL_MD } from "@/lib/liara-skill";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("format") === "md";
  const body = raw ? SKILL_MD : new Uint8Array(buildSkillZip());
  return new Response(body, {
    headers: {
      "Content-Type": raw ? "text/markdown; charset=utf-8" : "application/zip",
      "Content-Disposition": `attachment; filename="${raw ? "SKILL.md" : "liara-skill.zip"}"`,
      "Cache-Control": "no-store",
    },
  });
}
