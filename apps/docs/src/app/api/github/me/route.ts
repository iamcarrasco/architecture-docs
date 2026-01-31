import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOctokit } from "@/lib/github";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const octokit = getOctokit(session.accessToken);
    const user = await octokit.request("GET /user");
    return NextResponse.json({ login: user.data.login });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to load user." }, { status: 500 });
  }
}
