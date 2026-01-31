import test from "node:test";
import assert from "node:assert/strict";
import { createDraftService } from "../src/lib/drafts.js";

const createFakeGit = ({ baseContent }) => {
  let counter = 0;
  const commits = new Map();
  const branches = new Map();

  const makeCommit = (parent, files) => {
    counter += 1;
    const sha = `c${counter}`;
    commits.set(sha, { parent, files: { ...files } });
    return sha;
  };

  const baseSha = makeCommit(null, { "content/docs/page.mdx": baseContent });
  branches.set("main", baseSha);

  const getCommitFiles = (sha) => commits.get(sha)?.files ?? {};

  return {
    ensureBranch: async (branch, baseBranch) => {
      if (branches.has(branch)) return branches.get(branch);
      const baseHead = branches.get(baseBranch);
      branches.set(branch, baseHead);
      return baseHead;
    },
    getBranchHeadSha: async (branch) => branches.get(branch) ?? null,
    getFileContentAtCommit: async (commitSha, path) => {
      const files = getCommitFiles(commitSha);
      if (!Object.prototype.hasOwnProperty.call(files, path)) {
        return { exists: false, content: "" };
      }
      return { exists: true, content: files[path] };
    },
    commitFile: async (branch, parentSha, path, content) => {
      const files = getCommitFiles(parentSha);
      const nextFiles = { ...files, [path]: content };
      const newSha = makeCommit(parentSha, nextFiles);
      branches.set(branch, newSha);
      return newSha;
    },
    compareBranches: async (base, head) => {
      const baseSha = branches.get(base);
      const headSha = branches.get(head);
      const ancestors = new Set();
      let cursor = headSha;
      let ahead = 0;
      while (cursor) {
        ancestors.add(cursor);
        cursor = commits.get(cursor)?.parent ?? null;
      }
      cursor = baseSha;
      let behind = 0;
      while (cursor && !ancestors.has(cursor)) {
        behind += 1;
        cursor = commits.get(cursor)?.parent ?? null;
      }
      const mergeBase = cursor ?? baseSha;
      cursor = headSha;
      while (cursor && cursor !== mergeBase) {
        ahead += 1;
        cursor = commits.get(cursor)?.parent ?? null;
      }
      return {
        base_commit: { sha: baseSha },
        merge_base_commit: { sha: mergeBase },
        ahead_by: ahead,
        behind_by: behind,
        files: [],
      };
    },
    getPullRequest: async () => ({ state: "open", mergeable: true, mergeable_state: "clean", merged: false }),
  };
};

test("saveDraft fast-path commit", async () => {
  const git = createFakeGit({ baseContent: "a\nb\n" });
  const service = createDraftService(git);
  const draft = {
    owner: "org",
    repo: "repo",
    baseBranch: "main",
    draftBranch: "drafts/user/page",
    docPath: "content/docs/page.mdx",
  };
  const headSha = await git.ensureBranch(draft.draftBranch, draft.baseBranch);
  const result = await service.saveDraft({
    draft,
    content: "a\nb\nc\n",
    clientBaseSha: headSha,
  });
  assert.equal(result.status, "OK");
  assert.notEqual(result.headSha, headSha);
});

test("saveDraft merge on concurrent update", async () => {
  const git = createFakeGit({ baseContent: "a\nb\nc\n" });
  const service = createDraftService(git);
  const draft = {
    owner: "org",
    repo: "repo",
    baseBranch: "main",
    draftBranch: "drafts/user/page",
    docPath: "content/docs/page.mdx",
  };
  const headSha = await git.ensureBranch(draft.draftBranch, draft.baseBranch);
  await git.commitFile(draft.draftBranch, headSha, draft.docPath, "a\nb\nc\ntheirs\n");

  const result = await service.saveDraft({
    draft,
    content: "a\nb\nc\nours\n",
    clientBaseSha: headSha,
  });
  assert.equal(result.status, "MERGED");
});

test("saveDraft conflict on overlapping edits", async () => {
  const git = createFakeGit({ baseContent: "a\nb\nc\n" });
  const service = createDraftService(git);
  const draft = {
    owner: "org",
    repo: "repo",
    baseBranch: "main",
    draftBranch: "drafts/user/page",
    docPath: "content/docs/page.mdx",
  };
  const headSha = await git.ensureBranch(draft.draftBranch, draft.baseBranch);
  await git.commitFile(draft.draftBranch, headSha, draft.docPath, "a\nb-theirs\nc\n");

  const result = await service.saveDraft({
    draft,
    content: "a\nb-ours\nc\n",
    clientBaseSha: headSha,
  });
  assert.equal(result.status, "CONFLICT");
  assert.ok(result.conflict?.conflictMarkers);
});

test("updateFromMain clean merge", async () => {
  const git = createFakeGit({ baseContent: "a\nb\nc\n" });
  const service = createDraftService(git);
  const draft = {
    owner: "org",
    repo: "repo",
    baseBranch: "main",
    draftBranch: "drafts/user/page",
    docPath: "content/docs/page.mdx",
  };
  const mainHead = await git.ensureBranch("main", "main");
  await git.commitFile("main", mainHead, draft.docPath, "a\nb\nc\nmain\n");
  await git.ensureBranch(draft.draftBranch, draft.baseBranch);

  const result = await service.updateFromMain({ draft });
  assert.equal(result.status, "UPDATED");
});
