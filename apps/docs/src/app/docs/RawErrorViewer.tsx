"use client";

import { useState } from "react";

export default function RawErrorViewer({
  title,
  message,
  raw,
}: {
  title: string;
  message: string;
  raw: string;
}) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-900">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <p className="mb-3">{message}</p>
      <button
        className="rounded-md border border-red-300 px-3 py-1 text-xs text-red-900 hover:bg-red-100"
        onClick={() => setShowRaw((value) => !value)}
        type="button"
      >
        {showRaw ? "Hide raw content" : "Show raw content"}
      </button>
      {showRaw ? (
        <pre className="mt-3 whitespace-pre-wrap rounded-md border border-red-200 bg-white p-3 text-xs text-red-900">
          {raw}
        </pre>
      ) : null}
    </div>
  );
}
