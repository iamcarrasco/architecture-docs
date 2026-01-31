import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { decodeDraftId } from "@/lib/draft-model";
import { createGitData } from "@/lib/gitdata";
import { createDraftService } from "@/lib/drafts";
import { getOctokit } from "@/lib/github";

export const runtime = "nodejs";

type SaveRequest = {
  content: string;
  clientBaseSha: string;
};

export async function POST(request: Request, context: { params: Promise<{ draftId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { draftId } = await context.params;
    const draft = decodeDraftId(draftId);
    const body = (await request.json()) as SaveRequest;
    if (!body?.content || !body?.clientBaseSha) {
      return NextResponse.json({ error: "Missing content or clientBaseSha" }, { status: 400 });
    }

    const octokit = getOctokit(session.accessToken);
    const git = createGitData({ octokit, owner: draft.owner, repo: draft.repo });
    const service = createDraftService(git);
    const result = await service.saveDraft({ draft, content: body.content, clientBaseSha: body.clientBaseSha });

    if (result.status === "CONFLICT") {
      return NextResponse.json(result.conflict, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to save draft." }, { status: 500 });
  }
}
