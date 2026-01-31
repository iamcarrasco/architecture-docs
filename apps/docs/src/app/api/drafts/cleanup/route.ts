import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGitHubConfig, getOctokit } from "@/lib/github";

export const runtime = "nodejs";

const MS_IN_DAY = 86_400_000;

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { days?: number };
    const thresholdDays = typeof body.days === "number" ? body.days : 30;
    const thresholdMs = thresholdDays * MS_IN_DAY;

    const { owner, repo, defaultBranch, draftsRoot } = getGitHubConfig();
    const octokit = getOctokit(session.accessToken);
    const user = await octokit.request("GET /user");
    const login = user.data.login;
    const prefix = `${draftsRoot}/${login}/`;

    const tree = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
      owner,
      repo,
      tree_sha: defaultBranch,
      recursive: "1",
    });

    const draftEntries =
      tree.data.tree
        ?.filter(
          (item) =>
            typeof item.path === "string" &&
            item.path.startsWith(prefix) &&
            item.type === "blob" &&
            /\.(md|mdx)$/.test(item.path)
        )
        .map((item) => ({
          draftPath: item.path ?? "",
        })) ?? [];

    const deleted: string[] = [];
    for (const entry of draftEntries) {
      const commits = await octokit.request("GET /repos/{owner}/{repo}/commits", {
        owner,
        repo,
        sha: defaultBranch,
        path: entry.draftPath,
        per_page: 1,
      });
      const commit = commits.data?.[0];
      const updatedAt =
        commit?.commit?.committer?.date ??
        commit?.commit?.author?.date ??
        null;
      if (!updatedAt) continue;
      const ageMs = Date.now() - new Date(updatedAt).getTime();
      if (thresholdDays > 0 && ageMs < thresholdMs) continue;

      const file = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path: entry.draftPath,
        ref: defaultBranch,
      });
      if (!("sha" in file.data) || typeof file.data.sha !== "string") {
        continue;
      }
      await octokit.request("DELETE /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path: entry.draftPath,
        message: `Cleanup stale draft: ${entry.draftPath}`,
        sha: file.data.sha,
        branch: defaultBranch,
      });
      deleted.push(entry.draftPath);
    }

    return NextResponse.json({ deleted, thresholdDays });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to cleanup drafts." }, { status: 500 });
  }
}
