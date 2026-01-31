import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGitHubConfig, getOctokit, resolveDocsPath } from "@/lib/github";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { defaultBranch, owner: defaultOwner, repo: defaultRepo } = getGitHubConfig();
    const { searchParams } = new URL(request.url);
    const inputPath = searchParams.get("path");
    const owner = searchParams.get("owner") ?? defaultOwner;
    const repo = searchParams.get("repo") ?? defaultRepo;

    if (!inputPath) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }
    if (!owner || !repo) {
      return NextResponse.json({ error: "Missing owner or repo" }, { status: 400 });
    }

    const filePath = resolveDocsPath(inputPath);
    const octokit = getOctokit(session.accessToken);

    const file = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: filePath,
      ref: defaultBranch,
    });

    if ("content" in file.data && typeof file.data.content === "string") {
      const content = Buffer.from(file.data.content, "base64").toString("utf8");
      return NextResponse.json({ path: filePath, content, sha: file.data.sha });
    }

    return NextResponse.json({ error: "File not found" }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to load file." }, { status: 500 });
  }
}
