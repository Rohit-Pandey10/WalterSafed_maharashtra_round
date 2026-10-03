import { AlertCircle, AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react";
import type { ToastState } from "../types";

export default function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  const config = {
    pending: { icon: LoaderCircle, color: "text-indigo-600", className: "animate-spin" },
    confirmed: { icon: CheckCircle2, color: "text-emerald-600", className: "" },
    success: { icon: CheckCircle2, color: "text-emerald-600", className: "" },
    warning: { icon: AlertTriangle, color: "text-amber-500", className: "" },
    failed: { icon: AlertCircle, color: "text-rose-600", className: "" },
  }[toast.type] || { icon: CheckCircle2, color: "text-emerald-600", className: "" };
  const Icon = config.icon;

  return (
    <div className="fixed bottom-5 left-1/2 z-[60] flex min-w-72 -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-xl">
      <Icon size={18} className={`${config.color} ${config.className}`} />
      {toast.message}
    </div>
  );
}
