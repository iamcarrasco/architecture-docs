import { compile } from "@mdx-js/mdx";
import { run } from "@mdx-js/mdx";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { Root } from "fumadocs-core/page-tree";
import * as runtime from "react/jsx-runtime";
import React from "react";
import { getGitHubConfig, getServerOctokit } from "@/lib/github";
import { createMdxSafetyPlugin } from "@/lib/mdx-safety";
import RawErrorViewer from "@/app/docs/RawErrorViewer";

type TreeItem = {
  path: string;
  type: "blob" | "tree";
};

type DocEntry = {
  path: string;
  slugs: string[];
  title: string;
  isIndex: boolean;
};

type DocData = {
  title?: string;
  description?: string;
  status?: string;
  body: any;
  toc?: any[];
};

const cache = {
  tree: null as null | { ts: number; items: TreeItem[]; entries: DocEntry[]; root: Root },
};

const TTL_MS = 30_000;

const parseFrontmatter = (content: string) => {
  if (!content.startsWith("---")) return { data: {}, content };
  const end = content.indexOf("\n---", 3);
  if (end === -1) return { data: {}, content };
  const raw = content.slice(3, end).trim();
  const rest = content.slice(end + 4).trimStart();
  const data: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const [key, ...valueParts] = line.split(":");
    if (!key) continue;
    data[key.trim()] = valueParts.join(":").trim();
  }
  return { data, content: rest };
};

const buildTree = (entries: DocEntry[]): Root => {
  const root: Root = { name: "Docs", children: [] };
  const folders = new Map<string, any>();

  const getFolder = (path: string) => {
    if (!path) return root;
    if (folders.has(path)) return folders.get(path);
    const parts = path.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const parent = getFolder(parentPath);
    const folder = { type: "folder", name, children: [] };
    parent.children.push(folder);
    folders.set(path, folder);
    return folder;
  };

  for (const entry of entries) {
    if (entry.isIndex && entry.slugs.length > 0) {
      const folderPath = entry.slugs.join("/");
      const folder = getFolder(folderPath);
      const url = `/docs/${entry.slugs.join("/")}`;
      folder.index = {
        type: "page",
        name: entry.title,
        url,
      };
      continue;
    }

    const folderPath = entry.slugs.slice(0, -1).join("/");
    const folder = getFolder(folderPath);
    const url = entry.slugs.length ? `/docs/${entry.slugs.join("/")}` : "/docs";
    folder.children.push({
      type: "page",
      name: entry.title,
      url,
    });
  }

  return root;
};

const computeSlugs = (relativePath: string) => {
  const withoutExt = relativePath.replace(/\.(md|mdx)$/, "");
  if (withoutExt === "index") return [];
  if (withoutExt.endsWith("/index")) {
    return withoutExt.slice(0, -"/index".length).split("/");
  }
  return withoutExt.split("/");
};

export const getRuntimeTree = async () => {
  if (cache.tree && Date.now() - cache.tree.ts < TTL_MS) {
    return cache.tree;
  }

  const { owner, repo, defaultBranch, docsRoot } = getGitHubConfig();
  const octokit = getServerOctokit();
  const tree = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
    owner,
    repo,
    tree_sha: defaultBranch,
    recursive: "1",
  });

  const items =
    tree.data.tree
      ?.filter(
        (item) =>
          typeof item.path === "string" &&
          item.path.startsWith(docsRoot) &&
          item.type === "blob" &&
          /\.(md|mdx)$/.test(item.path)
      )
      .map((item) => ({
        path: item.path,
        type: "blob" as const,
      })) ?? [];

  const entries = items.map((item) => {
    const relativePath = item.path.replace(`${docsRoot}/`, "");
    const slugs = computeSlugs(relativePath);
    const isIndex = relativePath === "index.mdx" || relativePath.endsWith("/index.mdx");
    const title = slugs.length ? slugs[slugs.length - 1] : "Home";
    return { path: item.path, slugs, title, isIndex };
  });

  const root = buildTree(entries);
  cache.tree = { ts: Date.now(), items, entries, root };
  return cache.tree;
};

export const getRuntimeDoc = async (slugs?: string[]): Promise<DocData | null> => {
  const { owner, repo, defaultBranch, docsRoot } = getGitHubConfig();
  const octokit = getServerOctokit();
  const tree = await getRuntimeTree();
  const slugKey = (slugs ?? []).join("/");
  const entry = tree.entries.find((item) => item.slugs.join("/") === slugKey);
  if (!entry) {
    if (!slugs || slugs.length === 0) {
      return {
        title: "Docs",
        description: `Create a document in GitHub under ${docsRoot} and refresh.`,
        body: () =>
          React.createElement(
            "div",
            null,
            React.createElement("h1", null, "No docs found"),
            React.createElement("p", null, `Create a document in GitHub under ${docsRoot} and refresh.`)
          ),
      };
    }
    return null;
  }

  const file = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
    owner,
    repo,
    path: entry.path,
    ref: defaultBranch,
  });

  if (!("content" in file.data) || typeof file.data.content !== "string") {
    return null;
  }

  const raw = Buffer.from(file.data.content, "base64").toString("utf8");
  const { data, content } = parseFrontmatter(raw);
  if (raw.includes("<<<<<<<") || raw.includes("=======") || raw.includes(">>>>>>>")) {
    return {
      title: data.title ?? entry.title,
      description: data.description,
      status: typeof data.status === "string" ? data.status.trim().toLowerCase() : undefined,
      body: () =>
        React.createElement(RawErrorViewer, {
          title: "Merge conflict markers detected",
          message:
            "This document contains unresolved conflict markers (<<<<<<<, =======, >>>>>>>). Resolve them in the file before viewing.",
          raw,
        }),
    };
  }
  let mod: any;
  try {
    const compiled = await compile(content, {
      outputFormat: "function-body",
      development: process.env.NODE_ENV === "development",
      remarkPlugins: [createMdxSafetyPlugin()],
    });
    mod = await run(compiled, {
      ...runtime,
      useMDXComponents: () => defaultMdxComponents,
    });
  } catch (error: any) {
    return {
      title: data.title ?? entry.title,
      description: data.description,
      status: typeof data.status === "string" ? data.status.trim().toLowerCase() : undefined,
      body: () =>
        React.createElement(RawErrorViewer, {
          title: "MDX compile error",
          message: error?.message ?? "Failed to compile MDX.",
          raw,
        }),
    };
  }

  const status = typeof data.status === "string" ? data.status.trim().toLowerCase() : undefined;
  return {
    title: data.title ?? entry.title,
    description: data.description,
    status,
    body: mod.default,
  };
};

export const getRuntimeRoot = async () => {
  const tree = await getRuntimeTree();
  return tree.root;
};
