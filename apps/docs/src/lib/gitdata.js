const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (error) => {
  const status = error?.status;
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
};

export const requestWithRetry = async (octokit, options) => {
  const maxAttempts = 4;
  let attempt = 0;
  let delay = 300;
  while (attempt < maxAttempts) {
    try {
      return await octokit.request(options);
    } catch (error) {
      attempt += 1;
      if (attempt >= maxAttempts || !isRetryable(error)) {
        throw error;
      }
      await sleep(delay);
      delay *= 2;
    }
  }
  throw new Error("Failed after retries");
};

export const createGitData = ({ octokit, owner, repo }) => {
  const getBranchHeadSha = async (branch) => {
    try {
      const ref = await requestWithRetry(octokit, {
        method: "GET",
        url: "/repos/{owner}/{repo}/git/ref/heads/{ref}",
        owner,
        repo,
        ref: branch,
      });
      return ref.data.object.sha;
    } catch (error) {
      if (error?.status === 404) return null;
      throw error;
    }
  };

  const createBranchFrom = async (branch, baseBranch) => {
    const baseSha = await getBranchHeadSha(baseBranch);
    if (!baseSha) {
      throw new Error(`Base branch ${baseBranch} not found.`);
    }
    await requestWithRetry(octokit, {
      method: "POST",
      url: "/repos/{owner}/{repo}/git/refs",
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });
    return baseSha;
  };

  const ensureBranch = async (branch, baseBranch) => {
    const head = await getBranchHeadSha(branch);
    if (head) return head;
    return createBranchFrom(branch, baseBranch);
  };

  const getCommit = async (sha) => {
    const commit = await requestWithRetry(octokit, {
      method: "GET",
      url: "/repos/{owner}/{repo}/git/commits/{commit_sha}",
      owner,
      repo,
      commit_sha: sha,
    });
    return commit.data;
  };

  const getTreeRecursive = async (treeSha) => {
    const tree = await requestWithRetry(octokit, {
      method: "GET",
      url: "/repos/{owner}/{repo}/git/trees/{tree_sha}",
      owner,
      repo,
      tree_sha: treeSha,
      recursive: "1",
    });
    return tree.data.tree ?? [];
  };

  const getBlobContent = async (sha) => {
    const blob = await requestWithRetry(octokit, {
      method: "GET",
      url: "/repos/{owner}/{repo}/git/blobs/{file_sha}",
      owner,
      repo,
      file_sha: sha,
    });
    const content = Buffer.from(blob.data.content, "base64").toString("utf8");
    return content;
  };

  const getFileContentAtCommit = async (commitSha, path) => {
    const commit = await getCommit(commitSha);
    const tree = await getTreeRecursive(commit.tree.sha);
    const entry = tree.find((item) => item.path === path && item.type === "blob");
    if (!entry || !entry.sha) {
      return { exists: false, content: "" };
    }
    const content = await getBlobContent(entry.sha);
    return { exists: true, content };
  };

  const commitFile = async (branch, parentSha, path, content, message) => {
    const blob = await requestWithRetry(octokit, {
      method: "POST",
      url: "/repos/{owner}/{repo}/git/blobs",
      owner,
      repo,
      content: Buffer.from(content, "utf8").toString("base64"),
      encoding: "base64",
    });

    const parentCommit = await getCommit(parentSha);
    const tree = await requestWithRetry(octokit, {
      method: "POST",
      url: "/repos/{owner}/{repo}/git/trees",
      owner,
      repo,
      base_tree: parentCommit.tree.sha,
      tree: [
        {
          path,
          mode: "100644",
          type: "blob",
          sha: blob.data.sha,
        },
      ],
    });

    const commit = await requestWithRetry(octokit, {
      method: "POST",
      url: "/repos/{owner}/{repo}/git/commits",
      owner,
      repo,
      message,
      tree: tree.data.sha,
      parents: [parentSha],
    });

    await requestWithRetry(octokit, {
      method: "PATCH",
      url: "/repos/{owner}/{repo}/git/refs/heads/{ref}",
      owner,
      repo,
      ref: branch,
      sha: commit.data.sha,
    });

    return commit.data.sha;
  };

  const compareBranches = async (base, head) => {
    const compare = await requestWithRetry(octokit, {
      method: "GET",
      url: "/repos/{owner}/{repo}/compare/{base}...{head}",
      owner,
      repo,
      base,
      head,
    });
    return compare.data;
  };

  const getPullRequest = async (prNumber) => {
    const pr = await requestWithRetry(octokit, {
      method: "GET",
      url: "/repos/{owner}/{repo}/pulls/{pull_number}",
      owner,
      repo,
      pull_number: prNumber,
    });
    return pr.data;
  };

  const getPullRequestByHead = async (head) => {
    const prs = await requestWithRetry(octokit, {
      method: "GET",
      url: "/repos/{owner}/{repo}/pulls",
      owner,
      repo,
      head,
      state: "open",
      per_page: 1,
    });
    return prs.data?.[0] ?? null;
  };

  return {
    ensureBranch,
    getBranchHeadSha,
    getFileContentAtCommit,
    commitFile,
    compareBranches,
    getPullRequest,
    getPullRequestByHead,
  };
};
