// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ILearningBadges} from "../interfaces/ILearningBadges.sol";
import {IModuleProgress} from "../interfaces/IModuleProgress.sol";
import {ITrackRegistry} from "../interfaces/ITrackRegistry.sol";
import {Types} from "../interfaces/Types.sol";

/// @title LearningBadges
/// @notice Soulbound badges for module and track completions
contract LearningBadges is ILearningBadges {
    enum BadgeKind {
        Module,
        Track
    }

    error InvalidRecipient(address provided);
    error MissingModuleCompletion(address user, uint256 moduleId);
    error ModuleBadgeAlreadyMinted(address user, uint256 moduleId);
    error ModuleBadgeNotMinted(address user, uint256 moduleId);
    error TrackModulesIncomplete(uint256 trackId, uint256 missingModuleId);
    error TrackBadgeAlreadyMinted(address user, uint256 trackId);
    error TrackBadgeNotMinted(address user, uint256 trackId);
    error NotTokenOwner(address user, uint256 tokenId);
    error InvalidToken(uint256 tokenId);

    event TrackBadgeMinted(
        uint256 indexed tokenId,
        address indexed to,
        uint256 indexed trackId
    );

    struct Badge {
        address owner;
        BadgeKind kind;
        uint256 refId;
        bool exists;
    }

    IModuleProgress public immutable moduleProgress;
    ITrackRegistry public immutable trackRegistry;

    uint256 private nextTokenId;
    mapping(uint256 => Badge) private badges;
    mapping(address => uint256) private balances;

    mapping(address => mapping(uint256 => bool)) private moduleBadgeClaimed;
    mapping(address => mapping(uint256 => uint256)) private moduleBadgeTokenIds;
    mapping(address => mapping(uint256 => bool)) private trackBadgeClaimed;
    mapping(address => mapping(uint256 => uint256)) private trackBadgeTokenIds;

    constructor(address moduleProgressAddress, address trackRegistryAddress) {
        require(moduleProgressAddress != address(0), "invalid module progress");
        require(trackRegistryAddress != address(0), "invalid track registry");
        moduleProgress = IModuleProgress(moduleProgressAddress);
        trackRegistry = ITrackRegistry(trackRegistryAddress);
    }

    /// @inheritdoc ILearningBadges
    function mintModuleBadge(address to, uint256 moduleId)
        external
        override
        returns (uint256 tokenId)
    {
        if (to != msg.sender) {
            revert InvalidRecipient(to);
        }

        if (!moduleProgress.hasCompletedModule(to, moduleId)) {
            revert MissingModuleCompletion(to, moduleId);
        }

        if (moduleBadgeClaimed[to][moduleId]) {
            revert ModuleBadgeAlreadyMinted(to, moduleId);
        }

        tokenId = _mint(to, BadgeKind.Module, moduleId);
        moduleBadgeClaimed[to][moduleId] = true;
        moduleBadgeTokenIds[to][moduleId] = tokenId;

        emit ModuleBadgeMinted(tokenId, to, moduleId);
    }

    /// @notice Mint a track badge after completing all required modules
    function mintTrackBadge(uint256 trackId) external returns (uint256 tokenId) {
        if (trackBadgeClaimed[msg.sender][trackId]) {
            revert TrackBadgeAlreadyMinted(msg.sender, trackId);
        }

        Types.Track memory track = trackRegistry.getTrack(trackId);
        uint256[] memory moduleIds = track.moduleIds;

        for (uint256 i = 0; i < moduleIds.length; ) {
            if (!moduleProgress.hasCompletedModule(msg.sender, moduleIds[i])) {
                revert TrackModulesIncomplete(trackId, moduleIds[i]);
            }

            unchecked {
                ++i;
            }
        }

        tokenId = _mint(msg.sender, BadgeKind.Track, trackId);
        trackBadgeClaimed[msg.sender][trackId] = true;
        trackBadgeTokenIds[msg.sender][trackId] = tokenId;

        emit TrackBadgeMinted(tokenId, msg.sender, trackId);
    }

    function _mint(
        address to,
        BadgeKind kind,
        uint256 refId
    ) private returns (uint256 tokenId) {
        tokenId = nextTokenId;
        nextTokenId = tokenId + 1;

        badges[tokenId] = Badge({
            owner: to,
            kind: kind,
            refId: refId,
            exists: true
        });
        balances[to] += 1;
    }

    /// @notice Returns badge balance for a user
    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "zero address");
        return balances[owner];
    }

    /// @notice Returns the owner of a tokenId (zero if burned)
    function ownerOf(uint256 tokenId) external view returns (address) {
        Badge memory badge = badges[tokenId];
        if (!badge.exists) {
            revert InvalidToken(tokenId);
        }
        return badge.owner;
    }

    /// @inheritdoc ILearningBadges
    function hasModuleBadge(address user, uint256 moduleId)
        external
        view
        override
        returns (bool)
    {
        return moduleBadgeClaimed[user][moduleId];
    }

    /// @notice Returns true if a track badge has been minted
    function hasTrackBadge(address user, uint256 trackId)
        external
        view
        returns (bool)
    {
        return trackBadgeClaimed[user][trackId];
    }

    /// @notice Returns the token id tied to a module badge
    function moduleBadgeTokenId(address user, uint256 moduleId)
        external
        view
        returns (uint256)
    {
        if (!moduleBadgeClaimed[user][moduleId]) {
            revert ModuleBadgeNotMinted(user, moduleId);
        }

        return moduleBadgeTokenIds[user][moduleId];
    }

    /// @notice Returns the token id tied to a track badge
    function trackBadgeTokenId(address user, uint256 trackId)
        external
        view
        returns (uint256)
    {
        if (!trackBadgeClaimed[user][trackId]) {
            revert TrackBadgeNotMinted(user, trackId);
        }

        return trackBadgeTokenIds[user][trackId];
    }

    /// @inheritdoc ILearningBadges
    function burn(uint256 tokenId) external override {
        Badge storage badge = badges[tokenId];
        if (!badge.exists) {
            revert InvalidToken(tokenId);
        }

        if (badge.owner != msg.sender) {
            revert NotTokenOwner(msg.sender, tokenId);
        }

        badge.owner = address(0);
        balances[msg.sender] -= 1;

        if (badge.kind == BadgeKind.Module) {
            moduleBadgeClaimed[msg.sender][badge.refId] = false;
            moduleBadgeTokenIds[msg.sender][badge.refId] = 0;
        } else {
            trackBadgeClaimed[msg.sender][badge.refId] = false;
            trackBadgeTokenIds[msg.sender][badge.refId] = 0;
        }
    }
}
