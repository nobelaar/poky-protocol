// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IModuleRegistry} from "../interfaces/IModuleRegistry.sol";
import {IGroth16Verifier} from "../interfaces/IGroth16Verifier.sol";
import {Types} from "../interfaces/Types.sol";

/// @title ModuleProgress (ZK)
/// @notice Permissionless tracker that verifies completion proofs via Groth16
contract ModuleProgress {
    error CommitmentNotSet(uint256 moduleId);
    error NotModuleAuthor(address caller, uint256 moduleId);
    error AlreadyCompleted(address user, uint256 moduleId);
    error InvalidProof();
    error InvalidPublicInputs();

    event ModuleCompleted(address indexed user, uint256 indexed moduleId);
    event ModuleCommitmentSet(
        uint256 indexed moduleId,
        bytes32 indexed commitment
    );

    IModuleRegistry public immutable moduleRegistry;
    IGroth16Verifier public immutable verifier;

    mapping(address user => mapping(uint256 moduleId => bool)) private completed;
    mapping(uint256 moduleId => bytes32 commitment) public moduleCommitments;

    constructor(address moduleRegistryAddress, address verifierAddress) {
        require(moduleRegistryAddress != address(0), "invalid registry");
        require(verifierAddress != address(0), "invalid verifier");
        moduleRegistry = IModuleRegistry(moduleRegistryAddress);
        verifier = IGroth16Verifier(verifierAddress);
    }

    /// @notice Authors publish the commitment required to prove completion
    function setModuleCommitment(uint256 moduleId, bytes32 commitment) external {
        Types.Module memory moduleData = moduleRegistry.getModule(moduleId);
        if (moduleData.author != msg.sender) {
            revert NotModuleAuthor(msg.sender, moduleId);
        }

        moduleCommitments[moduleId] = commitment;
        emit ModuleCommitmentSet(moduleId, commitment);
    }

    /// @notice Records a completion proof for msg.sender
    function claimModuleCompletion(
        uint256 moduleId,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata input
    ) external {
        if (completed[msg.sender][moduleId]) {
            revert AlreadyCompleted(msg.sender, moduleId);
        }

        bytes32 commitment = moduleCommitments[moduleId];
        if (commitment == bytes32(0)) {
            revert CommitmentNotSet(moduleId);
        }

        if (input.length < 3) {
            revert InvalidPublicInputs();
        }

        uint256 expectedUser = uint256(uint160(msg.sender));
        if (input[0] != expectedUser || input[1] != moduleId) {
            revert InvalidPublicInputs();
        }

        if (input[2] != uint256(commitment)) {
            revert InvalidPublicInputs();
        }

        bool verified = verifier.verifyProof(a, b, c, input);
        if (!verified) {
            revert InvalidProof();
        }

        completed[msg.sender][moduleId] = true;
        emit ModuleCompleted(msg.sender, moduleId);
    }

    /// @notice Returns whether `user` has completed `moduleId`
    function hasCompletedModule(address user, uint256 moduleId)
        external
        view
        returns (bool)
    {
        return completed[user][moduleId];
    }
}
