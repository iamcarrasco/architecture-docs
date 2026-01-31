import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { notFound } from "next/navigation";
import { getRuntimeDoc } from "@/lib/runtime-docs";
import { STATUS_STYLES } from "@/lib/status";

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const doc = await getRuntimeDoc(params.slug);

  if (!doc) {
    notFound();
  }

  const MDXContent = doc.body;

  return (
    <DocsPage toc={doc.toc}>
      <div className="flex flex-wrap items-center gap-2">
        <DocsTitle>{doc.title}</DocsTitle>
        {doc.status && STATUS_STYLES[doc.status] ? (
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLES[doc.status].className}`}
          >
            {STATUS_STYLES[doc.status].label}
          </span>
        ) : null}
      </div>
      {doc.description ? <DocsDescription>{doc.description}</DocsDescription> : null}
      <DocsBody>
        <MDXContent />
      </DocsBody>
    </DocsPage>
  );
}
