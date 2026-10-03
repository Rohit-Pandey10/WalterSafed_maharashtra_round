export type UserRole = "Owner" | "Guardian" | "Beneficiary";

export type VaultStatus =
  | "Active"
  | "InGracePeriod"
  | "Approved"
  | "Claimed"
  | "Cancelled";

export interface Guardian {
  address: string;
  hasApproved: boolean;
}

export interface Vault {
  id: string;
  numericId?: number;
  title: string;
  description: string;
  role: UserRole;
  status: VaultStatus;
  owner?: string;
  beneficiary: string;
  lastKnownHeartbeat: string;
  heartbeatInterval: number;
  guardians: Guardian[];
  quorum: number;
  guardianThreshold?: number;
  approvalsCount?: number;
  secretPayload?: string;
  ipfsCid: string;
}

export type ToastState = {
  id: number;
  type: "pending" | "confirmed" | "failed" | "success" | "warning";
  message: string;
};
