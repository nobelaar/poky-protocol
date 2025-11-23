// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IModuleRegistry} from "../interfaces/IModuleRegistry.sol";
import {Types} from "../interfaces/Types.sol";

/// @title ModuleProgress (commit-reveal)
/// @notice Permissionless tracker that validates section commitments via hash preimages
contract ModuleProgress {
    error CommitmentNotSet(uint256 moduleId, uint256 sectionId);
    error NotModuleAuthor(address caller, uint256 moduleId);
    error SectionAlreadyCompleted(address user, uint256 moduleId, uint256 sectionId);
    error CommitmentMismatch(bytes32 expected, bytes32 provided);
    error CommitmentAlreadyUsed(
        address user,
        uint256 moduleId,
        uint256 sectionId,
        bytes32 commitment
    );
    error SectionLimitReached(uint256 moduleId);

    event ModuleCompleted(address indexed user, uint256 indexed moduleId);
    event SectionCommitmentSet(
        uint256 indexed moduleId,
        uint256 indexed sectionId,
        bytes32 indexed commitment
    );

    IModuleRegistry public immutable moduleRegistry;
    mapping(uint256 moduleId => uint256 count) public moduleSectionCounts;
    mapping(uint256 moduleId => mapping(uint256 sectionId => bytes32 commitment))
        public sectionCommitments;
    mapping(address user => mapping(uint256 moduleId => mapping(uint256 sectionId => bool)))
        private completedSections;
    mapping(address user => mapping(uint256 moduleId => mapping(uint256 sectionId => mapping(bytes32 commitment => bool used))))
        private usedCommitments;
    mapping(address user => mapping(uint256 moduleId => uint256 count))
        public completedSectionCount;
    mapping(address user => mapping(uint256 moduleId => bool)) private completedModules;

    constructor(address moduleRegistryAddress) {
        require(moduleRegistryAddress != address(0), "invalid registry");
        moduleRegistry = IModuleRegistry(moduleRegistryAddress);
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

    /// @notice Records a section completion for msg.sender by revealing a salted preimage hash
    function claimSectionCompletion(
        uint256 moduleId,
        uint256 sectionId,
        bytes32 providedHash,
        bytes32 salt
    ) external {
        Types.Module memory moduleData = moduleRegistry.getModule(moduleId);
        uint256 expectedSections = moduleData.sectionCount;
        if (sectionId >= expectedSections) {
            revert SectionLimitReached(moduleId);
        }

        if (completedSections[msg.sender][moduleId][sectionId]) {
            revert SectionAlreadyCompleted(msg.sender, moduleId, sectionId);
        }

        bytes32 expectedCommitment = sectionCommitments[moduleId][sectionId];
        if (expectedCommitment == bytes32(0)) {
            revert CommitmentNotSet(moduleId, sectionId);
        }

        bytes32 computedCommitment = keccak256(abi.encodePacked(providedHash, salt));
        if (computedCommitment != expectedCommitment) {
            revert CommitmentMismatch(expectedCommitment, computedCommitment);
        }

        if (usedCommitments[msg.sender][moduleId][sectionId][computedCommitment]) {
            revert CommitmentAlreadyUsed(
                msg.sender,
                moduleId,
                sectionId,
                computedCommitment
            );
        }

        usedCommitments[msg.sender][moduleId][sectionId][computedCommitment] = true;

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
