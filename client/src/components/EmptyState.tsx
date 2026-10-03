import { Archive } from "lucide-react";

export default function EmptyState() {
  return (
    <div className="col-span-full flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        <Archive size={22} />
      </div>
      <h3 className="mt-4 font-display text-base font-semibold text-slate-800">No vaults in this view</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Switch roles or create a new vault to begin securing an inheritance.
      </p>
    </div>
  );
}
