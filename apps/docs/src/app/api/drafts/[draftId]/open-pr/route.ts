import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { decodeDraftId } from "@/lib/draft-model";
import { createGitData } from "@/lib/gitdata";
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

    await git.ensureBranch(draft.draftBranch, draft.baseBranch);

    const head = `${draft.owner}:${draft.draftBranch}`;
    const existing = await git.getPullRequestByHead(head);
    if (existing) {
      return NextResponse.json({ prNumber: existing.number, url: existing.html_url });
    }

    const pr = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
      owner: draft.owner,
      repo: draft.repo,
      title: `Docs update: ${draft.docPath}`,
      head: draft.draftBranch,
      base: draft.baseBranch,
      body: `Draft updates for \`${draft.docPath}\`.`,
    });

    return NextResponse.json({ prNumber: pr.data.number, url: pr.data.html_url });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to open PR." }, { status: 500 });
  }
}
