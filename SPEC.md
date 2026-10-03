# Heirloom — Trust-Minimized Digital Inheritance Protocol

## Core Mechanism (Dead Man's Switch)
1. **Vault Creation**: An asset owner registers a vault specifying:
   - `beneficiary`: Address entitled to claim the secret.
   - `ipfsHash`: Encrypted payload CID/hash stored on IPFS.
   - `heartbeatInterval`: Countdown duration in seconds (e.g., 180s for demo, 90 days for prod).
   - `guardians`: Array of trusted guardian wallet addresses.
   - `guardianThreshold`: Minimum number of guardian attestations required (e.g., 2 of 3).
2. **Heartbeat Loop**: The owner calls `heartbeat(vaultId)` on-chain periodically to reset the timer (`lastHeartbeat = block.timestamp`).
3. **Inactivity Trigger**: If `block.timestamp > lastHeartbeat + heartbeatInterval`, anyone can invoke `triggerInactivity(vaultId)`. The vault enters the `InGracePeriod` state.
4. **Guardian Attestation**: Designated guardians call `attestVault(vaultId)`. Once approvals reach `guardianThreshold`, status becomes `Approved`.
5. **Beneficiary Claim**: The beneficiary calls `claimVault(vaultId)` to access the vault release metadata.

## Contract Interface (`HeirloomVault.sol`)
- `createVault(address _beneficiary, string calldata _ipfsHash, uint256 _interval, address[] calldata _guardians, uint256 _threshold)`
- `heartbeat(uint256 _vaultId)`
- `triggerInactivity(uint256 _vaultId)`
- `attestVault(uint256 _vaultId)`
- `claimVault(uint256 _vaultId)`
