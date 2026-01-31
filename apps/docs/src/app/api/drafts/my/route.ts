import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGitHubConfig, getOctokit } from "@/lib/github";

export const runtime = "nodejs";

type DraftItem = {
  docPath: string;
  draftPath: string;
  updatedAt: string | null;
};

const cache = {
  items: null as DraftItem[] | null,
  ts: 0,
  login: "",
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { owner, repo, defaultBranch, docsRoot, draftsRoot } = getGitHubConfig();
    const octokit = getOctokit(session.accessToken);
    const user = await octokit.request("GET /user");
    const login = user.data.login;
    const now = Date.now();
    if (cache.items && cache.login === login && now - cache.ts < 30_000) {
      return NextResponse.json({ items: cache.items, cached: true });
    }
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
          docPath: `${docsRoot}/${item.path?.slice(prefix.length) ?? ""}`.replace(/\/+/g, "/"),
        })) ?? [];

    const items: DraftItem[] = [];
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
      items.push({
        docPath: entry.docPath,
        draftPath: entry.draftPath,
        updatedAt,
      });
    }

    cache.items = items;
    cache.ts = now;
    cache.login = login;
    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to load drafts." }, { status: 500 });
  }
}
