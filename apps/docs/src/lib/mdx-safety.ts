type MdxJsxNode = {
  type: "mdxJsxFlowElement" | "mdxJsxTextElement";
  name?: string | null;
  children?: any[];
};

type MdxNode = {
  type: string;
  children?: any[];
};

const DEFAULT_ALLOWED_COMPONENTS = new Set([
  "a",
  "p",
  "strong",
  "em",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
  "hr",
  "br",
]);

const isMdxJsxNode = (node: MdxNode): node is MdxJsxNode => {
  return node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement";
};

const visit = (node: MdxNode, fn: (n: MdxNode) => void) => {
  fn(node);
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      visit(child, fn);
    }
  }
};

export const createMdxSafetyPlugin = (allowedComponents?: string[]) => {
  const allow = new Set(allowedComponents ?? Array.from(DEFAULT_ALLOWED_COMPONENTS));
  return () => (tree: MdxNode) => {
    visit(tree, (node) => {
      if (node.type === "mdxjsEsm") {
        throw new Error("MDX import/export is not allowed.");
      }
      if (node.type === "mdxFlowExpression" || node.type === "mdxTextExpression") {
        throw new Error("MDX expressions are not allowed.");
      }
      if (isMdxJsxNode(node)) {
        const name = node.name ?? "";
        if (!allow.has(name)) {
          throw new Error(`MDX component not allowed: ${name || "<anonymous>"}`);
        }
      }
    });
  };
};
