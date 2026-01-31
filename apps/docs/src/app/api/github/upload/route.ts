import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGitHubConfig, getOctokit, resolveAssetsPath } from "@/lib/github";
import path from "node:path";

export const runtime = "nodejs";

const sanitizeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "-");

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file data" }, { status: 400 });
    }

    const { owner, repo, defaultBranch, assetsRoot } = getGitHubConfig();
    const octokit = getOctokit(session.accessToken);

    const baseName = sanitizeFileName(path.basename(file.name));
    const stampedName = `${Date.now()}-${baseName}`;
    const filePath = resolveAssetsPath(stampedName);
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentBase64 = buffer.toString("base64");

    await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: filePath,
      message: `Upload ${stampedName}`,
      content: contentBase64,
      branch: defaultBranch,
    });

    const publicPrefix = assetsRoot.startsWith("public/") ? assetsRoot.slice("public/".length) : assetsRoot;
    const relativeUrl = `/${publicPrefix}/${stampedName}`.replace(/\/+/g, "/");
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${filePath}`;

    return NextResponse.json({ url: relativeUrl, rawUrl });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to upload image." }, { status: 500 });
  }
}
