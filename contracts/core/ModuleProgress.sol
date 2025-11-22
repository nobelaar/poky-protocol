// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IModuleRegistry} from "../interfaces/IModuleRegistry.sol";
import {IGroth16Verifier} from "../interfaces/IGroth16Verifier.sol";
import {Types} from "../interfaces/Types.sol";

/// @title ModuleProgress (ZK)
/// @notice Permissionless tracker that verifies completion proofs via Groth16
contract ModuleProgress {
    error CommitmentNotSet(uint256 moduleId, uint256 sectionId);
    error NotModuleAuthor(address caller, uint256 moduleId);
    error SectionAlreadyCompleted(address user, uint256 moduleId, uint256 sectionId);
    error InvalidProof();
    error InvalidPublicInputs();
    error SectionLimitReached(uint256 moduleId);

    event ModuleCompleted(address indexed user, uint256 indexed moduleId);
    event SectionCommitmentSet(
        uint256 indexed moduleId,
        uint256 indexed sectionId,
        bytes32 indexed commitment
    );

    IModuleRegistry public immutable moduleRegistry;
    IGroth16Verifier public immutable verifier;

    mapping(uint256 moduleId => uint256 count) public moduleSectionCounts;
    mapping(uint256 moduleId => mapping(uint256 sectionId => bytes32 commitment))
        public sectionCommitments;
    mapping(address user => mapping(uint256 moduleId => mapping(uint256 sectionId => bool)))
        private completedSections;
    mapping(address user => mapping(uint256 moduleId => uint256 count))
        public completedSectionCount;
    mapping(address user => mapping(uint256 moduleId => bool)) private completedModules;

    constructor(address moduleRegistryAddress, address verifierAddress) {
        require(moduleRegistryAddress != address(0), "invalid registry");
        require(verifierAddress != address(0), "invalid verifier");
        moduleRegistry = IModuleRegistry(moduleRegistryAddress);
        verifier = IGroth16Verifier(verifierAddress);
    }

    /// @notice Authors publish commitments for each section of their module
    function setSectionCommitment(uint256 moduleId, bytes32 commitment)
        external
    {
        Types.Module memory moduleData = moduleRegistry.getModule(moduleId);
        if (moduleData.author != msg.sender) {
            revert NotModuleAuthor(msg.sender, moduleId);
        }

        uint256 sectionId = moduleSectionCounts[moduleId];
        if (sectionId >= moduleData.sectionCount) {
            revert SectionLimitReached(moduleId);
        }

        sectionCommitments[moduleId][sectionId] = commitment;
        moduleSectionCounts[moduleId] = sectionId + 1;
        emit SectionCommitmentSet(moduleId, sectionId, commitment);
    }

    /// @notice Records a section completion proof for msg.sender
    function claimSectionCompletion(
        uint256 moduleId,
        uint256 sectionId,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata input
    ) external {
        Types.Module memory moduleData = moduleRegistry.getModule(moduleId);
        uint256 expectedSections = moduleData.sectionCount;
        if (sectionId >= expectedSections) {
            revert SectionLimitReached(moduleId);
        }

        if (completedSections[msg.sender][moduleId][sectionId]) {
            revert SectionAlreadyCompleted(msg.sender, moduleId, sectionId);
        }

        bytes32 commitment = sectionCommitments[moduleId][sectionId];
        if (commitment == bytes32(0)) {
            revert CommitmentNotSet(moduleId, sectionId);
        }

        if (input.length < 4) {
            revert InvalidPublicInputs();
        }

        uint256 expectedUser = uint256(uint160(msg.sender));
        if (
            input[0] != expectedUser ||
            input[1] != moduleId ||
            input[2] != sectionId ||
            input[3] != uint256(commitment)
        ) {
            revert InvalidPublicInputs();
        }

        bool verified = verifier.verifyProof(a, b, c, input);
        if (!verified) {
            revert InvalidProof();
        }

        completedSections[msg.sender][moduleId][sectionId] = true;
        completedSectionCount[msg.sender][moduleId] += 1;

        if (completedSectionCount[msg.sender][moduleId] == expectedSections) {
            completedModules[msg.sender][moduleId] = true;
            emit ModuleCompleted(msg.sender, moduleId);
        }
    }

    /// @notice Returns whether `user` has completed `moduleId`
    function hasCompletedModule(address user, uint256 moduleId)
        external
        view
        returns (bool)
    {
        return completedModules[user][moduleId];
    }

    /// @notice Returns whether `user` has completed a specific section
    function hasCompletedSection(
        address user,
        uint256 moduleId,
        uint256 sectionId
    ) external view returns (bool) {
        return completedSections[user][moduleId][sectionId];
    }

    /// @notice Total registered sections for a module
    function sectionCount(uint256 moduleId) external view returns (uint256) {
        return moduleSectionCounts[moduleId];
    }
}
