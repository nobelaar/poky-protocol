# Poky Protocol – Minimal Knowledge Registry

This repo hosts the first smart contracts for Poky, a minimal knowledge protocol where authors publish learning modules and bundle them into curated tracks. The stack uses **Hardhat 3**, the native `node:test` runner, and [`viem`](https://viem.sh/) for all contract interactions.

> **Node requirement:** Hardhat 3 needs Node.js **22.10.0 or newer**. Older runtimes (Node 20) will fail during compilation.


## Contracts

- `contracts/core/ModuleRegistry.sol` stores immutable metadata for learning modules (titles, descriptions, images, IPFS CIDs, authors, timestamps). IDs are the array index and events surface the author/IPFS pair.
- `contracts/core/TrackRegistry.sol` keeps higher-level learning tracks composed of ordered module IDs. Tracks require at least one module and also store the author + timestamp.
- `contracts/core/ModuleProgress.sol` lets learners permissionlessly record completed modules using author-signed attestations, emitting `ModuleCompleted` events that `LearningBadges` consumes.
- `contracts/core/LearningBadges.sol` mints soulbound badges for module or track completions once `ModuleProgress` shows every prerequisite is done (users mint their own badges; transfers are blocked; burning is opt-in).
- Structs live in `contracts/interfaces/Types.sol`; external-facing interfaces sit in `contracts/interfaces/IModuleRegistry.sol` and `contracts/interfaces/ITrackRegistry.sol`.

## Completion + Badge Flow

1. **Module + track creation:** authors register modules (and optional tracks) with the registries.
2. **Off-chain challenge:** when a learner completes a module, the author (or any permissionless checker) signs `keccak256(abi.encodePacked(ModuleProgress, learner, moduleId, nonce))`. Only this digest, not the answer, is revealed.
3. **On-chain completion:** the learner calls `ModuleProgress.claimModuleCompletion(moduleId, nonce, signature)` and the contract verifies the signature against the module author, marks the completion, and emits `ModuleCompleted`.
4. **Badge mint:** the learner mints `mintModuleBadge(msg.sender, moduleId)` or `mintTrackBadge(trackId)` from `LearningBadges`. The contract cross-checks `ModuleProgress` and prevents duplicates; burns clear the badge record so it can be reclaimed later.

### Signature helper

Use the helper script to produce signatures for learners:

```bash
npx hardhat run scripts/sign-module-completion.ts --network hardhat \
  0xModuleProgressAddress \
  0xLearnerAddress \
  0 \
  1
```

It signs with the first Hardhat account by default and prints the final signature plus all parameters so you can hand it to the learner.
The last two arguments correspond to the target `moduleId` and the unique `nonce` for that attestation.

### Badge mint demo

After recording completions, learners can mint badges permissionlessly:

```bash
npx hardhat viem call LearningBadges mintModuleBadge --args "<yourAddress>" "<moduleId>"
npx hardhat viem call LearningBadges mintTrackBadge --args "<trackId>"
```

Both functions emit `ModuleBadgeMinted` / `TrackBadgeMinted` events and reuse the same soulbound supply counter.

## Tests 

TypeScript tests in `test/ModuleRegistry.test.ts` and `test/TrackRegistry.test.ts` rely on `node:test`, Hardhat’s viem helper, and viem assertions to cover:

- Sequential ID generation for modules and tracks.
- Metadata persistence (title, description/image/IPFS, authors, timestamps).
- Pagination helpers (`getModules`, `getTracks`) including overflows.
- Total counters.
- Custom-error reverts for invalid IDs and empty module arrays.
- `test/ModuleProgress.test.ts` verifies the signature flow (valid proofs, replay protection, module existence).
- `test/LearningBadges.test.ts` covers module and track badge minting, duplicate prevention, and burns.

Run them with:

```bash
npx hardhat test
```

Each case deploys a fresh registry on the fly via `viem.deployContract`.

## Deployment Scripts

Use the provided scripts to deploy the MVP contracts to any configured network:

```bash
npx hardhat run scripts/deploy-module-registry.ts --network <networkName>
npx hardhat run scripts/deploy-track-registry.ts --network <networkName>
npx hardhat run scripts/sign-module-completion.ts --network <networkName> <ModuleProgress> <Learner> <ModuleId> <Nonce>
```

The scripts log the deployer account, target block, and initial totals so you can verify deployments quickly.

## Networks & Configuration

- Hardhat config (`hardhat.config.ts`) enables the Hardhat 3 + viem toolbox and ships with profiles for the default local chain, an OP-style simulation (`hardhatOp`), and Sepolia.
- For Sepolia deployments, set `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` via environment variables or `npx hardhat keystore set`.

## Roadmap

Next steps include swapping signature attestations for lightweight ZK proofs, integrating badge-aware frontends, and adding richer course metadata. Contributions are welcome—open an issue or PR if you want to extend Poky!***
