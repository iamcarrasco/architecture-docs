import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGitHubConfig, getOctokit } from "@/lib/github";

export const runtime = "nodejs";

const normalizeForCompare = (content: string) => {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return trimmed;
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) return trimmed;
  const raw = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).trimStart();
  const data: Record<string, string> = {};
  let status: string | undefined;
  for (const line of raw.split("\n")) {
    const [key, ...rest] = line.split(":");
    if (!key) continue;
    const normalizedKey = key.trim();
    if (normalizedKey === "status") {
      status = rest.join(":").trim();
      continue;
    }
    if (normalizedKey.startsWith("_draft_")) {
      continue;
    }
    data[normalizedKey] = rest.join(":").trim();
  }
  if (status) {
    data.status = status;
  }
  const lines = Object.keys(data)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}: ${data[key]}`);
  const normalizedBody = body.replace(/\s+$/, "");
  return lines.length ? `---\n${lines.join("\n")}\n---\n\n${normalizedBody}` : normalizedBody;
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

    const items: { path: string }[] = [];
    for (const entry of draftEntries) {
      try {
        const [draftFile, docFile] = await Promise.all([
          octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
            owner,
            repo,
            path: entry.draftPath,
            ref: defaultBranch,
          }),
          octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
            owner,
            repo,
            path: entry.docPath,
            ref: defaultBranch,
          }),
        ]);

        if (
          "content" in draftFile.data &&
          typeof draftFile.data.content === "string" &&
          "content" in docFile.data &&
          typeof docFile.data.content === "string"
        ) {
          const draftContent = Buffer.from(draftFile.data.content, "base64").toString("utf8");
          const docContent = Buffer.from(docFile.data.content, "base64").toString("utf8");
          if (normalizeForCompare(draftContent) !== normalizeForCompare(docContent)) {
            items.push({ path: entry.docPath });
          }
        }
      } catch (error: any) {
        if (error?.status === 404) {
          continue;
        }
        throw error;
      }
    }

    return NextResponse.json({ items });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to load drafts." }, { status: 500 });
  }
}
