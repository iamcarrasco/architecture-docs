export const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-amber-100 text-amber-900 border-amber-200",
  },
  review: {
    label: "In Review",
    className: "bg-blue-100 text-blue-900 border-blue-200",
  },
  approved: {
    label: "Approved",
    className: "bg-emerald-100 text-emerald-900 border-emerald-200",
  },
  decommissioned: {
    label: "Decommissioned",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
};

export const STATUS_OPTIONS = Object.keys(STATUS_STYLES);
