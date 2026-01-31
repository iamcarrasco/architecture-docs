import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGitHubConfig, getOctokit } from "@/lib/github";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { owner: defaultOwner, repo: defaultRepo, defaultBranch, docsRoot } = getGitHubConfig();
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner") ?? defaultOwner;
    const repo = searchParams.get("repo") ?? defaultRepo;
    if (!owner || !repo) {
      return NextResponse.json({ error: "Missing owner or repo" }, { status: 400 });
    }
    const octokit = getOctokit(session.accessToken);

    const tree = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
      owner,
      repo,
      tree_sha: defaultBranch,
      recursive: "1",
    });

    const items =
      tree.data.tree
        ?.filter(
          (item) =>
            typeof item.path === "string" &&
          item.path.startsWith(docsRoot) &&
          (item.type === "tree" || (item.type === "blob" && /\.(md|mdx)$/.test(item.path)))
        )
        .map((item) => ({
          path: item.path,
          type: item.type,
        })) ?? [];

    return NextResponse.json({
      items,
      docsRoot,
      owner: defaultOwner,
      repo: defaultRepo,
      defaultBranch,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to load tree." }, { status: 500 });
  }
}
