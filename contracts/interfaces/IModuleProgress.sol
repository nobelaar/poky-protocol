// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IModuleProgress {
    function hasCompletedModule(address user, uint256 moduleId)
        external
        view
        returns (bool);

    function hasCompletedSection(
        address user,
        uint256 moduleId,
        uint256 sectionId
    ) external view returns (bool);

    function sectionCount(uint256 moduleId) external view returns (uint256);
}
