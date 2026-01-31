"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  CodeToggle,
  CreateLink,
  InsertCodeBlock,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  MDXEditorMethods,
  UndoRedo,
  headingsPlugin,
  linkPlugin,
  listsPlugin,
  quotePlugin,
  codeBlockPlugin,
  imagePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import "./editor.css";
import { STATUS_OPTIONS, STATUS_STYLES } from "@/lib/status";

const MDXEditor = dynamic(
  async () => {
    const mod = await import("@mdxeditor/editor");
    return mod.MDXEditor;
  },
  { ssr: false }
);

type FileEntry = {
  path: string;
};

type TreeItem = {
  path: string;
  type: "blob" | "tree";
};

type TreeNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
};

export default function EditorPage() {
  const { status, data: session } = useSession();
  const editorRef = useRef<MDXEditorMethods>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<TreeItem[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [docsRoot, setDocsRoot] = useState<string>("content/docs");
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [editorKey, setEditorKey] = useState<string>("index.mdx");
  const [markdown, setMarkdown] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [fileSha, setFileSha] = useState<string | undefined>(undefined);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createFolder, setCreateFolder] = useState<boolean>(false);
  const [parentFolder, setParentFolder] = useState<string>("content/docs");
  const [folderName, setFolderName] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [statusValue, setStatusValue] = useState<string>("");
  const [repoInfo, setRepoInfo] = useState<{ owner?: string; repo?: string; branch?: string }>({});
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [lastSavedLabel, setLastSavedLabel] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [treeQuery, setTreeQuery] = useState<string>("");
  const [expandAll, setExpandAll] = useState<boolean>(false);
  const [draftId, setDraftId] = useState<string>("");
  const [draftHeadSha, setDraftHeadSha] = useState<string>("");
  const [userLogin, setUserLogin] = useState<string>("");
  const [saveMode, setSaveMode] = useState<"draft" | "pr">("pr");
  const [prInfo, setPrInfo] = useState<{ number?: number; url?: string; status?: string } | null>(null);
  const [draftStatus, setDraftStatus] = useState<string>("Draft");
  const [myDrafts, setMyDrafts] = useState<Array<{ docPath: string; draftPath: string; updatedAt: string | null }>>([]);
  const [draftsLoading, setDraftsLoading] = useState<boolean>(false);
  const [cleanupLoading, setCleanupLoading] = useState<boolean>(false);
  const [cleanupMessage, setCleanupMessage] = useState<string>("");
  const [conflictPayload, setConflictPayload] = useState<{
    type: "CONFLICT";
    docPath: string;
    baseContent: string;
    theirsContent: string;
    oursContent: string;
    conflictMarkers?: string;
    hunks?: Array<{
      baseStart: number;
      baseEnd: number;
      oursLines: string[];
      theirsLines: string[];
    }>;
    instructions?: string;
  } | null>(null);
  const [resolvedContent, setResolvedContent] = useState<string>("");
  const [validationError, setValidationError] = useState<string>("");
  const [validationLocation, setValidationLocation] = useState<{ line?: number | null; column?: number | null }>({});
  const [showRawContent, setShowRawContent] = useState<boolean>(false);
  const lastLoadedRef = useRef<string>("");
  const autosaveTimerRef = useRef<number | null>(null);

  const buildDraftId = useCallback(
    (path: string) => {
      if (!path || !repoInfo.owner || !repoInfo.repo || !repoInfo.branch || !userLogin) return "";
      const slug = path.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
      const draftBranch = `drafts/${userLogin}/${slug}`;
      const payload = {
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        baseBranch: repoInfo.branch,
        draftBranch,
        docPath: path,
      };
      return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },
    [repoInfo.owner, repoInfo.repo, repoInfo.branch, userLogin]
  );

  const saveDraftNow = useCallback(
    async (path: string, content: string) => {
      if (!path) return;
      const effectiveDraftId = buildDraftId(path);
      if (!effectiveDraftId) return;
      let baseSha = draftId === effectiveDraftId ? draftHeadSha : "";
      if (!baseSha) {
        const statusRes = await fetch(`/api/drafts/${effectiveDraftId}/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          baseSha = statusData?.draftHeadSha ?? "";
        }
      }
      if (!baseSha) return;
      const res = await fetch(`/api/drafts/${effectiveDraftId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, clientBaseSha: baseSha }),
      });
      if (res.status === 409) {
        const conflict = await res.json();
        setConflictPayload(conflict);
        setResolvedContent(conflict.conflictMarkers ?? content);
        return;
      }
      const data = await res.json();
      if (!data?.error && data?.headSha && draftId === effectiveDraftId) {
        setDraftHeadSha(data.headSha);
        setLastSavedAt(Date.now());
      }
    },
    [buildDraftId, draftId, draftHeadSha]
  );

  const uploadImage = useCallback(async (image: File) => {
    const formData = new FormData();
    formData.append("file", image);
    const res = await fetch("/api/github/upload", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Upload failed");
    }
    return (data.rawUrl ?? data.url) as string;
  }, []);

  const onPickImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file);
      editorRef.current?.insertMarkdown(`![](${url})`);
    } catch (error: any) {
      setMessage(error?.message ?? "Image upload failed.");
    } finally {
      event.target.value = "";
    }
  };

  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      codeBlockPlugin(),
      imagePlugin({ imageUploadHandler: uploadImage }),
      tablePlugin(),
      linkPlugin(),
      thematicBreakPlugin(),
      toolbarPlugin({
        toolbarContents: () => (
          <>
            <UndoRedo />
            <BlockTypeSelect />
            <BoldItalicUnderlineToggles />
            <CodeToggle />
            <ListsToggle />
            <CreateLink />
            <button
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              Upload Image
            </button>
            <InsertTable />
            <InsertCodeBlock />
            <InsertThematicBreak />
          </>
        ),
      }),
    ],
    [uploadImage]
  );

  useEffect(() => {
    const loadFiles = async () => {
      try {
        const res = await fetch("/api/github/tree");
        if (res.status === 401) {
          setMessage("Please sign in with GitHub.");
          return;
        }
        const data = await res.json();
        setItems(data.items ?? []);
        if (data.docsRoot) {
          setDocsRoot(data.docsRoot);
          setParentFolder(data.docsRoot);
        }
        setRepoInfo({ owner: data.owner, repo: data.repo, branch: data.defaultBranch });
        const userRes = await fetch("/api/github/me");
        if (userRes.ok) {
          const userData = await userRes.json();
          setUserLogin(userData.login ?? "");
        }
        setDraftsLoading(true);
        const draftsRes = await fetch("/api/drafts/my");
        if (draftsRes.ok) {
          const draftsData = await draftsRes.json();
          setMyDrafts(draftsData.items ?? []);
        }
        setDraftsLoading(false);
      } catch (err) {
        setMessage("Failed to load file list.");
      }
    };

    if (status === "authenticated") {
      loadFiles();
    }
  }, [status, refreshKey]);

  useEffect(() => {
    const buildTree = (entries: TreeItem[]) => {
      const root: TreeNode = { name: "", path: "", type: "folder", children: [] };
      for (const entry of entries) {
        const parts = entry.path.split("/").filter(Boolean);
        let current = root;
        parts.forEach((part, index) => {
          const isLast = index === parts.length - 1;
          const existing =
            current.children?.find((child) => child.name === part) ??
            ((): TreeNode => {
              const node: TreeNode = {
                name: part,
                path: parts.slice(0, index + 1).join("/"),
                type: isLast && entry.type === "blob" ? "file" : "folder",
                children: [],
              };
              current.children?.push(node);
              return node;
            })();
          current = existing;
        });
      }

      const sortNodes = (nodes: TreeNode[]) => {
        nodes.sort((a, b) => {
          if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        for (const node of nodes) {
          if (node.children?.length) sortNodes(node.children);
        }
      };

      if (root.children) sortNodes(root.children);
      return root.children ?? [];
    };

    setTree(buildTree(items));
  }, [items]);

  useEffect(() => {
    const loadFile = async () => {
      setLoading(true);
      setMessage("");
      setConflictPayload(null);
      setResolvedContent("");
      try {
        const res = await fetch(`/api/github/file?path=${encodeURIComponent(selectedPath)}`);
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const data = await res.json();
        const rawContent = data.content ?? "";
        const { data: frontmatter, status } = parseFrontmatter(rawContent);
        if (status && STATUS_OPTIONS.includes(status)) {
          setStatusValue(status);
        } else {
          setStatusValue("");
        }
        const cleaned = normalizeStatusFrontmatter(rawContent, status);
        setMarkdown(cleaned);
        setEditorKey(selectedPath);
        lastLoadedRef.current = cleaned;
        setHasUnsavedChanges(false);
        setFileSha(data.sha);
        if (buildDraftId(selectedPath)) {
          const draftContentRes = await fetch(`/api/drafts/${buildDraftId(selectedPath)}/content`);
          if (draftContentRes.ok) {
            const draftContentData = await draftContentRes.json();
            if (
              draftContentData?.exists &&
              typeof draftContentData.content === "string" &&
              draftContentData.content &&
              draftContentData.content !== cleaned
            ) {
              setMarkdown(draftContentData.content);
              setEditorKey(`${selectedPath}-draft-${Date.now()}`);
              lastLoadedRef.current = draftContentData.content;
              setHasUnsavedChanges(false);
              if (draftContentData.headSha) {
                setDraftHeadSha(draftContentData.headSha);
              }
              setMessage("Loaded autosaved draft from draft branch.");
            }
          }
        }
      } catch (err) {
        setMessage("Unable to load file.");
        setMarkdown("");
        setEditorKey(selectedPath);
        lastLoadedRef.current = "";
        setHasUnsavedChanges(false);
        setFileSha(undefined);
      } finally {
        setLoading(false);
      }
    };

    if (selectedPath && status === "authenticated") {
      loadFile();
    }
  }, [selectedPath, status]);

  useEffect(() => {
    if (!selectedPath) {
      setDraftId("");
      setDraftHeadSha("");
      return;
    }
    const encoded = buildDraftId(selectedPath);
    setDraftId(encoded);
  }, [selectedPath, buildDraftId]);

  useEffect(() => {
    const fetchStatus = async () => {
      if (!draftId) return;
      const res = await fetch(`/api/drafts/${draftId}/status`);
      if (!res.ok) return;
      const data = await res.json();
      if (data?.draftHeadSha) {
        setDraftHeadSha(data.draftHeadSha);
      }
      if (data?.status) {
        setDraftStatus(data.status);
      }
      if (data?.prNumber || data?.prUrl || data?.status) {
        setPrInfo({
          number: data.prNumber ?? undefined,
          url: data.prUrl ?? undefined,
          status: data.status ?? undefined,
        });
      } else {
        setPrInfo(null);
      }
    };
    void fetchStatus();
  }, [draftId]);

  const formatRelativeTime = (value: string | null) => {
    if (!value) return "Unknown";
    const diff = Date.now() - new Date(value).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  useEffect(() => {
    if (lastSavedAt === null) return;
    const updateLabel = () => {
      const seconds = Math.floor((Date.now() - lastSavedAt) / 1000);
      if (seconds < 5) {
        setLastSavedLabel("just now");
      } else if (seconds < 60) {
        setLastSavedLabel(`${seconds}s ago`);
      } else if (seconds < 3600) {
        setLastSavedLabel(`${Math.floor(seconds / 60)}m ago`);
      } else {
        setLastSavedLabel(new Date(lastSavedAt).toLocaleTimeString());
      }
    };
    updateLabel();
    const interval = window.setInterval(updateLabel, 30_000);
    return () => window.clearInterval(interval);
  }, [lastSavedAt]);

  const parseFrontmatter = (content: string) => {
    const trimmed = content.trimStart();
    if (!trimmed.startsWith("---")) return { data: {}, body: trimmed, status: undefined };
    const end = trimmed.indexOf("\n---", 3);
    if (end === -1) return { data: {}, body: trimmed, status: undefined };
    const raw = trimmed.slice(3, end).trim();
    const body = trimmed.slice(end + 4).trimStart();
    const data: Record<string, string> = {};
    let status: string | undefined;
    for (const line of raw.split("\n")) {
      const [key, ...rest] = line.split(":");
      if (!key) continue;
      const normalizedKey = key.trim();
      if (normalizedKey === "status") {
        status = rest.join(":").trim();
        continue;
      }
      data[normalizedKey] = rest.join(":").trim();
    }
    return { data, body, status };
  };

  const upsertStatusFrontmatter = (content: string, nextStatus: string) => {
    const normalized = content.replace(/\r\n?/g, "\n");
    const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
    let frontmatter = "";
    let body = normalized;
    if (match) {
      frontmatter = match[1] ?? "";
      body = normalized.slice(match[0].length);
    }
    const fmLines = frontmatter
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/^status\s*:/i.test(line));
    fmLines.push(`status: ${nextStatus}`);
    const cleanedBody = body.replace(/^\s*status\s*:[^\n]*\n+/i, "");
    return `---\n${fmLines.join("\n")}\n---\n\n${cleanedBody.trimStart()}`;
  };

  const normalizeStatusFrontmatter = (content: string, nextStatus?: string) => {
    if (nextStatus) {
      return upsertStatusFrontmatter(content, nextStatus);
    }
    const normalized = content.replace(/\r\n?/g, "\n");
    const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!match) return content;
    const frontmatter = match[1] ?? "";
    const body = normalized.slice(match[0].length);
    const fmLines = frontmatter
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/^status\s*:/i.test(line));
    const statusLine = frontmatter
      .split("\n")
      .map((line) => line.trim())
      .find((line) => /^status\s*:/i.test(line));
    if (statusLine) {
      fmLines.push(statusLine);
    }
    const cleanedBody = body.replace(/^\s*status\s*:[^\n]*\n+/i, "");
    return fmLines.length
      ? `---\n${fmLines.join("\n")}\n---\n\n${cleanedBody.trimStart()}`
      : cleanedBody.trimStart();
  };

  const onSave = async () => {
    if (!selectedPath) {
      setMessage("Select a file before saving.");
      return;
    }
    const confirmed = window.confirm(`Save changes to ${selectedPath}?`);
    if (!confirmed) return;
    setSaving(true);
    setMessage("");
    setValidationError("");
    setValidationLocation({});
    try {
      const nextStatus = applyAutoStatus(statusValue);
      if (!nextStatus) {
        setMessage("Please select a status before saving.");
        return;
      }
      const contentWithStatus = upsertStatusFrontmatter(markdown, nextStatus);
      if (nextStatus !== statusValue) {
        setStatusValue(nextStatus);
      }
      if (contentWithStatus.includes("<<<<<<<") || contentWithStatus.includes("=======") || contentWithStatus.includes(">>>>>>>")) {
        setValidationError("Unresolved merge conflict markers detected. Resolve them before saving.");
        return;
      }
      const validateRes = await fetch("/api/docs/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentWithStatus }),
      });
      if (!validateRes.ok) {
        const validateData = await validateRes.json();
        setValidationError(validateData.error ?? "MDX validation failed.");
        setValidationLocation({ line: validateData.line, column: validateData.column });
        return;
      }
      if (nextStatus === "approved") {
        if (!fileSha) {
          setMessage("Unable to commit to main: missing file SHA.");
          return;
        }
        const res = await fetch("/api/github/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: selectedPath,
            content: contentWithStatus,
            sha: fileSha,
            message: `Approve ${selectedPath}`,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to commit to main");
        }
        setFileSha(data.sha);
        setMarkdown(contentWithStatus);
        setMessage("Committed to main.");
        setRefreshKey((value) => value + 1);
        lastLoadedRef.current = contentWithStatus;
        setHasUnsavedChanges(false);
        setLastSavedAt(Date.now());
        return;
      }

      if (!draftId || !draftHeadSha) {
        setMessage("Draft branch not ready yet. Try again in a moment.");
        return;
      }
      const res = await fetch(`/api/drafts/${draftId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: contentWithStatus,
          clientBaseSha: draftHeadSha,
        }),
      });
      if (res.status === 409) {
        const conflict = await res.json();
        setConflictPayload(conflict);
        setResolvedContent(conflict.conflictMarkers ?? contentWithStatus);
        setMessage("Conflict detected. Resolve before saving.");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save file");
      }
      if (data?.headSha) {
        setDraftHeadSha(data.headSha);
      }
      setMarkdown(contentWithStatus);
      setMessage("File saved.");
      setRefreshKey((value) => value + 1);
      if (saveMode === "pr") {
        const prRes = await fetch(`/api/drafts/${draftId}/open-pr`, { method: "POST" });
        if (prRes.ok) {
          const prData = await prRes.json();
          setPrInfo({ number: prData.prNumber, url: prData.url, status: prInfo?.status ?? "In Review" });
        }
      }
      lastLoadedRef.current = contentWithStatus;
      setHasUnsavedChanges(false);
      setLastSavedAt(Date.now());
    } catch (err: any) {
      setMessage(err?.message ?? "Failed to save file.");
    } finally {
      setSaving(false);
    }
  };

  const normalizeFileName = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/\.(md|mdx)$/.test(trimmed)) return trimmed;
    return `${trimmed}.mdx`;
  };

  const computeTargetPath = (
    baseFolder: string,
    wantsFolder: boolean,
    folder: string,
    file: string
  ) => {
    if (!baseFolder) return "";
    if (wantsFolder && !folder.trim()) return "";
    if (!wantsFolder && !file.trim()) return "";
    const base = baseFolder.replace(/\/+$/, "");
    const folderSegment = wantsFolder ? `/${folder.trim().replace(/^\/+/, "")}` : "";
    const finalFileName = wantsFolder && !file.trim() ? "index.mdx" : file;
    return `${base}${folderSegment}/${normalizeFileName(finalFileName)}`;
  };

  const existingPaths = useMemo(() => {
    return new Set(items.filter((item) => item.type === "blob").map((item) => item.path));
  }, [items]);

  const onCreateNew = () => {
    const targetPath = computeTargetPath(parentFolder, createFolder, folderName, fileName);
    if (!targetPath) {
      setMessage("Provide a folder or file name before creating.");
      return;
    }
    if (existingPaths.has(targetPath)) {
      setMessage("A file already exists at that path. Choose a different name.");
      return;
    }

    const newContent = createFolder ? `# ${folderName.trim()}\n` : "";
    const contentWithStatus = newContent;
    setSelectedPath(targetPath);
    setMarkdown(contentWithStatus);
    setStatusValue("");
    setEditorKey(targetPath);
    setFileSha(undefined);
    setShowCreateModal(false);
    setCreateFolder(false);
    setFolderName("");
    setFileName("");
    void saveNewFile(targetPath, contentWithStatus);
  };

  const saveNewFile = async (path: string, content: string) => {
    setSaving(true);
    setMessage("");
    setValidationError("");
    setValidationLocation({});
    try {
      const localDraftId = buildDraftId(path);
      const effectiveDraftId = localDraftId || draftId;
      if (!effectiveDraftId) {
        setMessage("Draft branch not ready yet. Try again in a moment.");
        return;
      }
      if (content.includes("<<<<<<<") || content.includes("=======") || content.includes(">>>>>>>")) {
        setValidationError("Unresolved merge conflict markers detected. Resolve them before saving.");
        return;
      }
      const validateRes = await fetch("/api/docs/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!validateRes.ok) {
        const validateData = await validateRes.json();
        setValidationError(validateData.error ?? "MDX validation failed.");
        setValidationLocation({ line: validateData.line, column: validateData.column });
        return;
      }
      if (!draftHeadSha) {
        const statusRes = await fetch(`/api/drafts/${effectiveDraftId}/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData?.draftHeadSha) {
            setDraftHeadSha(statusData.draftHeadSha);
          }
        }
      }
      const baseSha = draftHeadSha;
      if (!baseSha) {
        setMessage("Draft branch not ready yet. Try again in a moment.");
        return;
      }
      const nextStatus = applyAutoStatus(statusValue);
      const contentWithStatus = nextStatus ? upsertStatusFrontmatter(content, nextStatus) : content;
      if (nextStatus && nextStatus !== statusValue) {
        setStatusValue(nextStatus);
      }
      const res = await fetch(`/api/drafts/${effectiveDraftId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: contentWithStatus,
          clientBaseSha: baseSha,
        }),
      });
      if (res.status === 409) {
        const conflict = await res.json();
        setConflictPayload(conflict);
        setResolvedContent(conflict.conflictMarkers ?? content);
        setMessage("Conflict detected. Resolve before saving.");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create file");
      }
      if (data?.headSha) {
        setDraftHeadSha(data.headSha);
      }
      setMessage("File created and saved.");
      setRefreshKey((value) => value + 1);
      if (saveMode === "pr" && effectiveDraftId) {
        const prRes = await fetch(`/api/drafts/${effectiveDraftId}/open-pr`, { method: "POST" });
        if (prRes.ok) {
          const prData = await prRes.json();
          setPrInfo({ number: prData.prNumber, url: prData.url, status: prInfo?.status ?? "In Review" });
        }
      }
      lastLoadedRef.current = contentWithStatus;
      setHasUnsavedChanges(false);
      setLastSavedAt(Date.now());
    } catch (err: any) {
      setMessage(err?.message ?? "Failed to create file.");
    } finally {
      setSaving(false);
    }
  };

  const onDeleteSelected = async () => {
    if (selectedFiles.size === 0) return;
    const pathsToDelete = new Set<string>();
    for (const path of selectedFiles) {
      const entry = items.find((item) => item.path === path);
      if (entry?.type === "tree") {
        for (const item of items) {
          if (item.type === "blob" && item.path.startsWith(`${path}/`)) {
            pathsToDelete.add(item.path);
          }
        }
      } else {
        pathsToDelete.add(path);
      }
    }
    if (pathsToDelete.size === 0) {
      setMessage("No files found in the selected folder(s).");
      return;
    }
    const confirmed = window.confirm(
      `Delete ${pathsToDelete.size} file(s)? This cannot be undone.\n\nNote: Deleting all files in a folder removes the folder from the repo.`
    );
    if (!confirmed) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/github/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paths: Array.from(pathsToDelete),
          message: `Delete ${pathsToDelete.size} file(s)`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete files");
      }
      setSelectedFiles(new Set());
      setRefreshKey((value) => value + 1);
      if (pathsToDelete.has(selectedPath)) {
        setSelectedPath(`${docsRoot}/index.mdx`);
      }
      setMessage("Files deleted.");
    } catch (err: any) {
      setMessage(err?.message ?? "Failed to delete files.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!selectedPath) return;
    const isDirty = markdown !== lastLoadedRef.current;
    setHasUnsavedChanges(isDirty);
    if (!isDirty) return;
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      saveDraftNow(selectedPath, markdown);
    }, 1200);
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [markdown, selectedPath, saveDraftNow]);

  const handleSelectPath = useCallback(
    (nextPath: string) => {
      if (selectedPath && markdown !== lastLoadedRef.current) {
        saveDraftNow(selectedPath, markdown);
      }
      setSelectedPath(nextPath);
    },
    [selectedPath, markdown, saveDraftNow]
  );

  const handleResolveSave = async () => {
    if (!draftId || !draftHeadSha || !resolvedContent) {
      setMessage("Missing draft state for resolve.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/drafts/${draftId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: resolvedContent,
          clientBaseSha: draftHeadSha,
        }),
      });
      if (res.status === 409) {
        const conflict = await res.json();
        setConflictPayload(conflict);
        setResolvedContent(conflict.conflictMarkers ?? resolvedContent);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to resolve conflict");
      }
      if (data?.headSha) {
        setDraftHeadSha(data.headSha);
      }
      setMarkdown(resolvedContent);
      lastLoadedRef.current = resolvedContent;
      setHasUnsavedChanges(false);
      setConflictPayload(null);
      setMessage("Conflict resolved and saved.");
      if (saveMode === "pr" && draftId) {
        const prRes = await fetch(`/api/drafts/${draftId}/open-pr`, { method: "POST" });
        if (prRes.ok) {
          const prData = await prRes.json();
          setPrInfo({ number: prData.prNumber, url: prData.url, status: prInfo?.status ?? "In Review" });
        }
      }
    } catch (err: any) {
      setMessage(err?.message ?? "Failed to resolve conflict.");
    } finally {
      setSaving(false);
    }
  };

  const applyAutoStatus = (current: string) => {
    if (current === "decommissioned") return current;
    if (current === "approved") return current;
    if (current === "draft") return current;
    if (prInfo?.status === "Approved") return "approved";
    if (prInfo?.status === "In Review" || saveMode === "pr") return "review";
    return "draft";
  };

  const resolveConflictMarkers = (content: string, strategy: "ours" | "theirs" | "both") => {
    const lines = content.split("\n");
    const output: string[] = [];
    let mode: "normal" | "ours" | "theirs" = "normal";
    const ours: string[] = [];
    const theirs: string[] = [];
    for (const line of lines) {
      if (line.startsWith("<<<<<<<")) {
        mode = "ours";
        ours.length = 0;
        theirs.length = 0;
        continue;
      }
      if (line.startsWith("=======") && mode === "ours") {
        mode = "theirs";
        continue;
      }
      if (line.startsWith(">>>>>>>") && mode !== "normal") {
        if (strategy === "ours") {
          output.push(...ours);
        } else if (strategy === "theirs") {
          output.push(...theirs);
        } else {
          output.push(...ours, ...theirs);
        }
        mode = "normal";
        continue;
      }
      if (mode === "ours") {
        ours.push(line);
      } else if (mode === "theirs") {
        theirs.push(line);
      } else {
        output.push(line);
      }
    }
    return output.join("\n");
  };

  useEffect(() => {
    if (!selectedPath) return;
    if (!statusValue) return;
    if (conflictPayload) return;
    const nextStatus = applyAutoStatus(statusValue);
    if (nextStatus !== statusValue && STATUS_OPTIONS.includes(nextStatus) && statusValue !== "approved") {
      setStatusValue(nextStatus);
      setMarkdown((current) => normalizeStatusFrontmatter(current, nextStatus));
    }
  }, [statusValue, prInfo?.status, saveMode, selectedPath, conflictPayload]);

  const handleUpdateFromMain = async () => {
    if (!draftId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/drafts/${draftId}/update-from-main`, { method: "POST" });
      if (res.status === 409) {
        const conflict = await res.json();
        setConflictPayload(conflict);
        setResolvedContent(conflict.conflictMarkers ?? conflict.oursContent ?? "");
        setMessage("Conflict detected while updating from main.");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update from main");
      }
      if (data?.headSha) {
        setDraftHeadSha(data.headSha);
      }
      setMessage("Draft updated from main.");
      const statusRes = await fetch(`/api/drafts/${draftId}/status`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData?.status) setDraftStatus(statusData.status);
        if (statusData?.draftHeadSha) setDraftHeadSha(statusData.draftHeadSha);
      }
    } catch (err: any) {
      setMessage(err?.message ?? "Failed to update from main.");
    } finally {
      setSaving(false);
    }
  };

  const handleCleanupDrafts = async () => {
    setCleanupLoading(true);
    setCleanupMessage("");
    try {
      const res = await fetch("/api/drafts/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 0 }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Cleanup failed");
      }
      setCleanupMessage(`Deleted ${data.deleted?.length ?? 0} drafts.`);
      const draftsRes = await fetch("/api/drafts/my");
      if (draftsRes.ok) {
        const draftsData = await draftsRes.json();
        setMyDrafts(draftsData.items ?? []);
      }
    } catch (err: any) {
      setCleanupMessage(err?.message ?? "Cleanup failed.");
    } finally {
      setCleanupLoading(false);
    }
  };

  const selectedBreadcrumb = selectedPath
    ? selectedPath.replace(`${docsRoot}/`, "").split("/").filter(Boolean)
    : [];

  const filteredTree = useMemo(() => {
    if (!treeQuery.trim()) return tree;
    const query = treeQuery.trim().toLowerCase();
    const filterNodes = (nodes: TreeNode[]): TreeNode[] => {
      const result: TreeNode[] = [];
      for (const node of nodes) {
        if (node.type === "file") {
          if (node.name.toLowerCase().startsWith("index.")) {
            continue;
          }
          const match =
            node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query);
          if (match) result.push(node);
        } else {
          const children = node.children ? filterNodes(node.children) : [];
          const match = node.name.toLowerCase().includes(query);
          if (match || children.length) {
            result.push({ ...node, children });
          }
        }
      }
      return result;
    };
    return filterNodes(tree);
  }, [tree, treeQuery]);



  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-zinc-700 dark:text-zinc-200">Admin Editor</span>
          <span className="text-zinc-500">
            {status === "authenticated"
              ? `Signed in as ${session?.user?.name ?? session?.user?.email ?? "GitHub user"}`
              : "Signed out"}
          </span>
          <span className="text-zinc-500">
            {repoInfo.owner && repoInfo.repo
              ? `Repo: ${repoInfo.owner}/${repoInfo.repo}${repoInfo.branch ? `@${repoInfo.branch}` : ""}`
              : "Repo: not connected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-2 py-0.5 text-xs ${
              status === "authenticated"
                ? "bg-emerald-100 text-emerald-900"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {status === "authenticated" ? "Connection OK" : "Not connected"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Docs Editor</h1>
          <p className="text-sm text-zinc-500">Click a file, edit, and save.</p>
        </div>
        {status === "authenticated" ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500">
              {session?.user?.name ?? session?.user?.email ?? "Signed in"}
            </span>
            <button
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={() => signOut()}
            >
              Sign out
            </button>
          </div>
        ) : null}
      </div>

      {status !== "authenticated" ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-500 dark:border-zinc-700">
          <p className="mb-3">Sign in with GitHub to edit documentation.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
              onClick={() => signIn("github")}
            >
              Sign in with GitHub
            </button>
            <span className="text-xs text-zinc-400">
              Editing actions are disabled until you connect your GitHub account.
            </span>
          </div>
        </div>
      ) : (
        <div className="editor-shell">
          <aside className="editor-panel">
            <div className="mb-4 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs uppercase tracking-widest text-zinc-500">My Drafts</div>
                <button
                  className="rounded-md border border-red-300 px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-950"
                  onClick={handleCleanupDrafts}
                  disabled={cleanupLoading}
                  type="button"
                >
                  {cleanupLoading ? "Deleting..." : "Delete all drafts"}
                </button>
              </div>
              {draftsLoading ? (
                <div className="text-xs text-zinc-500">Loading drafts...</div>
              ) : myDrafts.length === 0 ? (
                <div className="text-xs text-zinc-500">No drafts found.</div>
              ) : (
                <div className="space-y-2">
                  {myDrafts.map((draft) => (
                    <button
                      key={draft.draftPath}
                      className="flex w-full items-center justify-between rounded-md border border-transparent px-2 py-1 text-left text-xs text-zinc-600 hover:border-zinc-200 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:border-zinc-800 dark:hover:bg-zinc-900"
                      onClick={() => handleSelectPath(draft.docPath)}
                      type="button"
                    >
                      <span className="truncate">{draft.docPath.replace(`${docsRoot}/`, "")}</span>
                      <span className="text-[10px] text-zinc-400">{formatRelativeTime(draft.updatedAt)}</span>
                    </button>
                  ))}
                </div>
              )}
              {cleanupMessage ? (
                <div className="mt-2 text-[11px] text-zinc-500">{cleanupMessage}</div>
              ) : null}
            </div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-zinc-500">Files</div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  onClick={() => setExpandAll((value) => !value)}
                  type="button"
                >
                  {expandAll ? "Collapse all" : "Expand all"}
                </button>
              </div>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  onClick={() => setShowCreateModal(true)}
                >
                  New file
                </button>
                <button
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  onClick={() => setRefreshKey((value) => value + 1)}
                >
                  Refresh
                </button>
                <button
                  className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
                  onClick={onDeleteSelected}
                  disabled={selectedFiles.size === 0 || saving}
                >
                  Delete
                </button>
              </div>
            <div className="mb-3">
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="Search files..."
                value={treeQuery}
                onChange={(event) => setTreeQuery(event.target.value)}
              />
            </div>
            <div className="mt-4 space-y-1 text-sm">
              {filteredTree.length === 0 ? (
                <div className="text-xs text-zinc-500">No files found.</div>
              ) : (
                <TreeView
                  nodes={filteredTree}
                  selectedPath={selectedPath}
                  onSelect={handleSelectPath}
                  defaultOpen={false}
                  expandAll={expandAll}
                  selectedFiles={selectedFiles}
                  onToggle={(path) => {
                    setSelectedFiles((prev) => {
                      const next = new Set(prev);
                      if (next.has(path)) {
                        next.delete(path);
                      } else {
                        next.add(path);
                      }
                      return next;
                    });
                  }}
                />
              )}
            </div>
          </aside>
          <CreateFileModal
            open={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onCreate={onCreateNew}
            createFolder={createFolder}
            setCreateFolder={setCreateFolder}
            docsRoot={docsRoot}
            tree={tree}
            parentFolder={parentFolder}
            setParentFolder={setParentFolder}
            folderName={folderName}
            setFolderName={setFolderName}
            fileName={fileName}
            setFileName={setFileName}
            existingPaths={existingPaths}
            computeTargetPath={computeTargetPath}
          />

          <section className="editor-panel editor-content">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-zinc-500">
                {selectedPath || "Select a file to start editing"}
                {selectedBreadcrumb.length ? (
                  <div className="text-xs text-zinc-400">
                    {selectedBreadcrumb.map((part, index) => (
                      <span key={`${part}-${index}`}>
                        {index > 0 ? " / " : ""}
                        {part}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="rounded-full border border-zinc-200 px-2 py-0.5 dark:border-zinc-700">
                    Save mode:{" "}
                    <button
                      className={`px-1 ${saveMode === "pr" ? "font-semibold text-zinc-900 dark:text-zinc-100" : ""}`}
                      onClick={() => setSaveMode("pr")}
                      type="button"
                    >
                      PR
                    </button>
                    /
                    <button
                      className={`px-1 ${saveMode === "draft" ? "font-semibold text-zinc-900 dark:text-zinc-100" : ""}`}
                      onClick={() => setSaveMode("draft")}
                      type="button"
                    >
                      Draft
                    </button>
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 ${
                      draftStatus === "Out of Date"
                        ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                        : draftStatus === "Conflicts"
                        ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200"
                        : draftStatus === "Checks Failing"
                        ? "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200"
                        : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                    }`}
                  >
                    {draftStatus}
                  </span>
                  <button
                    className="rounded-md border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    onClick={handleUpdateFromMain}
                    disabled={!draftId || saving}
                    type="button"
                  >
                    Update from main
                  </button>
                  {prInfo?.number ? (
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200">
                      PR #{prInfo.number} {prInfo.status ? `· ${prInfo.status}` : ""}
                    </span>
                  ) : null}
                  {prInfo?.url ? (
                    <a
                      className="text-blue-600 underline dark:text-blue-300"
                      href={prInfo.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Preview PR
                    </a>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  {hasUnsavedChanges ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">Unsaved changes</span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900">All changes saved</span>
                  )}
                  {lastSavedLabel ? <span>Autosaved {lastSavedLabel}</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                    value={statusValue}
                    onChange={(event) => {
                      const next = event.target.value;
                      setStatusValue(next);
                      if (next) {
                        setMarkdown((current) => normalizeStatusFrontmatter(current, next));
                      }
                    }}
                  >
                    <option value="" disabled>
                      Select status
                    </option>
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {STATUS_STYLES[option].label}
                      </option>
                    ))}
                  </select>
                  {statusValue ? (
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLES[statusValue].className}`}>
                      {STATUS_STYLES[statusValue].label}
                    </span>
                  ) : null}
                </div>
                <button
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                  onClick={onSave}
                  disabled={saving || loading || !selectedPath || !statusValue}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

          {validationError ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="mb-2 font-medium">Validation failed</div>
              <div className="mb-2">
                {validationError}
                {validationLocation.line ? (
                  <span className="ml-2 text-xs text-amber-800">
                    (line {validationLocation.line}
                    {validationLocation.column ? `, col ${validationLocation.column}` : ""})
                  </span>
                ) : null}
              </div>
              {validationError.includes("conflict markers") ? (
                <div className="mb-2 flex flex-wrap gap-2">
                  <button
                    className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-900 hover:bg-amber-100"
                    onClick={() => {
                      const next = resolveConflictMarkers(markdown, "ours");
                      setMarkdown(next);
                      setEditorKey(`${selectedPath}-resolved-${Date.now()}`);
                    }}
                    type="button"
                  >
                    Keep ours
                  </button>
                  <button
                    className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-900 hover:bg-amber-100"
                    onClick={() => {
                      const next = resolveConflictMarkers(markdown, "theirs");
                      setMarkdown(next);
                      setEditorKey(`${selectedPath}-resolved-${Date.now()}`);
                    }}
                    type="button"
                  >
                    Keep theirs
                  </button>
                  <button
                    className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-900 hover:bg-amber-100"
                    onClick={() => {
                      const next = resolveConflictMarkers(markdown, "both");
                      setMarkdown(next);
                      setEditorKey(`${selectedPath}-resolved-${Date.now()}`);
                    }}
                    type="button"
                  >
                    Keep both
                  </button>
                </div>
              ) : null}
              <button
                className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-900 hover:bg-amber-100"
                onClick={() => setShowRawContent((value) => !value)}
                type="button"
              >
                {showRawContent ? "Hide raw content" : "Show raw content"}
              </button>
            </div>
          ) : null}

          {showRawContent ? (
            <pre className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
              {markdown.split("\n").map((line, index) => {
                const lineNumber = index + 1;
                const isErrorLine = validationLocation.line === lineNumber;
                return (
                  <div
                    key={`line-${lineNumber}`}
                    className={`raw-line ${isErrorLine ? "raw-line-error" : ""}`}
                  >
                    <span className="raw-line-number">{lineNumber}</span>
                    <span className="raw-line-content">{line || " "}</span>
                  </div>
                );
              })}
            </pre>
          ) : null}

          {message ? <div className="text-sm text-zinc-500">{message}</div> : null}

          {loading ? (
            <div className="rounded-md border border-dashed border-zinc-300 p-8 text-sm text-zinc-500 dark:border-zinc-700">
              Loading document...
            </div>
          ) : (
            <>
              {conflictPayload ? (
                <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  <div className="mb-2 font-medium">Conflict detected.</div>
                  <div className="mb-3 text-xs text-rose-800">
                    {conflictPayload.instructions ?? "Resolve the conflict and save again."}
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <div className="mb-1 text-xs uppercase tracking-widest text-rose-700">Base</div>
                      <pre className="conflict-pane">{conflictPayload.baseContent}</pre>
                    </div>
                    <div>
                      <div className="mb-1 text-xs uppercase tracking-widest text-rose-700">Theirs</div>
                      <pre className="conflict-pane">{conflictPayload.theirsContent}</pre>
                    </div>
                    <div>
                      <div className="mb-1 text-xs uppercase tracking-widest text-rose-700">Ours</div>
                      <pre className="conflict-pane">{conflictPayload.oursContent}</pre>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 text-xs uppercase tracking-widest text-rose-700">Resolved</div>
                    <textarea
                      className="h-48 w-full rounded-md border border-rose-200 bg-white p-2 text-xs text-rose-900 font-mono"
                      value={resolvedContent}
                      onChange={(event) => setResolvedContent(event.target.value)}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="rounded-md bg-rose-600 px-3 py-1.5 text-xs text-white hover:bg-rose-700"
                      onClick={handleResolveSave}
                      type="button"
                    >
                      Save resolved
                    </button>
                    <button
                      className="rounded-md border border-rose-300 px-3 py-1.5 text-xs text-rose-900 hover:bg-rose-100"
                      onClick={() => setResolvedContent(conflictPayload.oursContent)}
                      type="button"
                    >
                      Use ours
                    </button>
                    <button
                      className="rounded-md border border-rose-300 px-3 py-1.5 text-xs text-rose-900 hover:bg-rose-100"
                      onClick={() => setResolvedContent(conflictPayload.theirsContent)}
                      type="button"
                    >
                      Use theirs
                    </button>
                    <button
                      className="rounded-md border border-rose-300 px-3 py-1.5 text-xs text-rose-900 hover:bg-rose-100"
                      onClick={() => setResolvedContent(conflictPayload.conflictMarkers ?? resolvedContent)}
                      type="button"
                    >
                      Use markers
                    </button>
                  </div>
                </div>
              ) : null}
              <MDXEditor
                key={editorKey}
                ref={editorRef}
                markdown={markdown}
                onChange={setMarkdown}
                contentEditableClassName="mdxeditor-content"
                plugins={plugins}
              />
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onPickImage}
          />
        </section>
      </div>
      )}
    </div>
  );
}

function CreateFileModal({
  open,
  onClose,
  onCreate,
  createFolder,
  setCreateFolder,
  docsRoot,
  tree,
  parentFolder,
  setParentFolder,
  folderName,
  setFolderName,
  fileName,
  setFileName,
  existingPaths,
  computeTargetPath,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: () => void;
  createFolder: boolean;
  setCreateFolder: (value: boolean) => void;
  docsRoot: string;
  tree: TreeNode[];
  parentFolder: string;
  setParentFolder: (value: string) => void;
  folderName: string;
  setFolderName: (value: string) => void;
  fileName: string;
  setFileName: (value: string) => void;
  existingPaths: Set<string>;
  computeTargetPath: (baseFolder: string, wantsFolder: boolean, folder: string, file: string) => string;
}) {
  if (!open) return null;

  const collectFolders = (nodes: TreeNode[], acc: string[] = []) => {
    for (const node of nodes) {
      if (node.type === "folder") {
        acc.push(node.path);
        if (node.children?.length) collectFolders(node.children, acc);
      }
    }
    return acc;
  };

  const folders = [docsRoot, ...collectFolders(tree)].filter(
    (value, index, self) => self.indexOf(value) === index
  );

  const previewPath = computeTargetPath(parentFolder, createFolder, folderName, fileName);
  const duplicatePath = previewPath ? existingPaths.has(previewPath) : false;
  const canCreate = Boolean(previewPath) && !duplicatePath;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New file</h2>
          <button
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-widest text-zinc-500">Location</label>
            <select
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              value={parentFolder || docsRoot}
              onChange={(event) => setParentFolder(event.target.value)}
            >
              {folders.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={createFolder}
              onChange={(event) => setCreateFolder(event.target.checked)}
            />
            Create folder
          </label>
          {createFolder ? (
            <div>
              <label className="mb-2 block text-xs uppercase tracking-widest text-zinc-500">Folder name</label>
              <input
                className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                placeholder="new-folder"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
              />
            </div>
          ) : null}
          <div>
            <label className="mb-2 block text-xs uppercase tracking-widest text-zinc-500">File name</label>
            <input
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              placeholder="new-file.mdx"
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
            />
            {createFolder ? (
              <p className="mt-2 text-xs text-zinc-500">
                Folders are created by saving a file inside them. Leave blank to create `index.mdx`.
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                onClick={() => setFileName("index.mdx")}
                type="button"
              >
                Use index.mdx
              </button>
              {previewPath ? (
                <span className="text-xs text-zinc-500">
                  Final path: <span className="font-mono">{previewPath}</span>
                </span>
              ) : (
                <span className="text-xs text-zinc-400">Preview will appear here.</span>
              )}
            </div>
            {duplicatePath ? (
              <div className="mt-2 text-xs text-red-600">A file already exists at that path.</div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
              onClick={onCreate}
              disabled={!canCreate}
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TreeView({
  nodes,
  selectedPath,
  onSelect,
  defaultOpen,
  expandAll,
  selectedFiles,
  onToggle,
}: {
  nodes: TreeNode[];
  selectedPath: string;
  onSelect: (path: string) => void;
  defaultOpen: boolean;
  expandAll: boolean;
  selectedFiles: Set<string>;
  onToggle: (path: string) => void;
}) {
  return (
    <ul className="tree-list">
      {nodes.map((node) => (
        <li key={node.path} className="tree-item">
          {node.type === "folder" ? (
            <details open={expandAll || defaultOpen} className="tree-folder">
              <summary className="tree-summary">
                <input
                  type="checkbox"
                  checked={selectedFiles.has(node.path)}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => onToggle(node.path)}
                />
                <span className="tree-caret" aria-hidden="true" />
                <span className="tree-label">{node.name}</span>
              </summary>
              <div className="tree-children">
                {node.children?.filter((child) => !(child.type === "file" && child.name.toLowerCase().startsWith("index."))).length ? (
                  <TreeView
                    nodes={node.children?.filter(
                      (child) => !(child.type === "file" && child.name.toLowerCase().startsWith("index."))
                    ) ?? []}
                    selectedPath={selectedPath}
                    onSelect={onSelect}
                    defaultOpen={defaultOpen}
                    expandAll={expandAll}
                    selectedFiles={selectedFiles}
                    onToggle={onToggle}
                  />
                ) : (
                  <div className="tree-empty">Empty</div>
                )}
              </div>
            </details>
          ) : (
            <div className="tree-row">
              <input
                type="checkbox"
                checked={selectedFiles.has(node.path)}
                onChange={() => onToggle(node.path)}
              />
              <button
                className={`tree-button ${
                  node.path === selectedPath ? "tree-selected" : ""
                }`}
                onClick={() => onSelect(node.path)}
              >
                <span className="tree-file-dot" aria-hidden="true" />
                <span className="tree-label">{node.name}</span>
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
