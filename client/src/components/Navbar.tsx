import { CircleDot, KeyRound, Plus, Wallet } from "lucide-react";

export type RoleFilter = "all" | "owner" | "guardian" | "beneficiary";

interface NavbarProps {
  activeFilter: RoleFilter;
  connected: boolean;
  account?: string | null;
  chainId?: number | null;
  isCorrectNetwork?: boolean;
  onFilterChange: (filter: RoleFilter) => void;
  onCreate: () => void;
  onConnect: () => void;
}

const filters: { label: string; value: RoleFilter }[] = [
  { label: "All vaults", value: "all" },
  { label: "My vaults", value: "owner" },
  { label: "Guardian requests", value: "guardian" },
  { label: "Beneficiary claims", value: "beneficiary" },
];

function formatAddress(address?: string | null) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function Navbar({
  activeFilter,
  connected,
  account,
  chainId,
  isCorrectNetwork = true,
  onFilterChange,
  onCreate,
  onConnect,
}: NavbarProps) {
  const networkName =
    chainId === 11155111
      ? "Sepolia Testnet"
      : chainId === 31337 || chainId === 1337
      ? "Local Hardhat node"
      : connected
      ? `Chain #${chainId || "Unknown"}`
      : "Local Anvil / Hardhat";

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-5 py-4 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
              <KeyRound size={20} strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-display text-[17px] font-semibold tracking-tight text-slate-950">
                  Heirloom Protocol
                </p>
                <span className="hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:inline">
                  {chainId === 11155111 ? "Sepolia" : "Testnet"}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <CircleDot
                  size={11}
                  className={
                    !isCorrectNetwork
                      ? "fill-rose-500 text-rose-500"
                      : connected
                      ? "fill-emerald-500 text-emerald-500"
                      : "fill-amber-500 text-amber-500"
                  }
                />
                {!isCorrectNetwork ? "Wrong Network" : networkName}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onCreate}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <Plus size={17} />
              <span className="hidden sm:inline">Create vault</span>
            </button>
            <button
              onClick={onConnect}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <Wallet size={16} />
              <span className="hidden sm:inline">
                {connected && account ? formatAddress(account) : "Connect wallet"}
              </span>
              <span className="sm:hidden">
                {connected && account ? formatAddress(account) : "Connect"}
              </span>
            </button>
          </div>
        </div>

        <nav className="hide-scrollbar -mx-1 flex overflow-x-auto rounded-xl bg-slate-100 p-1 lg:mx-0 lg:w-fit">
          {filters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => onFilterChange(filter.value)}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                activeFilter === filter.value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
