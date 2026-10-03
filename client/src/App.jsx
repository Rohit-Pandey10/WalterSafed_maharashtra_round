import { FlaskConical, SlidersHorizontal, RefreshCw } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import axios from "axios";
import CreateVaultModal from "./components/CreateVaultModal";
import EmptyState from "./components/EmptyState";
import MetricsRow from "./components/MetricsRow";
import Navbar from "./components/Navbar";
import SecretPayloadViewer from "./components/SecretPayloadViewer";
import Toast from "./components/Toast";
import VaultCard from "./components/VaultCard";
import { useWallet } from "./context/WalletContext.jsx";
import { useHeirloomVault } from "./hooks/useHeirloomVault.js";
import { useDashboardData } from "./hooks/useDashboardData.js";

const roles = ["Owner", "Guardian", "Beneficiary"];
const statuses = [
  "Active",
  "InGracePeriod",
  "Approved",
  "Claimed",
  "Cancelled",
];

const apiRequest = async (method, path, body = null) => {
  const ports = ["5001", "5000"];
  let lastErr = null;
  for (const port of ports) {
    try {
      const url = `http://localhost:${port}${path}`;
      const res = await axios({ method, url, data: body, timeout: 6000 });
      if (res.data) return res.data;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
};

const formatVaultItem = (v, currentAddr, forcedRole = null) => {
  let role = forcedRole;
  if (!role) {
    const lowerOwner = (v.ownerAddress || "").toLowerCase();
    const lowerBeneficiary = (v.beneficiaryAddress || "").toLowerCase();
    const lowerGuardians = (v.guardians || []).map((g) =>
      typeof g === "string" ? g.toLowerCase() : ""
    );
    const lowerCurr = currentAddr.toLowerCase();

    if (lowerOwner === lowerCurr) {
      role = "Owner";
    } else if (lowerBeneficiary === lowerCurr) {
      role = "Beneficiary";
    } else if (lowerGuardians.includes(lowerCurr)) {
      role = "Guardian";
    } else {
      role = "Owner";
    }
  }

  const threshold = v.guardianThreshold || 1;
  const approvalsCount = typeof v.approvalsCount === 'number'
    ? v.approvalsCount
    : (v.status === 'Approved' || v.status === 'Claimed')
    ? threshold
    : 0;

  return {
    id: `HLM-${v.vaultId || v._id}`,
    numericId: v.vaultId,
    title: v.title || "Inheritance Vault",
    description: v.description || "",
    role: role,
    status: v.status || "Active",
    owner: v.ownerAddress,
    beneficiary: v.beneficiaryAddress,
    lastKnownHeartbeat:
      v.lastKnownHeartbeat || v.createdAt || new Date().toISOString(),
    heartbeatInterval: v.heartbeatInterval || 180,
    guardians: (v.guardians || []).map((addr, idx) => ({
      address: typeof addr === 'string' ? addr : addr.address,
      hasApproved: idx < approvalsCount,
    })),
    quorum: threshold,
    guardianThreshold: threshold,
    approvalsCount: approvalsCount,
    ipfsCid: v.ipfsHash,
    secretPayload: "",
  };
};

export default function App() {
  const {
    account,
    isConnected,
    chainId,
    isCorrectNetwork,
    connectWallet,
    disconnectWallet,
  } = useWallet();
  const { pingHeartbeat, attestVault, claimVault, cancelVault, getVault, isTransacting } =
    useHeirloomVault();
  const {
    data: dashboardData,
    allVaults,
    refresh: refreshDashboard,
    loading: dashboardLoading,
    activeAddress,
  } = useDashboardData();

  const [vaults, setVaults] = useState([]);
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [secretVault, setSecretVault] = useState(null);
  const [toast, setToast] = useState(null);
  const [optimisticUpdates, setOptimisticUpdates] = useState({});

  const notify = (message, type = "confirmed") => {
    const id = Date.now();
    setToast({ id, message, type });
    window.setTimeout(
      () => setToast((current) => (current?.id === id ? null : current)),
      3200
    );
  };

  const applyOptimisticUpdate = (numericId, updates) => {
    setOptimisticUpdates((prev) => ({
      ...prev,
      [numericId]: { ...(prev[numericId] || {}), ...updates },
    }));
    setVaults((prev) =>
      prev.map((v) => (v.numericId === numericId ? { ...v, ...updates } : v))
    );
  };

  // Convert real MongoDB records from dashboardData into UI Vault items
  useEffect(() => {
    if (dashboardData) {
      const liveList = [];
      const currentAddress = activeAddress.toLowerCase();

      // 1. Owned Vaults
      (dashboardData.ownedVaults || []).forEach((v) => {
        liveList.push(formatVaultItem(v, currentAddress, "Owner"));
      });

      // 2. Guardian Vaults
      (dashboardData.guardianVaults || []).forEach((v) => {
        if (!liveList.some((existing) => existing.numericId === v.vaultId)) {
          liveList.push(formatVaultItem(v, currentAddress, "Guardian"));
        }
      });

      // 3. Beneficiary Vaults
      (dashboardData.beneficiaryVaults || []).forEach((v) => {
        if (!liveList.some((existing) => existing.numericId === v.vaultId)) {
          liveList.push(formatVaultItem(v, currentAddress, "Beneficiary"));
        }
      });

      setVaults(liveList);
    }
  }, [dashboardData, activeAddress]);

  // Global "All Vaults" view vs Role-Filtered View
  const visibleVaults = useMemo(() => {
    const currentAddr = activeAddress.toLowerCase();

    let list = [];
    if (filter === "all") {
      if (allVaults && allVaults.length > 0) {
        list = allVaults.map((v) => formatVaultItem(v, currentAddr));
      } else {
        list = vaults;
      }
    } else if (filter === "owner") {
      list = (dashboardData?.ownedVaults || []).map((v) =>
        formatVaultItem(v, currentAddr, "Owner")
      );
    } else if (filter === "guardian") {
      list = (dashboardData?.guardianVaults || []).map((v) =>
        formatVaultItem(v, currentAddr, "Guardian")
      );
    } else if (filter === "beneficiary") {
      list = (dashboardData?.beneficiaryVaults || []).map((v) =>
        formatVaultItem(v, currentAddr, "Beneficiary")
      );
    } else {
      list = vaults;
    }

    // Apply any pending optimistic updates so UI reflects confirmed on-chain reality
    return list.map((item) => {
      const pending = optimisticUpdates[item.numericId];
      if (pending) {
        return { ...item, ...pending };
      }
      return item;
    });
  }, [filter, allVaults, vaults, dashboardData, activeAddress, optimisticUpdates]);

  // Scenario lab toggle for the first vault
  function updateDemo(field, value) {
    const target = visibleVaults[0] || vaults[0];
    if (target?.numericId) {
      applyOptimisticUpdate(target.numericId, { [field]: value });
    } else {
      setVaults((current) =>
        current.map((vault, index) =>
          index === 0 ? { ...vault, [field]: value } : vault
        )
      );
    }
  }

  // Handle all vault actions (Decoupled on-chain execution + independent MongoDB sync)
  async function handleAction(vaultId, action) {
    const vault = visibleVaults.find((item) => item.id === vaultId) || vaults.find((item) => item.id === vaultId);
    if (!vault) return;

    if (action === "view") {
      setSecretVault(vault);
      return;
    }

    const numericId =
      vault.numericId || parseInt(vault.id.replace("HLM-", ""), 10);

    if (!isConnected || !numericId) {
      notify("Wallet must be connected to execute this on-chain transaction.", "failed");
      return;
    }

    if (action === "ping" || action === "recover") {
      // 1. Execute smart contract action and await receipt
      notify("Submitting heartbeat transaction on-chain...", "pending");
      let receipt;
      try {
        const res = await pingHeartbeat(numericId);
        receipt = res?.receipt;
        if (!receipt || receipt.status !== 1) {
          throw new Error("Transaction failed on blockchain.");
        }
      } catch (txErr) {
        console.error("Heartbeat transaction failed on blockchain:", txErr);
        notify(txErr?.message || "Transaction failed on blockchain.", "failed");
        return;
      }

      // 2. Blockchain action is CONFIRMED — notify user immediately
      notify("Transaction confirmed on-chain!", "success");

      // Optimistically update local vault state
      const nowIso = new Date().toISOString();
      applyOptimisticUpdate(numericId, {
        status: "Active",
        lastKnownHeartbeat: nowIso,
      });

      // 3. Attempt DB sync independently without catching/aborting on-chain success
      try {
        await apiRequest("patch", `/api/v1/vaults/${numericId}/sync`, {
          status: "Active",
          lastKnownHeartbeat: nowIso,
        });
        await refreshDashboard();
      } catch (syncErr) {
        console.warn("MongoDB indexing delayed/failed:", syncErr);
        notify("Blockchain updated successfully. Database index sync pending.", "warning");
      }
    } else if (action === "attest") {
      // 1. Execute smart contract action and await receipt
      notify("Submitting guardian attestation on-chain...", "pending");
      let receipt;
      try {
        const res = await attestVault(numericId);
        receipt = res?.receipt;
        if (!receipt || receipt.status !== 1) {
          throw new Error("Transaction failed on blockchain.");
        }
      } catch (txErr) {
        console.error("Guardian attestation transaction failed on blockchain:", txErr);
        notify(txErr?.message || "Transaction failed on blockchain.", "failed");
        return;
      }

      // 2. Fetch actual on-chain state via contract.getVault(numericId)
      // NEVER infer new approvalsCount or status from MongoDB state
      let onchainVault = null;
      try {
        onchainVault = await getVault(numericId);
      } catch (queryErr) {
        console.warn("Could not query on-chain status after attest:", queryErr?.message || queryErr);
      }

      if (onchainVault) {
        const STATUS_MAP = ["Active", "InGracePeriod", "Approved", "Claimed", "Cancelled"];
        const onchainStatus = STATUS_MAP[Number(onchainVault.status)] || "InGracePeriod";
        const onchainApprovals = Number(onchainVault.approvalsCount);

        // Update local state strictly using actual verified on-chain values
        applyOptimisticUpdate(numericId, {
          status: onchainStatus,
          approvalsCount: onchainApprovals,
          guardians: (vault.guardians || []).map((g) =>
            g.address.toLowerCase() === (account || "").toLowerCase()
              ? { ...g, hasApproved: true }
              : g
          ),
        });

        notify("Transaction confirmed on-chain!", "success");

        // 3. Attempt DB sync independently without catching/aborting on-chain success
        try {
          await apiRequest("patch", `/api/v1/vaults/${numericId}/sync`, {
            status: onchainStatus,
            approvalsCount: onchainApprovals,
          });
          await refreshDashboard();
        } catch (syncErr) {
          console.warn("MongoDB indexing delayed/failed:", syncErr);
          notify("Blockchain updated successfully. Database index sync pending.", "warning");
        }
      } else {
        // Post-transaction blockchain read failed:
        // Do NOT calculate approvalsCount from MongoDB, do NOT infer status. Keep last known state.
        notify(
          "Transaction confirmed on-chain! Latest vault state could not be read from blockchain. State sync pending.",
          "warning"
        );

        // Attempt background sync/retry with backend indexer
        try {
          await apiRequest("patch", `/api/v1/vaults/${numericId}/sync`, {});
          await refreshDashboard();
        } catch (syncErr) {
          console.warn("MongoDB indexing delayed/failed after post-attest read failure:", syncErr);
        }
      }
    } else if (action === "claim") {
      // 1. Execute smart contract action and await receipt
      notify("Submitting beneficiary claim on-chain...", "pending");
      let receipt;
      try {
        const res = await claimVault(numericId);
        receipt = res?.receipt;
        if (!receipt || receipt.status !== 1) {
          throw new Error("Transaction failed on blockchain.");
        }
      } catch (txErr) {
        console.error("Claim transaction failed on blockchain:", txErr);
        notify(txErr?.message || "Transaction failed on blockchain.", "failed");
        return;
      }

      // 2. Blockchain action is CONFIRMED — notify user immediately
      notify("Transaction confirmed on-chain!", "success");

      // Optimistically update local vault state and open secret payload viewer
      const claimedVault = { ...vault, status: "Claimed" };
      applyOptimisticUpdate(numericId, { status: "Claimed" });
      setSecretVault(claimedVault);

      // 3. Attempt DB sync independently without catching/aborting on-chain success
      try {
        await apiRequest("patch", `/api/v1/vaults/${numericId}/sync`, {
          status: "Claimed",
        });
        await refreshDashboard();
      } catch (syncErr) {
        console.warn("MongoDB indexing delayed/failed:", syncErr);
        notify("Blockchain updated successfully. Database index sync pending.", "warning");
      }
    } else if (action === "cancel") {
      // 1. Execute smart contract action and await receipt
      notify("Initiating on-chain vault cancellation...", "pending");
      let receipt;
      try {
        const res = await cancelVault(numericId);
        receipt = res?.receipt;
        if (!receipt || receipt.status !== 1) {
          throw new Error("Transaction failed on blockchain.");
        }
      } catch (txErr) {
        console.error("Cancellation transaction failed on blockchain:", txErr);
        notify(txErr?.message || "Transaction failed on blockchain.", "failed");
        return;
      }

      // 2. Blockchain action is CONFIRMED — notify user immediately
      notify("Transaction confirmed on-chain!", "success");

      // Optimistically update local vault state
      applyOptimisticUpdate(numericId, { status: "Cancelled" });

      // 3. Attempt DB sync independently without catching/aborting on-chain success
      try {
        await apiRequest("patch", `/api/v1/vaults/${numericId}/sync`, {
          status: "Cancelled",
        });
        await refreshDashboard();
      } catch (syncErr) {
        console.warn("MongoDB indexing delayed/failed:", syncErr);
        notify("Blockchain updated successfully. Database index sync pending.", "warning");
      }
    }
  }

  const firstVault = visibleVaults[0] || vaults[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Navbar
        activeFilter={filter}
        connected={isConnected}
        account={account}
        chainId={chainId}
        isCorrectNetwork={isCorrectNetwork}
        onFilterChange={setFilter}
        onCreate={() => setCreateOpen(true)}
        onConnect={async () => {
          if (isConnected) {
            disconnectWallet();
            notify("Wallet disconnected");
          } else {
            try {
              const connectedAccount = await connectWallet();
              notify(
                `Connected: ${connectedAccount.slice(0, 6)}…${connectedAccount.slice(-4)}`
              );
            } catch (e) {
              notify(e.message || "Failed to connect wallet", "failed");
            }
          }
        }}
      />

      <main className="mx-auto max-w-[1440px] px-5 py-7 lg:px-8 lg:py-9">
        <div className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
              <span className="h-px w-5 bg-indigo-400" /> Trust-minimized inheritance
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Your inheritance vaults
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Monitor heartbeats, coordinate guardians, and release encrypted assets with
              verifiable on-chain rules.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgb(236,253,245)]" />
            MongoDB Synced
            <span className="text-slate-300">·</span>
            {isConnected
              ? chainId === 11155111
                ? "Sepolia Testnet"
                : "Local Hardhat"
              : "Demo Wallet Active"}
          </div>
        </div>

        <MetricsRow
          totalOwned={
            dashboardData?.summary?.totalOwned ??
            allVaults.length ??
            vaults.length
          }
          pendingGuardianApprovals={
            dashboardData?.summary?.pendingGuardianApprovals ??
            allVaults.filter((v) => v.status === "InGracePeriod").length
          }
          claimableVaults={
            dashboardData?.summary?.claimableVaults ??
            allVaults.filter((v) => v.status === "Approved").length
          }
        />

        {firstVault && (
          <section className="mt-7 flex flex-col gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm">
                <FlaskConical size={17} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Scenario lab</p>
                <p className="text-xs text-slate-500">
                  Simulate states & test roles on vault #
                  {firstVault.numericId || firstVault.id}.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SlidersHorizontal
                size={15}
                className="hidden text-slate-400 sm:block"
              />
              <select
                aria-label="Demo role"
                value={firstVault.role}
                onChange={(event) => updateDemo("role", event.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {roles.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
              <select
                aria-label="Demo status"
                value={firstVault.status}
                onChange={(event) => updateDemo("status", event.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>
          </section>
        )}

        <div className="mt-7 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {filter === "all"
                ? "All protocol vaults"
                : `${filter[0].toUpperCase()}${filter.slice(1)} view`}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {visibleVaults.length}{" "}
              {visibleVaults.length === 1 ? "vault" : "vaults"}{" "}
              {filter === "all" ? "across protocol" : "matching role"}
            </p>
          </div>
          <button
            onClick={() => {
              refreshDashboard();
              notify("Vault data refreshed from MongoDB");
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            <RefreshCw
              size={13}
              className={dashboardLoading ? "animate-spin" : ""}
            />
            Refresh data
          </button>
        </div>

        <section className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {visibleVaults.length ? (
            visibleVaults.map((vault) => (
              <VaultCard
                key={vault.id}
                vault={vault}
                onAction={handleAction}
                isTransacting={isTransacting}
                account={account}
              />
            ))
          ) : dashboardLoading ? (
            <div className="col-span-full flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">
              Loading vaults from MongoDB...
            </div>
          ) : (
            <EmptyState />
          )}
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-5 py-5 text-center text-xs text-slate-400">
        Heirloom Protocol · Non-custodial by design · Persistent MongoDB & IPFS Architecture
      </footer>

      <CreateVaultModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={(created) => {
          notify(
            `Vault #${created.vaultId} encrypted, pinned & saved to MongoDB!`
          );
        }}
      />
      <SecretPayloadViewer
        vault={secretVault}
        onClose={() => setSecretVault(null)}
      />
      <Toast toast={toast} />
    </div>
  );
}
