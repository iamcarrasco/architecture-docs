import { normalizeLineEndings, threeWayMerge } from "./merge.js";

const normalizeForCompare = (text) => {
  const normalized = normalizeLineEndings(text).replace(/\r?\n$/, "");
  return normalized;
};

const ensureTrailingNewline = (text, shouldHave) => {
  if (shouldHave && !text.endsWith("\n")) return `${text}\n`;
  if (!shouldHave && text.endsWith("\n")) return text.replace(/\n+$/, "");
  return text;
};

export const createDraftService = (git) => {
  const saveDraft = async ({ draft, content, clientBaseSha }) => {
    if (!clientBaseSha) {
      throw new Error("Missing clientBaseSha.");
    }
    const normalizedContent = normalizeLineEndings(content ?? "");
    const keepTrailing = normalizedContent.endsWith("\n");

    const headSha = await git.ensureBranch(draft.draftBranch, draft.baseBranch);
    const current = await git.getFileContentAtCommit(headSha, draft.docPath);
    const currentContent = current.exists ? normalizeLineEndings(current.content) : "";

    if (normalizeForCompare(currentContent) === normalizeForCompare(normalizedContent)) {
      return {
        status: "NOOP",
        headSha,
      };
    }

    if (clientBaseSha === headSha) {
      const newSha = await git.commitFile(
        draft.draftBranch,
        headSha,
        draft.docPath,
        ensureTrailingNewline(normalizedContent, keepTrailing),
        `Draft save: ${draft.docPath}`
      );
      return { status: "OK", headSha: newSha };
    }

    const base = await git.getFileContentAtCommit(clientBaseSha, draft.docPath);
    const baseContent = base.exists ? normalizeLineEndings(base.content) : "";
    const theirsContent = currentContent;
    const oursContent = normalizedContent;

    const merge = threeWayMerge(baseContent, theirsContent, oursContent);
    if (merge.clean) {
      const mergedText = ensureTrailingNewline(merge.mergedText, keepTrailing);
      const newSha = await git.commitFile(
        draft.draftBranch,
        headSha,
        draft.docPath,
        mergedText,
        `Draft merge: ${draft.docPath}`
      );
      return { status: "MERGED", headSha: newSha };
    }

    return {
      status: "CONFLICT",
      conflict: {
        type: "CONFLICT",
        docPath: draft.docPath,
        baseContent,
        theirsContent,
        oursContent,
        conflictMarkers: merge.conflict.markers,
        hunks: merge.conflict.hunks,
        instructions: "Resolve conflicts and save again.",
      },
    };
  };

  const updateFromMain = async ({ draft }) => {
    const headSha = await git.ensureBranch(draft.draftBranch, draft.baseBranch);
    const compare = await git.compareBranches(draft.baseBranch, draft.draftBranch);
    const baseHeadSha = compare.base_commit?.sha ?? null;
    const mergeBaseSha = compare.merge_base_commit?.sha ?? baseHeadSha;

    const mainContent = await git.getFileContentAtCommit(baseHeadSha, draft.docPath);
    const draftContent = await git.getFileContentAtCommit(headSha, draft.docPath);
    const baseContent = await git.getFileContentAtCommit(mergeBaseSha, draft.docPath);

    const merge = threeWayMerge(
      baseContent.exists ? baseContent.content : "",
      mainContent.exists ? mainContent.content : "",
      draftContent.exists ? draftContent.content : ""
    );

    if (merge.clean) {
      const newSha = await git.commitFile(
        draft.draftBranch,
        headSha,
        draft.docPath,
        merge.mergedText,
        `Update from ${draft.baseBranch}: ${draft.docPath}`
      );
      return { status: "UPDATED", headSha: newSha };
    }

    return {
      status: "CONFLICT",
      conflict: {
        type: "CONFLICT",
        docPath: draft.docPath,
        baseContent: baseContent.exists ? baseContent.content : "",
        theirsContent: mainContent.exists ? mainContent.content : "",
        oursContent: draftContent.exists ? draftContent.content : "",
        conflictMarkers: merge.conflict.markers,
        hunks: merge.conflict.hunks,
        instructions: "Resolve conflicts and save again.",
      },
    };
  };

  const getStatus = async ({ draft }) => {
    const headSha = await git.ensureBranch(draft.draftBranch, draft.baseBranch);
    const compare = await git.compareBranches(draft.baseBranch, draft.draftBranch);
    const behindBy = compare.behind_by ?? 0;
    const aheadBy = compare.ahead_by ?? 0;

    let status = "Draft";
    let prState = null;
    let mergeableState = null;
    let prNumber = draft.prNumber ?? null;
    let prUrl = null;
    if (draft.prNumber) {
      const pr = await git.getPullRequest(draft.prNumber);
      prState = pr.state;
      mergeableState = pr.mergeable_state;
      prUrl = pr.html_url ?? null;
      if (pr.merged) {
        status = "Approved";
      } else if (pr.state === "open") {
        status = "In Review";
      }
      if (pr.mergeable === false || pr.mergeable_state === "dirty") {
        status = "Conflicts";
      } else if (pr.mergeable_state === "blocked" || pr.mergeable_state === "unstable") {
        status = "Checks Failing";
      }
    } else if (git.getPullRequestByHead) {
      const head = `${draft.owner}:${draft.draftBranch}`;
      const pr = await git.getPullRequestByHead(head);
      if (pr) {
        prNumber = pr.number;
        prUrl = pr.html_url ?? null;
        prState = pr.state;
        mergeableState = pr.mergeable_state;
        if (pr.merged) {
          status = "Approved";
        } else if (pr.state === "open") {
          status = "In Review";
        }
        if (pr.mergeable === false || pr.mergeable_state === "dirty") {
          status = "Conflicts";
        } else if (pr.mergeable_state === "blocked" || pr.mergeable_state === "unstable") {
          status = "Checks Failing";
        }
      }
    }

    if (behindBy > 0 && status !== "Approved" && status !== "Conflicts" && status !== "Checks Failing") {
      status = "Out of Date";
    }

    return {
      status,
      draftHeadSha: headSha,
      baseHeadSha: compare.base_commit?.sha ?? null,
      aheadBy,
      behindBy,
      prState,
      mergeableState,
      prNumber,
      prUrl,
    };
  };

  const getDiff = async ({ draft }) => {
    const compare = await git.compareBranches(draft.baseBranch, draft.draftBranch);
    const files = compare.files ?? [];
    const file = files.find((item) => item.filename === draft.docPath);
    return {
      docPath: draft.docPath,
      patch: file?.patch ?? "",
      status: file?.status ?? "modified",
      additions: file?.additions ?? 0,
      deletions: file?.deletions ?? 0,
      aheadBy: compare.ahead_by ?? 0,
      behindBy: compare.behind_by ?? 0,
    };
  };

  return {
    saveDraft,
    updateFromMain,
    getStatus,
    getDiff,
  };
};
