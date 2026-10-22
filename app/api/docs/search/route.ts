import { searchLiaraDocs } from "@/lib/docs/search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const limit = Number(searchParams.get("limit") ?? "5");
  const results = await searchLiaraDocs({ query, limit });
  return Response.json({ query, results });
}
