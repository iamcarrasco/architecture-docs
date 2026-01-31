import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGitHubConfig, getOctokit, resolveDocsPath } from "@/lib/github";

export const runtime = "nodejs";

type DeleteRequest = {
  paths: string[];
  message?: string;
  baseBranch?: string;
};

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as DeleteRequest;
    if (!body.paths?.length) {
      return NextResponse.json({ error: "No files selected" }, { status: 400 });
    }

    const { owner, repo, defaultBranch } = getGitHubConfig();
    const baseBranch = body.baseBranch ?? defaultBranch;
    const octokit = getOctokit(session.accessToken);

    for (const inputPath of body.paths) {
      const filePath = resolveDocsPath(inputPath);
      const existing = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path: filePath,
        ref: baseBranch,
      });

      if (!("sha" in existing.data) || typeof existing.data.sha !== "string") {
        continue;
      }

      await octokit.request("DELETE /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path: filePath,
        message: body.message ?? `Delete ${filePath}`,
        sha: existing.data.sha,
        branch: baseBranch,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to delete files." }, { status: 500 });
  }
}
