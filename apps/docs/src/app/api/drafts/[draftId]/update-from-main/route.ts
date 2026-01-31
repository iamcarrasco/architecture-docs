import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { decodeDraftId } from "@/lib/draft-model";
import { createGitData } from "@/lib/gitdata";
import { createDraftService } from "@/lib/drafts";
import { getOctokit } from "@/lib/github";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ draftId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { draftId } = await context.params;
    const draft = decodeDraftId(draftId);

    const octokit = getOctokit(session.accessToken);
    const git = createGitData({ octokit, owner: draft.owner, repo: draft.repo });
    const service = createDraftService(git);
    const result = await service.updateFromMain({ draft });

    if (result.status === "CONFLICT") {
      return NextResponse.json(result.conflict, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to update from main." }, { status: 500 });
  }
}
