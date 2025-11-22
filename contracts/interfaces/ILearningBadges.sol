// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILearningBadges {
    /// @notice Emitted when a badge is minted for a module
    event ModuleBadgeMinted(
        uint256 indexed tokenId,
        address indexed to,
        uint256 indexed moduleId
    );

    /// @notice Address allowed to mint badges (protocol or zk verifier)
    function minter() external view returns (address);

    /// @notice Mints a soulbound badge for a completed module
    /// @dev Should revert if `to` already has a badge for this moduleId
    function mintModuleBadge(
        address to,
        uint256 moduleId
    ) external returns (uint256 tokenId);

    /// @notice Returns true if `user` holds a badge for `moduleId`
    function hasModuleBadge(
        address user,
        uint256 moduleId
    ) external view returns (bool);

    /// @notice (Optional) Burn a badge (revocation or self-burn)
    function burn(uint256 tokenId) external;
}
