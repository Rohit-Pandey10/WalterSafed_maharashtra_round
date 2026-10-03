import { Key, Plus, Shield, Trash2, X, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import axios from "axios";
import { useWallet } from "../context/WalletContext.jsx";
import { useHeirloomVault } from "../hooks/useHeirloomVault.js";
import { useDashboardData, FALLBACK_DEMO_ADDRESS } from "../hooks/useDashboardData.js";
import { encryptPayload } from "../utils/crypto.js";

export interface CreateVaultInput {
  title: string;
  description: string;
  secretPayload: string;
  passphrase?: string;
  beneficiary: string;
  heartbeatInterval: number;
  guardians: string[];
  quorum: number;
}

interface CreateVaultModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (vault: any) => void;
  onSubmit?: (input: CreateVaultInput) => Promise<void> | void;
  isSubmitting?: boolean;
}

const blankGuardian = "";

const apiPost = async (path: string, body: any) => {
  const ports = ["5001", "5000"];
  let lastErr = null;
  for (const port of ports) {
    try {
      const res = await axios.post(`http://localhost:${port}${path}`, body, {
        timeout: 8000,
      });
      if (res.data) return res.data;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
};

export default function CreateVaultModal({
  open,
  onClose,
  onSuccess,
  onSubmit,
}: CreateVaultModalProps) {
  const { account, isConnected } = useWallet();
  const { createVault: contractCreateVault } = useHeirloomVault();
  const { refresh } = useDashboardData();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [secretPayload, setSecretPayload] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [interval, setInterval] = useState("180");
  const [customInterval, setCustomInterval] = useState(180);
  const [guardians, setGuardians] = useState([
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  ]);
  const [quorum, setQuorum] = useState(1);
  const [loadingStep, setLoadingStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const isSubmitting = Boolean(loadingStep);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    const validGuardians = guardians
      .map((g) => g.trim())
      .filter((g) => g.length > 0);

    if (validGuardians.length === 0) {
      setError("At least one guardian address is required.");
      return;
    }

    let numericInterval = 180;
    if (interval === "custom") {
      numericInterval = Math.floor(Number(customInterval));
    } else if (interval === "30_days" || interval === "2592000") {
      numericInterval = 30 * 86400; // 2592000 seconds
    } else if (interval === "90_days" || interval === "7776000") {
      numericInterval = 90 * 86400; // 7776000 seconds
    } else if (interval === "180_days" || interval === "15552000") {
      numericInterval = 180 * 86400; // 15552000 seconds
    } else if (interval === "365_days" || interval === "31536000") {
      numericInterval = 365 * 86400; // 31536000 seconds
    } else if (interval === "180" || interval === "demo") {
      numericInterval = 180;
    } else {
      const parsed = Math.floor(Number(interval));
      numericInterval = isNaN(parsed) || parsed <= 0 ? 180 : parsed;
    }

    const vaultTitle = title.trim() || "Family recovery plan";
    const vaultDesc = description.trim() || "A newly secured inheritance vault.";
    const beneficiaryAddr =
      beneficiary.trim() || "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
    const userPassphrase =
      passphrase.trim() || "heirloom-default-passphrase-2026";
    const rawSecret =
      secretPayload.trim() || "Heirloom secret inheritance payload";

    try {
      // 1. Client-Side Web Crypto AES-GCM-256 Encryption
      setLoadingStep("Encrypting payload client-side (AES-GCM-256)...");
      const encryptedPackage = await encryptPayload(rawSecret, userPassphrase);

      // 2. Pin encrypted envelope to IPFS via backend storage proxy
      setLoadingStep("Uploading encrypted envelope to IPFS...");
      const pinResponse = await apiPost("/api/v1/vaults/pin", {
        encryptedData: encryptedPackage,
        metadata: {
          title: vaultTitle,
          owner: account || FALLBACK_DEMO_ADDRESS,
        },
      });

      const ipfsHash =
        pinResponse.data?.ipfsHash || `bafkreimock${Date.now()}`;

      // 3. Smart Contract Deployment (Blockchain is Single Source of Truth)
      let newVaultId: number | null = null;
      let txHash: string | undefined = undefined;

      const isDemoExplicit =
        import.meta.env.VITE_ENABLE_DEMO === "true" ||
        (typeof window !== "undefined" &&
          window.localStorage.getItem("heirloom_demo_mode") === "true");

      if (isConnected) {
        setLoadingStep("Deploying vault to Ethereum smart contract...");
        try {
          const txRes = await contractCreateVault(
            beneficiaryAddr,
            numericInterval,
            validGuardians,
            quorum,
            ipfsHash
          );

          if (!txRes?.receipt || txRes.receipt.status !== 1 || !txRes.vaultId) {
            throw new Error("On-chain vault deployment failed. Aborting.");
          }

          newVaultId = Number(txRes.vaultId);
          txHash = txRes.txHash;
        } catch (contractErr: any) {
          console.error("On-chain contract deployment failed:", contractErr);
          const failureMsg = "On-chain vault deployment failed. Aborting.";
          setError(failureMsg);
          throw new Error(failureMsg);
        }
      } else {
        if (isDemoExplicit) {
          newVaultId = 9999;
        } else {
          const noWalletMsg =
            "Wallet not connected. Connect MetaMask to deploy on-chain.";
          setError(noWalletMsg);
          throw new Error(noWalletMsg);
        }
      }

      if (!newVaultId) {
        throw new Error("On-chain vault deployment failed. Aborting.");
      }

      // 4. Save permanently into MongoDB via /api/v1/vaults/index ONLY after verified on-chain confirmation
      setLoadingStep("Saving vault record into MongoDB database...");
      const ownerAddress = account || FALLBACK_DEMO_ADDRESS;
      const indexResult = await apiPost("/api/v1/vaults/index", {
        vaultId: newVaultId,
        ownerAddress: ownerAddress.toLowerCase(),
        beneficiaryAddress: beneficiaryAddr.toLowerCase(),
        guardians: validGuardians.map((g) => g.toLowerCase()),
        guardianThreshold: quorum,
        title: vaultTitle,
        description: vaultDesc,
        ipfsHash: ipfsHash,
        heartbeatInterval: numericInterval,
        lastKnownHeartbeat: Date.now(),
        status: "Active",
        txHash,
      });

      // 5. Trigger live re-fetch from MongoDB
      await refresh();

      if (onSuccess) {
        onSuccess(indexResult.data);
      } else if (onSubmit) {
        await onSubmit({
          title: vaultTitle,
          description: vaultDesc,
          secretPayload: rawSecret,
          passphrase: userPassphrase,
          beneficiary: beneficiaryAddr,
          heartbeatInterval: numericInterval,
          guardians: validGuardians,
          quorum,
        });
      }

      // Reset form & close
      setTitle("");
      setDescription("");
      setSecretPayload("");
      setPassphrase("");
      setBeneficiary("");
      onClose();
    } catch (err: any) {
      console.error("Vault creation error:", err);
      setError(err.message || "Failed to create and persist vault.");
    } finally {
      setLoadingStep(null);
    }
  }

  function updateGuardian(index: number, value: string) {
    setGuardians((current) =>
      current.map((guardian, i) => (i === index ? value : guardian))
    );
  }

  function removeGuardian(index: number) {
    setGuardians((current) => {
      const next = current.filter((_, i) => i !== index);
      setQuorum((value) => Math.min(value, Math.max(1, next.length)));
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-500/20 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(event) =>
        !isSubmitting && event.target === event.currentTarget && onClose()
      }
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-vault-title"
        className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <h2
              id="create-vault-title"
              className="font-display text-xl font-semibold text-slate-950"
            >
              Create a secure vault
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Encrypt an inheritance payload and persist it permanently to MongoDB and IPFS.
            </p>
          </div>
          <button
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <X size={19} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-6 p-6">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-semibold text-slate-700">Vault title</span>
              <input
                required
                disabled={isSubmitting}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Family recovery plan"
                className="field"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-semibold text-slate-700">
                Beneficiary wallet address
              </span>
              <input
                required
                disabled={isSubmitting}
                value={beneficiary}
                onChange={(event) => setBeneficiary(event.target.value)}
                placeholder="0x..."
                className="field font-mono text-sm"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-slate-700">Description</span>
            <input
              disabled={isSubmitting}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this vault protects"
              className="field"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-slate-700">
              Secret payload (Encrypted client-side with AES-GCM-256)
            </span>
            <textarea
              required
              disabled={isSubmitting}
              rows={3}
              value={secretPayload}
              onChange={(event) => setSecretPayload(event.target.value)}
              placeholder="Recovery instructions, private keys, seed phrases, or secret message..."
              className="field resize-none font-mono text-sm"
            />
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Shield size={12} className="text-indigo-600" />
              AES-GCM-256 encrypted in browser before uploading to IPFS or database.
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Key size={14} className="text-indigo-600" /> Decryption Passphrase / Secret Key
            </span>
            <input
              type="text"
              disabled={isSubmitting}
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="Custom passphrase (default: heirloom-default-passphrase-2026)"
              className="field font-mono text-sm"
            />
            <span className="text-[11px] text-slate-400">
              Beneficiary will use this key along with the on-chain claim to reveal the secret.
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-semibold text-slate-700">Heartbeat interval</span>
              <select
                disabled={isSubmitting}
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
                className="field"
              >
                <option value="180">180 seconds (Fast demo)</option>
                <option value="2592000">30 days (1 month)</option>
                <option value="7776000">90 days (Quarterly)</option>
                <option value="15552000">180 days (Standard)</option>
                <option value="31536000">365 days (1 year)</option>
                <option value="custom">Custom (seconds)</option>
              </select>
            </label>
            {interval === "custom" && (
              <label className="space-y-1.5">
                <span className="text-sm font-semibold text-slate-700">Custom seconds</span>
                <input
                  type="number"
                  min={10}
                  disabled={isSubmitting}
                  value={customInterval}
                  onChange={(event) => setCustomInterval(Number(event.target.value))}
                  className="field"
                />
              </label>
            )}
          </div>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Guardian configuration</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Independent wallets that attest and approve vault release.
                </p>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setGuardians((current) => [...current, blankGuardian])}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
              >
                <Plus size={14} /> Add guardian
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {guardians.map((guardian, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    aria-label={`Guardian ${index + 1} address`}
                    disabled={isSubmitting}
                    value={guardian}
                    onChange={(event) => updateGuardian(index, event.target.value)}
                    placeholder="0x..."
                    className="field bg-white font-mono text-xs"
                  />
                  <button
                    type="button"
                    disabled={isSubmitting || guardians.length === 1}
                    onClick={() => removeGuardian(index)}
                    className="rounded-lg border border-slate-200 bg-white px-3 text-slate-400 transition hover:text-rose-600 disabled:opacity-30"
                    aria-label={`Remove guardian ${index + 1}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">Release quorum</span>
                <span className="font-semibold text-indigo-700">
                  {quorum}-of-{guardians.length}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={Math.max(1, guardians.length)}
                disabled={isSubmitting}
                value={quorum}
                onChange={(event) => setQuorum(Number(event.target.value))}
                className="mt-3 w-full accent-indigo-600"
              />
            </div>
          </section>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="h-10 rounded-lg px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{loadingStep || "Processing..."}</span>
                </>
              ) : (
                <>
                  <Shield size={16} /> Encrypt & deploy vault
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
