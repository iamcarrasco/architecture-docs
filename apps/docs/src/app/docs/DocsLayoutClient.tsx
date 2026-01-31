"use client";

import { useEffect, useState } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { Root } from "fumadocs-core/page-tree";
import { baseOptions } from "@/lib/layout.shared";

export default function DocsLayoutClient({
  tree,
  children,
}: {
  tree: Root;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <DocsLayout tree={tree} {...baseOptions}>
      {children}
    </DocsLayout>
  );
}
