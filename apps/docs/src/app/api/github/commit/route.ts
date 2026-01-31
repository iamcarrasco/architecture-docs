import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGitHubConfig, getOctokit, resolveDocsPath } from "@/lib/github";

export const runtime = "nodejs";

type CommitRequest = {
  path: string;
  content: string;
  message?: string;
  sha?: string;
  baseBranch?: string;
};

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as CommitRequest;
    const { owner, repo, defaultBranch } = getGitHubConfig();
    const baseBranch = body.baseBranch ?? defaultBranch;
    const filePath = resolveDocsPath(body.path);
    const octokit = getOctokit(session.accessToken);

    const commitMessage = body.message ?? `Update ${filePath}`;

    const result = await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: filePath,
      message: commitMessage,
      content: Buffer.from(body.content ?? "").toString("base64"),
      branch: baseBranch,
      sha: body.sha,
    });

    const newSha = "content" in result.data ? result.data.content?.sha : undefined;

    return NextResponse.json({ sha: newSha });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to save file." }, { status: 500 });
  }
}
