// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IModuleRegistry} from "../interfaces/IModuleRegistry.sol";
import {ITrackRegistry} from "../interfaces/ITrackRegistry.sol";
import {Types} from "../interfaces/Types.sol";

/// @title TrackRegistry
/// @notice Stores curated tracks composed of module ids
contract TrackRegistry is ITrackRegistry {
    error TrackNotFound(uint256 trackId);
    error EmptyModuleIds();

    IModuleRegistry public immutable moduleRegistry;
    Types.Track[] private tracks;

    constructor(IModuleRegistry moduleRegistry_) {
        moduleRegistry = moduleRegistry_;
    }

    /// @inheritdoc ITrackRegistry
    function createTrack(string calldata title, uint256[] calldata moduleIds)
        external
        override
        returns (uint256 trackId)
    {
        if (moduleIds.length == 0) {
            revert EmptyModuleIds();
        }

        for (uint256 i = 0; i < moduleIds.length; ) {
            moduleRegistry.getModule(moduleIds[i]);
            unchecked {
                ++i;
            }
        }

        trackId = tracks.length;
        Types.Track memory newTrack = Types.Track({
            id: trackId,
            title: title,
            author: msg.sender,
            moduleIds: moduleIds,
            createdAt: block.timestamp
        });

        tracks.push(newTrack);

        emit TrackCreated(trackId, msg.sender);
    }

    /// @inheritdoc ITrackRegistry
    function getTrack(uint256 trackId)
        public
        view
        override
        returns (Types.Track memory)
    {
        if (trackId >= tracks.length) {
            revert TrackNotFound(trackId);
        }

        return tracks[trackId];
    }

    /// @inheritdoc ITrackRegistry
    function totalTracks() external view override returns (uint256) {
        return tracks.length;
    }

    /// @inheritdoc ITrackRegistry
    function getTracks(uint256 offset, uint256 limit)
        external
        view
        override
        returns (Types.Track[] memory)
    {
        uint256 total = tracks.length;
        if (offset >= total) {
            return new Types.Track[](0);
        }

        uint256 remaining = total - offset;
        uint256 sliceSize = limit < remaining ? limit : remaining;

        Types.Track[] memory results = new Types.Track[](sliceSize);
        for (uint256 i = 0; i < sliceSize; ) {
            results[i] = tracks[offset + i];
            unchecked {
                ++i;
            }
        }

        return results;
    }
}
