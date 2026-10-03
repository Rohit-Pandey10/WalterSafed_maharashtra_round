// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title HeirloomVault
 * @notice Trust-minimized digital inheritance protocol implementing a dead man's switch
 *         with guardian multi-signature attestation.
 */
contract HeirloomVault is ReentrancyGuard {
    enum VaultStatus {
        Active,
        InGracePeriod,
        Approved,
        Claimed,
        Cancelled
    }

    struct Vault {
        uint256 id;
        address owner;
        address beneficiary;
        string ipfsHash;
        uint256 lastHeartbeat;
        uint256 heartbeatInterval;
        address[] guardians;
        uint256 guardianThreshold;
        uint256 approvalsCount;
        VaultStatus status;
        mapping(address => bool) isGuardian;
        mapping(address => bool) hasApproved;
    }

    struct VaultView {
        uint256 id;
        address owner;
        address beneficiary;
        string ipfsHash;
        uint256 lastHeartbeat;
        uint256 heartbeatInterval;
        uint256 guardianThreshold;
        uint256 approvalsCount;
        VaultStatus status;
    }

    uint256 public vaultCounter;
    mapping(uint256 => Vault) private vaults;

    // Events
    event VaultCreated(
        uint256 indexed vaultId,
        address indexed owner,
        address indexed beneficiary,
        string ipfsHash,
        uint256 heartbeatInterval,
        address[] guardians,
        uint256 guardianThreshold
    );
    event Heartbeat(uint256 indexed vaultId, uint256 timestamp);
    event InactivityTriggered(uint256 indexed vaultId, uint256 timestamp);
    event GuardianAttested(
        uint256 indexed vaultId,
        address indexed guardian,
        uint256 approvalsCount
    );
    event VaultApproved(uint256 indexed vaultId, uint256 timestamp);
    event VaultClaimed(
        uint256 indexed vaultId,
        address indexed beneficiary,
        uint256 timestamp
    );
    event VaultCancelled(uint256 indexed vaultId, uint256 timestamp);

    // Custom Errors
    error VaultNotFound();
    error NotOwner();
    error NotBeneficiary();
    error NotGuardian();
    error AlreadyApproved();
    error InvalidBeneficiary();
    error InvalidHeartbeatInterval();
    error InvalidGuardians();
    error InvalidThreshold();
    error InactivityConditionNotMet();
    error InvalidVaultStatus(VaultStatus currentStatus);
    error EmptyIpfsHash();

    modifier vaultExists(uint256 _vaultId) {
        if (_vaultId == 0 || _vaultId > vaultCounter) {
            revert VaultNotFound();
        }
        _;
    }

    /**
     * @notice Creates a new inheritance vault.
     * @param _beneficiary Address entitled to claim the secret.
     * @param _ipfsHash IPFS CID containing the encrypted secret payload.
     * @param _interval Heartbeat countdown window in seconds.
     * @param _guardians List of trusted guardian wallet addresses.
     * @param _threshold Minimum required guardian attestations.
     * @return vaultId The ID of the newly created vault.
     */
    function createVault(
        address _beneficiary,
        string calldata _ipfsHash,
        uint256 _interval,
        address[] calldata _guardians,
        uint256 _threshold
    ) external returns (uint256) {
        if (_beneficiary == address(0) || _beneficiary == msg.sender) {
            revert InvalidBeneficiary();
        }
        if (bytes(_ipfsHash).length == 0) {
            revert EmptyIpfsHash();
        }
        if (_interval == 0) {
            revert InvalidHeartbeatInterval();
        }
        if (_guardians.length == 0) {
            revert InvalidGuardians();
        }
        if (_threshold == 0 || _threshold > _guardians.length) {
            revert InvalidThreshold();
        }

        uint256 newVaultId = ++vaultCounter;
        Vault storage v = vaults[newVaultId];
        v.id = newVaultId;
        v.owner = msg.sender;
        v.beneficiary = _beneficiary;
        v.ipfsHash = _ipfsHash;
        v.lastHeartbeat = block.timestamp;
        v.heartbeatInterval = _interval;
        v.guardianThreshold = _threshold;
        v.status = VaultStatus.Active;

        for (uint256 i = 0; i < _guardians.length; i++) {
            address guardian = _guardians[i];
            if (
                guardian == address(0) ||
                guardian == msg.sender ||
                guardian == _beneficiary ||
                v.isGuardian[guardian]
            ) {
                revert InvalidGuardians();
            }
            v.isGuardian[guardian] = true;
            v.guardians.push(guardian);
        }

        emit VaultCreated(
            newVaultId,
            msg.sender,
            _beneficiary,
            _ipfsHash,
            _interval,
            _guardians,
            _threshold
        );

        return newVaultId;
    }

    /**
     * @notice Called by the vault owner to signal life and reset the timer.
     *         Recovers a vault in Grace Period back to Active state.
     * @param _vaultId Identifier of the vault.
     */
    function heartbeat(uint256 _vaultId) external vaultExists(_vaultId) {
        Vault storage v = vaults[_vaultId];
        if (msg.sender != v.owner) {
            revert NotOwner();
        }
        if (
            v.status != VaultStatus.Active &&
            v.status != VaultStatus.InGracePeriod
        ) {
            revert InvalidVaultStatus(v.status);
        }

        if (v.status == VaultStatus.InGracePeriod) {
            v.status = VaultStatus.Active;
        }

        v.lastHeartbeat = block.timestamp;

        emit Heartbeat(_vaultId, block.timestamp);
    }

    /**
     * @notice Triggers grace period if heartbeat interval has lapsed.
     * @param _vaultId Identifier of the vault.
     */
    function triggerInactivity(uint256 _vaultId) external vaultExists(_vaultId) {
        Vault storage v = vaults[_vaultId];
        if (v.status != VaultStatus.Active) {
            revert InvalidVaultStatus(v.status);
        }
        if (block.timestamp <= v.lastHeartbeat + v.heartbeatInterval) {
            revert InactivityConditionNotMet();
        }

        v.status = VaultStatus.InGracePeriod;

        emit InactivityTriggered(_vaultId, block.timestamp);
    }

    /**
     * @notice Called by a designated guardian to attest to vault release.
     * @param _vaultId Identifier of the vault.
     */
    function attestVault(uint256 _vaultId) external vaultExists(_vaultId) {
        Vault storage v = vaults[_vaultId];
        if (v.status != VaultStatus.InGracePeriod) {
            revert InvalidVaultStatus(v.status);
        }
        if (!v.isGuardian[msg.sender]) {
            revert NotGuardian();
        }
        if (v.hasApproved[msg.sender]) {
            revert AlreadyApproved();
        }

        v.hasApproved[msg.sender] = true;
        v.approvalsCount++;

        emit GuardianAttested(_vaultId, msg.sender, v.approvalsCount);

        if (v.approvalsCount >= v.guardianThreshold) {
            v.status = VaultStatus.Approved;
            emit VaultApproved(_vaultId, block.timestamp);
        }
    }

    /**
     * @notice Called by the designated beneficiary to claim the secret payload.
     * @param _vaultId Identifier of the vault.
     * @return ipfsHash The IPFS hash of the encrypted payload.
     */
    function claimVault(
        uint256 _vaultId
    ) external nonReentrant vaultExists(_vaultId) returns (string memory) {
        Vault storage v = vaults[_vaultId];
        if (msg.sender != v.beneficiary) {
            revert NotBeneficiary();
        }
        if (v.status != VaultStatus.Approved) {
            revert InvalidVaultStatus(v.status);
        }

        v.status = VaultStatus.Claimed;

        emit VaultClaimed(_vaultId, msg.sender, block.timestamp);

        return v.ipfsHash;
    }

    /**
     * @notice View vault summary details.
     */
    function getVault(
        uint256 _vaultId
    ) external view vaultExists(_vaultId) returns (VaultView memory) {
        Vault storage v = vaults[_vaultId];
        return
            VaultView({
                id: v.id,
                owner: v.owner,
                beneficiary: v.beneficiary,
                ipfsHash: v.ipfsHash,
                lastHeartbeat: v.lastHeartbeat,
                heartbeatInterval: v.heartbeatInterval,
                guardianThreshold: v.guardianThreshold,
                approvalsCount: v.approvalsCount,
                status: v.status
            });
    }

    /**
     * @notice View guardians assigned to a vault.
     */
    function getGuardians(
        uint256 _vaultId
    ) external view vaultExists(_vaultId) returns (address[] memory) {
        return vaults[_vaultId].guardians;
    }

    /**
     * @notice Check if a specific address is a guardian for the vault.
     */
    function isGuardian(
        uint256 _vaultId,
        address _guardian
    ) external view vaultExists(_vaultId) returns (bool) {
        return vaults[_vaultId].isGuardian[_guardian];
    }

    /**
     * @notice Check if a specific guardian has approved the vault release.
     */
    function hasApproved(
        uint256 _vaultId,
        address _guardian
    ) external view vaultExists(_vaultId) returns (bool) {
        return vaults[_vaultId].hasApproved[_guardian];
    }
}
