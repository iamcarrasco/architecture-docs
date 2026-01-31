import "server-only";
import path from "node:path";
import { Octokit } from "@octokit/core";

type GitHubConfig = {
  owner: string;
  repo: string;
  defaultBranch: string;
  docsRoot: string;
  assetsRoot: string;
  draftsRoot: string;
};

const getRequiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

export const getGitHubConfig = (): GitHubConfig => {
  const docsRoot = (process.env.GITHUB_DOCS_ROOT ?? "content/docs").replace(/\/+$/, "");
  let assetsRoot = (process.env.GITHUB_ASSETS_ROOT ?? "public/docs-assets").replace(/\/+$/, "");
  const draftsRoot = (process.env.GITHUB_DRAFTS_ROOT ?? "content/drafts").replace(/\/+$/, "");
  if (!assetsRoot.startsWith("public/")) {
    assetsRoot = `public/${assetsRoot.replace(/^\/+/, "")}`;
  }
  return {
    owner: getRequiredEnv("GITHUB_OWNER"),
    repo: getRequiredEnv("GITHUB_REPO"),
    defaultBranch: process.env.GITHUB_DEFAULT_BRANCH ?? "main",
    docsRoot,
    assetsRoot,
    draftsRoot,
  };
};

export const getServerToken = () => {
  const token = process.env.GITHUB_READ_TOKEN;
  if (!token) {
    throw new Error("Missing environment variable: GITHUB_READ_TOKEN");
  }
  return token;
};

export const getServerOctokit = () => {
  return new Octokit({ auth: getServerToken() });
};

export const getOctokit = (token: string) => {
  return new Octokit({
    auth: token,
  });
};

export const resolveDocsPath = (inputPath: string) => {
  const { docsRoot } = getGitHubConfig();
  const cleaned = inputPath.trim().replace(/^\/+/, "");
  const combined = cleaned.startsWith(docsRoot) ? cleaned : path.posix.join(docsRoot, cleaned);
  const normalized = path.posix.normalize(combined);

  if (!normalized.startsWith(docsRoot)) {
    throw new Error("Invalid path");
  }

  if (!/\.(md|mdx)$/.test(normalized)) {
    throw new Error("Only .md or .mdx files are supported.");
  }

  return normalized;
};

export const resolveAssetsPath = (inputPath: string) => {
  const { assetsRoot } = getGitHubConfig();
  const cleaned = inputPath.trim().replace(/^\/+/, "");
  const combined = cleaned.startsWith(assetsRoot) ? cleaned : path.posix.join(assetsRoot, cleaned);
  const normalized = path.posix.normalize(combined);

  if (!normalized.startsWith(assetsRoot)) {
    throw new Error("Invalid asset path");
  }

  return normalized;
};

export const resolveDraftPath = (inputPath: string, userLogin: string) => {
  const { draftsRoot, docsRoot } = getGitHubConfig();
  const cleaned = inputPath.trim().replace(/^\/+/, "");
  const relative = cleaned.startsWith(docsRoot) ? cleaned.slice(docsRoot.length).replace(/^\/+/, "") : cleaned;
  const combined = path.posix.join(draftsRoot, userLogin, relative);
  const normalized = path.posix.normalize(combined);

  if (!normalized.startsWith(`${draftsRoot}/${userLogin}`)) {
    throw new Error("Invalid draft path");
  }

  if (!/\.(md|mdx)$/.test(normalized)) {
    throw new Error("Only .md or .mdx files are supported.");
  }

  return normalized;
};
