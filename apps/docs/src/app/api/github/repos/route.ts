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
    const repos = await octokit.request("GET /user/repos", {
      per_page: 100,
      sort: "updated",
      affiliation: "owner,collaborator,organization_member",
    });

    const items =
      repos.data?.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        owner: repo.owner?.login ?? "",
        private: repo.private,
      })) ?? [];

    return NextResponse.json({ repos: items });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to load repositories." }, { status: 500 });
  }
}
