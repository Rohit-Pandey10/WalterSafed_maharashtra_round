import {
  Activity,
  Ban,
  Check,
  Clock3,
  Eye,
  FileKey,
  HeartPulse,
  KeyRound,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { UserRole, Vault, VaultStatus } from "../types";

interface VaultCardProps {
  vault: Vault;
  onAction: (
    vaultId: string,
    action: "ping" | "recover" | "cancel" | "attest" | "claim" | "view",
  ) => void;
  isTransacting?: boolean;
}

const statusStyles: Record<VaultStatus, string> = {
  Active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  InGracePeriod: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Approved: "bg-blue-50 text-blue-700 ring-blue-600/20",
  Claimed: "bg-violet-50 text-violet-700 ring-violet-600/20",
  Cancelled: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

const roleStyles: Record<UserRole, string> = {
  Owner: "bg-indigo-50 text-indigo-700",
  Guardian: "bg-cyan-50 text-cyan-700",
  Beneficiary: "bg-violet-50 text-violet-700",
};

const statusLabels: Record<VaultStatus, string> = {
  Active: "Active",
  InGracePeriod: "In grace period",
  Approved: "Release approved",
  Claimed: "Claimed",
  Cancelled: "Cancelled",
};

function formatAddress(address?: string) {
  if (!address) return "0x0000…0000";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function Button({
  children,
  onClick,
  variant = "secondary",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-600",
    secondary: "bg-white text-slate-700 hover:bg-slate-50 border-slate-300",
    danger: "bg-white text-rose-600 hover:bg-rose-50 border-rose-200",
  };

  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

export default function VaultCard({ vault, onAction, isTransacting = false }: VaultCardProps) {
  const approvals = vault.guardians.filter((guardian) => guardian.hasApproved).length;
  const quorum = Math.max(1, vault.quorum || 1);
  const quorumProgress = Math.min((approvals / quorum) * 100, 100);

  const heartbeatDate = new Date(vault.lastKnownHeartbeat);
  // Support intervals in seconds (e.g. 180s) or days
  const intervalInSec = vault.heartbeatInterval > 1000 ? vault.heartbeatInterval : vault.heartbeatInterval * 86400;
  const deadline = new Date(heartbeatDate.getTime() + intervalInSec * 1000);
  const diffSec = Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000));
  const daysRemaining = Math.max(0, Math.ceil(diffSec / 86400));

  const remainingLabel =
    intervalInSec <= 3600
      ? `${diffSec}s left`
      : `${daysRemaining} days left`;

  const isGuardianSigned =
    vault.role === "Guardian" && Boolean(vault.guardians[0]?.hasApproved);

  return (
    <article className="flex min-h-[400px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
            <FileKey size={19} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-semibold text-slate-950">
              {vault.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">
              {vault.description}
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${roleStyles[vault.role]}`}
        >
          {vault.role}
        </span>
      </div>

      <div className="mt-5 flex items-center justify-between border-y border-slate-100 py-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[vault.status]}`}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {statusLabels[vault.status]}
        </span>
        <span className="font-mono text-[11px] text-slate-400">ID {vault.id}</span>
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <Clock3 size={14} className="text-slate-400" />
            Heartbeat window
          </div>
          <span className="text-xs font-semibold text-slate-800">
            {vault.status === "Active" ? remainingLabel : statusLabels[vault.status]}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full ${
              vault.status === "InGracePeriod" ? "bg-amber-500" : "bg-indigo-500"
            }`}
            style={{
              width:
                vault.status === "InGracePeriod"
                  ? "100%"
                  : `${Math.max(10, Math.min(100, (diffSec / intervalInSec) * 100))}%`,
            }}
          />
        </div>
        <p className="mt-2.5 text-[11px] text-slate-400">
          Last signal {heartbeatDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {" · "}
          {vault.heartbeatInterval > 1000 ? `${vault.heartbeatInterval}s` : `${vault.heartbeatInterval}-day`} interval
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 font-medium text-slate-600">
              <Users size={14} className="text-slate-400" />
              Guardian quorum
            </span>
            <span className="font-semibold text-slate-800">
              {approvals} / {quorum} confirmed
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${quorumProgress}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-2 font-medium text-slate-600">
            <KeyRound size={14} className="text-slate-400" />
            Beneficiary
          </span>
          <code className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
            {formatAddress(vault.beneficiary)}
          </code>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {vault.role === "Owner" && (
          <>
            <Button
              disabled={isTransacting || vault.status === "Cancelled" || vault.status === "Claimed"}
              onClick={() => onAction(vault.id, "ping")}
            >
              <HeartPulse size={14} /> Ping heartbeat
            </Button>
            {vault.status === "InGracePeriod" && (
              <Button
                disabled={isTransacting}
                onClick={() => onAction(vault.id, "recover")}
                variant="primary"
              >
                <RotateCcw size={14} /> Recover
              </Button>
            )}
            <Button
              onClick={() => onAction(vault.id, "cancel")}
              variant="danger"
              disabled={isTransacting || vault.status === "Cancelled" || vault.status === "Claimed"}
            >
              <Ban size={14} /> Cancel
            </Button>
          </>
        )}

        {vault.role === "Guardian" && vault.status === "Active" && (
          <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Activity size={15} className="text-emerald-500" /> No action required
          </span>
        )}
        {vault.role === "Guardian" &&
          vault.status === "InGracePeriod" &&
          (isGuardianSigned ? (
            <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              <Check size={15} /> Vote recorded
            </span>
          ) : (
            <Button
              disabled={isTransacting}
              onClick={() => onAction(vault.id, "attest")}
              variant="primary"
            >
              <ShieldCheck size={14} /> Attest & approve release
            </Button>
          ))}
        {vault.role === "Guardian" &&
          !["Active", "InGracePeriod"].includes(vault.status) && (
            <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Check size={15} className="text-emerald-500" /> Guardian action complete
            </span>
          )}

        {vault.role === "Beneficiary" &&
          (vault.status === "Active" || vault.status === "InGracePeriod") && (
            <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <LockKeyhole size={14} /> Secret remains time-locked
            </span>
          )}
        {vault.role === "Beneficiary" && vault.status === "Approved" && (
          <Button
            disabled={isTransacting}
            onClick={() => onAction(vault.id, "claim")}
            variant="primary"
          >
            <KeyRound size={14} /> Claim & decrypt secret
          </Button>
        )}
        {vault.role === "Beneficiary" && vault.status === "Claimed" && (
          <Button onClick={() => onAction(vault.id, "view")} variant="primary">
            <Eye size={14} /> View secret payload
          </Button>
        )}
      </div>
    </article>
  );
}
