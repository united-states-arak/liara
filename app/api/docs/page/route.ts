import { isLiaraDocsUrl } from "@/lib/docs/index-builder";
import { refreshLiaraDocPage } from "@/lib/docs/search";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url") ?? "";
  if (!isLiaraDocsUrl(url)) {
    return Response.json(
      { error: "url must be an https://docs.liara.ir/ address" },
      { status: 400 },
    );
  }
  const page = await refreshLiaraDocPage(url);
  return Response.json(page);
}
