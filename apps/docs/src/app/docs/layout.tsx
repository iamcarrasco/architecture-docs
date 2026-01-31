import { getRuntimeRoot } from "@/lib/runtime-docs";
import DocsLayoutClient from "./DocsLayoutClient";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const tree = await getRuntimeRoot();
  return (
    <DocsLayoutClient tree={tree}>{children}</DocsLayoutClient>
  );
}
