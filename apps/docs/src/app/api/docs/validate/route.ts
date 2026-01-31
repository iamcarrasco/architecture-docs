import { NextResponse } from "next/server";
import { compile } from "@mdx-js/mdx";
import { createMdxSafetyPlugin } from "@/lib/mdx-safety";

export const runtime = "nodejs";

type ValidateRequest = {
  content: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ValidateRequest;
    if (typeof body?.content !== "string") {
      return NextResponse.json({ error: "Missing content" }, { status: 400 });
    }

    await compile(body.content, {
      outputFormat: "function-body",
      remarkPlugins: [createMdxSafetyPlugin()],
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const line = error?.position?.start?.line ?? error?.line ?? null;
    const column = error?.position?.start?.column ?? error?.column ?? null;
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "Invalid MDX.",
        line,
        column,
      },
      { status: 400 }
    );
  }
}
