// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./Types.sol";

interface ITrackRegistry {
    /// @notice Emitted when a new track is created
    event TrackCreated(
        uint256 indexed trackId,
        address indexed author
    );

    /// @notice Creates a new track from existing module ids
    function createTrack(
        string calldata title,
        uint256[] calldata moduleIds
    ) external returns (uint256 trackId);

    /// @notice Returns a single track by id
    function getTrack(uint256 trackId)
        external
        view
        returns (Types.Track memory);

    /// @notice Returns total number of tracks registered
    function totalTracks() external view returns (uint256);

    /// @notice Simple pagination helper for frontends
    function getTracks(uint256 offset, uint256 limit)
        external
        view
        returns (Types.Track[] memory);
}
