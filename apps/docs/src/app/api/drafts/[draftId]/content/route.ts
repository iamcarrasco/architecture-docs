import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { decodeDraftId } from "@/lib/draft-model";
import { createGitData } from "@/lib/gitdata";
import { getOctokit } from "@/lib/github";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ draftId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { draftId } = await context.params;
    const draft = decodeDraftId(draftId);
    const octokit = getOctokit(session.accessToken);
    const git = createGitData({ octokit, owner: draft.owner, repo: draft.repo });

    const headSha = await git.ensureBranch(draft.draftBranch, draft.baseBranch);
    const file = await git.getFileContentAtCommit(headSha, draft.docPath);

    return NextResponse.json({ exists: file.exists, content: file.content ?? "", headSha });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to load draft content." }, { status: 500 });
  }
}
