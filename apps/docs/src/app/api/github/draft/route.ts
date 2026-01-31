import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGitHubConfig, getOctokit, resolveDraftPath } from "@/lib/github";

export const runtime = "nodejs";

type DraftRequest = {
  path: string;
  content: string;
};

const getUserLogin = async (token: string) => {
  const octokit = getOctokit(token);
  const user = await octokit.request("GET /user");
  return user.data.login;
};

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { defaultBranch } = getGitHubConfig();
    const { searchParams } = new URL(request.url);
    const inputPath = searchParams.get("path");
    if (!inputPath) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }
    const login = await getUserLogin(session.accessToken);
    const draftPath = resolveDraftPath(inputPath, login);
    const octokit = getOctokit(session.accessToken);

    try {
      const file = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        ...getGitHubConfig(),
        path: draftPath,
        ref: defaultBranch,
      });

      if ("content" in file.data && typeof file.data.content === "string") {
        const content = Buffer.from(file.data.content, "base64").toString("utf8");
        return NextResponse.json({ exists: true, content, sha: file.data.sha, draftPath });
      }
    } catch (error: any) {
      if (error?.status !== 404) {
        throw error;
      }
    }

    return NextResponse.json({ exists: false, draftPath });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to load draft." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as DraftRequest;
    if (!body.path) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    const login = await getUserLogin(session.accessToken);
    const draftPath = resolveDraftPath(body.path, login);
    const { owner, repo, defaultBranch } = getGitHubConfig();
    const octokit = getOctokit(session.accessToken);

    await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: draftPath,
      message: `Draft: ${body.path}`,
      content: Buffer.from(body.content ?? "").toString("base64"),
      branch: defaultBranch,
    });

    return NextResponse.json({ ok: true, draftPath });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to save draft." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const inputPath = searchParams.get("path");
    if (!inputPath) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    const login = await getUserLogin(session.accessToken);
    const draftPath = resolveDraftPath(inputPath, login);
    const { owner, repo, defaultBranch } = getGitHubConfig();
    const octokit = getOctokit(session.accessToken);

    try {
      const existing = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path: draftPath,
        ref: defaultBranch,
      });

      if (!("sha" in existing.data) || typeof existing.data.sha !== "string") {
        return NextResponse.json({ ok: true });
      }

      await octokit.request("DELETE /repos/{owner}/{repo}/contents/{path}", {
        owner,
        repo,
        path: draftPath,
        message: `Delete draft: ${inputPath}`,
        sha: existing.data.sha,
        branch: defaultBranch,
      });
    } catch (error: any) {
      if (error?.status !== 404) {
        throw error;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to delete draft." }, { status: 500 });
  }
}
