import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGitHubConfig, getOctokit, resolveDocsPath } from "@/lib/github";

export const runtime = "nodejs";

type PRRequest = {
  owner?: string;
  repo?: string;
  path: string;
  content: string;
  title?: string;
  message?: string;
  baseBranch?: string;
};

const slugFromPath = (filePath: string) =>
  filePath
    .replace(/\.(md|mdx)$/, "")
    .split("/")
    .slice(-2)
    .join("-")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .toLowerCase();

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await request.json()) as PRRequest;
    const { owner: defaultOwner, repo: defaultRepo, defaultBranch } = getGitHubConfig();
    const owner = body.owner ?? defaultOwner;
    const repo = body.repo ?? defaultRepo;
    const baseBranch = body.baseBranch ?? defaultBranch;
    if (!owner || !repo) {
      return NextResponse.json({ error: "Missing owner or repo" }, { status: 400 });
    }
    const filePath = resolveDocsPath(body.path);
    const octokit = getOctokit(session.accessToken);

    const baseRef = await octokit.request("GET /repos/{owner}/{repo}/git/ref/heads/{ref}", {
      owner,
      repo,
      ref: baseBranch,
    });

    const branchName = `docs/${slugFromPath(filePath)}-${Date.now()}`;

    try {
      await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: baseRef.data.object.sha,
      });
    } catch (error: any) {
      if (error?.status !== 422) {
        throw error;
      }
    }

    let existingSha: string | undefined;
    try {
      const existing = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path: filePath,
        ref: baseBranch,
      });
      if ("sha" in existing.data && typeof existing.data.sha === "string") {
        existingSha = existing.data.sha;
      }
    } catch (error: any) {
      if (error?.status !== 404) {
        throw error;
      }
    }

    const commitMessage = body.message ?? `Update ${filePath}`;

    await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: filePath,
      message: commitMessage,
      content: Buffer.from(body.content ?? "").toString("base64"),
      branch: branchName,
      sha: existingSha,
    });

    const prTitle = body.title ?? `Docs update: ${filePath}`;

    const pr = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
      owner,
      repo,
      title: prTitle,
      head: branchName,
      base: baseBranch,
      body: `Automated docs update for \`${filePath}\`.`,
    });

    return NextResponse.json({ url: pr.data.html_url, branch: branchName });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to create PR." }, { status: 500 });
  }
}
