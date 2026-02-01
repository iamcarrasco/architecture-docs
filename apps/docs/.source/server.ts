// @ts-nocheck
import * as __fd_glob_25 from "../content/docs/procedures/release-runbook.mdx?collection=docs"
import * as __fd_glob_24 from "../content/docs/procedures/index.mdx?collection=docs"
import * as __fd_glob_23 from "../content/docs/procedures/fiction-procedure-b.mdx?collection=docs"
import * as __fd_glob_22 from "../content/docs/procedures/fiction-procedure-a.mdx?collection=docs"
import * as __fd_glob_21 from "../content/docs/patterns/index.mdx?collection=docs"
import * as __fd_glob_20 from "../content/docs/patterns/fiction-pattern-b.mdx?collection=docs"
import * as __fd_glob_19 from "../content/docs/patterns/fiction-pattern-a.mdx?collection=docs"
import * as __fd_glob_18 from "../content/docs/patterns/cache-aside.mdx?collection=docs"
import * as __fd_glob_17 from "../content/docs/how-to/save-and-badges.mdx?collection=docs"
import * as __fd_glob_16 from "../content/docs/how-to/markdown-mermaid-raw.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/how-to/index.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/how-to/editor-options.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/diagrams/index.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/diagrams/fiction-diagram-b.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/diagrams/fiction-diagram-a.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/diagrams/data-flow.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/blueprints/system-context.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/blueprints/index.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/blueprints/fiction-blueprint-b.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/blueprints/fiction-blueprint-a.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/architecture/overview.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/architecture/index.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/architecture/fiction-architecture-b.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/architecture/fiction-architecture-a.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/architecture/adr-0001.mdx?collection=docs"
import * as __fd_glob_0 from "../content/docs/index.mdx?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {}, {"index.mdx": __fd_glob_0, "architecture/adr-0001.mdx": __fd_glob_1, "architecture/fiction-architecture-a.mdx": __fd_glob_2, "architecture/fiction-architecture-b.mdx": __fd_glob_3, "architecture/index.mdx": __fd_glob_4, "architecture/overview.mdx": __fd_glob_5, "blueprints/fiction-blueprint-a.mdx": __fd_glob_6, "blueprints/fiction-blueprint-b.mdx": __fd_glob_7, "blueprints/index.mdx": __fd_glob_8, "blueprints/system-context.mdx": __fd_glob_9, "diagrams/data-flow.mdx": __fd_glob_10, "diagrams/fiction-diagram-a.mdx": __fd_glob_11, "diagrams/fiction-diagram-b.mdx": __fd_glob_12, "diagrams/index.mdx": __fd_glob_13, "how-to/editor-options.mdx": __fd_glob_14, "how-to/index.mdx": __fd_glob_15, "how-to/markdown-mermaid-raw.mdx": __fd_glob_16, "how-to/save-and-badges.mdx": __fd_glob_17, "patterns/cache-aside.mdx": __fd_glob_18, "patterns/fiction-pattern-a.mdx": __fd_glob_19, "patterns/fiction-pattern-b.mdx": __fd_glob_20, "patterns/index.mdx": __fd_glob_21, "procedures/fiction-procedure-a.mdx": __fd_glob_22, "procedures/fiction-procedure-b.mdx": __fd_glob_23, "procedures/index.mdx": __fd_glob_24, "procedures/release-runbook.mdx": __fd_glob_25, });