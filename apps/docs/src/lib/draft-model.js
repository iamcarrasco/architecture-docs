const requiredFields = ["owner", "repo", "baseBranch", "draftBranch", "docPath"];

export const decodeDraftId = (draftId) => {
  let payload;
  try {
    const json = Buffer.from(draftId, "base64url").toString("utf8");
    payload = JSON.parse(json);
  } catch (error) {
    throw new Error("Invalid draftId.");
  }
  for (const field of requiredFields) {
    if (!payload?.[field] || typeof payload[field] !== "string") {
      throw new Error(`Missing draft field: ${field}`);
    }
  }
  return {
    draftId,
    owner: payload.owner,
    repo: payload.repo,
    baseBranch: payload.baseBranch,
    draftBranch: payload.draftBranch,
    prNumber: typeof payload.prNumber === "number" ? payload.prNumber : undefined,
    docPath: payload.docPath,
  };
};

export const encodeDraftId = (draft) => {
  const payload = {
    owner: draft.owner,
    repo: draft.repo,
    baseBranch: draft.baseBranch,
    draftBranch: draft.draftBranch,
    prNumber: draft.prNumber,
    docPath: draft.docPath,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
};
