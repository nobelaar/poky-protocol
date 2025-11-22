// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

library Types {

    struct Module {
        uint256 id;
        string title;
        string description;
        string image;
        address author;
        string ipfsCid;
        uint256 sectionCount;
        uint256 version;
        uint256 createdAt;
    }

    struct Track {
        uint256 id;
        string title;
        address author;
        uint256[] moduleIds;
        uint256 createdAt;
    }

}
