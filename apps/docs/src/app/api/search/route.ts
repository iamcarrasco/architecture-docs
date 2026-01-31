import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

export const runtime = "nodejs";

export const { GET } = createFromSource(source);
