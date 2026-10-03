import { Check, Copy, ExternalLink, FileKey, Key, Loader2, X } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { decryptPayload } from "../utils/crypto.js";
import type { Vault } from "../types";

interface SecretPayloadViewerProps {
  vault: Vault | null;
  onClose: () => void;
}

const PRIMARY_API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";
const FALLBACK_API_URL = "http://localhost:5000";

export default function SecretPayloadViewer({
  vault,
  onClose,
}: SecretPayloadViewerProps) {
  const [copied, setCopied] = useState(false);
  const [passphrase, setPassphrase] = useState("heirloom-default-passphrase-2026");
  const [decryptedText, setDecryptedText] = useState<string>("");
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performDecryption = useCallback(
    async (pass: string) => {
      if (!vault) return;
      setError(null);
      setIsDecrypting(true);

      try {
        let encryptedPackage: any = null;

        // If vault already holds raw secret string
        if (
          vault.secretPayload &&
          !vault.secretPayload.includes('"ciphertext"') &&
          !vault.secretPayload.includes('"algorithm"')
        ) {
          setDecryptedText(vault.secretPayload);
          setIsDecrypting(false);
          return;
        }

        // Fetch payload from IPFS proxy endpoint
        const endpoints = [
          `${PRIMARY_API_URL}/api/v1/vaults/payload/${vault.ipfsCid}`,
          `${FALLBACK_API_URL}/api/v1/vaults/payload/${vault.ipfsCid}`,
        ];

        let fetchErr = null;
        for (const url of endpoints) {
          try {
            const res = await axios.get(url, { timeout: 5000 });
            if (res.data && res.data.success) {
              encryptedPackage = res.data.data;
              break;
            }
          } catch (e) {
            fetchErr = e;
          }
        }

        if (!encryptedPackage) {
          // If fetch failed, check if secretPayload on vault has the JSON
          if (vault.secretPayload) {
            try {
              encryptedPackage = JSON.parse(vault.secretPayload);
            } catch {
              encryptedPackage = vault.secretPayload;
            }
          }
        }

        if (!encryptedPackage) {
          throw new Error("Could not retrieve encrypted package from IPFS gateway");
        }

        // Decrypt using Web Crypto
        const pkgToDecrypt =
          encryptedPackage.encryptedData || encryptedPackage;
        const plaintext = await decryptPayload(pkgToDecrypt, pass);
        setDecryptedText(plaintext);
      } catch (err: any) {
        console.error("Decryption failed:", err);
        setError(err.message || "Failed to decrypt secret with the provided key.");
      } finally {
        setIsDecrypting(false);
      }
    },
    [vault]
  );

  useEffect(() => {
    if (vault) {
      if (vault.secretPayload && !vault.secretPayload.includes('"ciphertext"')) {
        setDecryptedText(vault.secretPayload);
      } else {
        performDecryption(passphrase);
      }
    }
  }, [vault, performDecryption, passphrase]);

  if (!vault) return null;

  async function copySecret() {
    await navigator.clipboard.writeText(decryptedText || vault?.secretPayload || "");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-500/20 p-5 backdrop-blur-[2px]">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <FileKey size={19} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                {decryptedText ? "Decryption complete" : "Claimed inheritance"}
              </p>
              <h2 className="font-display text-lg font-semibold text-slate-950">
                {vault.title}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <label className="text-xs font-semibold text-slate-600">
            Decryption Passphrase
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter passphrase"
              className="field text-xs font-mono"
            />
            <button
              onClick={() => performDecryption(passphrase)}
              disabled={isDecrypting}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isDecrypting ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Key size={13} />
              )}
              Decrypt
            </button>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Revealed secret payload
          </p>
          {isDecrypting ? (
            <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
              <Loader2 size={15} className="animate-spin text-indigo-600" />
              Fetching from IPFS & deriving AES-GCM-256 key...
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-slate-800">
              {decryptedText || "Enter decryption passphrase above to reveal."}
            </pre>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <a
            href={`https://ipfs.io/ipfs/${vault.ipfsCid}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
          >
            Verify on IPFS <ExternalLink size={13} />
          </a>
          <button
            disabled={!decryptedText}
            onClick={copySecret}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
          >
            {copied ? (
              <Check size={14} className="text-emerald-600" />
            ) : (
              <Copy size={14} />
            )}
            {copied ? "Copied to clipboard" : "Copy secret"}
          </button>
        </div>
      </div>
    </div>
  );
}
