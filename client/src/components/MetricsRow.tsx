import { CheckCircle2, ShieldCheck, Vault as VaultIcon } from "lucide-react";

interface MetricsRowProps {
  totalOwned: number;
  pendingGuardianApprovals: number;
  claimableVaults: number;
}

const metricStyles = [
  { icon: VaultIcon, background: "bg-indigo-50", color: "text-indigo-600" },
  { icon: ShieldCheck, background: "bg-amber-50", color: "text-amber-600" },
  { icon: CheckCircle2, background: "bg-emerald-50", color: "text-emerald-600" },
];

export default function MetricsRow({
  totalOwned,
  pendingGuardianApprovals,
  claimableVaults,
}: MetricsRowProps) {
  const metrics = [
    { label: "Total owned vaults", value: totalOwned, note: "Secured onchain" },
    {
      label: "Pending guardian votes",
      value: pendingGuardianApprovals,
      note: pendingGuardianApprovals ? "Needs your attention" : "All caught up",
    },
    {
      label: "Claimable inheritances",
      value: claimableVaults,
      note: claimableVaults ? "Ready to decrypt" : "No active claims",
    },
  ];

  return (
    <section className="grid gap-3 md:grid-cols-3">
      {metrics.map((metric, index) => {
        const style = metricStyles[index];
        const Icon = style.icon;
        return (
          <article
            key={metric.label}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div>
              <p className="text-sm font-medium text-slate-500">{metric.label}</p>
              <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-slate-950">
                {metric.value.toString().padStart(2, "0")}
              </p>
              <p className="mt-1 text-xs text-slate-400">{metric.note}</p>
            </div>
            <div
              className={`flex size-11 items-center justify-center rounded-xl ${style.background} ${style.color}`}
            >
              <Icon size={21} />
            </div>
          </article>
        );
      })}
    </section>
  );
}
