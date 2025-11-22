# Poky Protocol – Minimal Knowledge Registry

This repo hosts the first smart contracts for Poky, a minimal knowledge protocol where authors publish learning modules and bundle them into curated tracks. The stack uses **Hardhat 3**, the native `node:test` runner, and [`viem`](https://viem.sh/) for all contract interactions.


## Contracts

- `contracts/core/ModuleRegistry.sol` stores immutable metadata for learning modules (titles, descriptions, images, IPFS CIDs, authors, timestamps). IDs are the array index and events surface the author/IPFS pair.
- `contracts/core/TrackRegistry.sol` keeps higher-level learning tracks composed of ordered module IDs. Tracks require at least one module and also store the author + timestamp.
- `contracts/core/ModuleProgress.sol` stores section commitments for each module and checks Groth16 proofs (via an external verifier contract) before emitting `ModuleCompleted`.
- `contracts/core/LearningBadges.sol` mints soulbound badges for module or track completions once `ModuleProgress` shows every prerequisite is done (users mint their own badges; transfers are blocked; burning is opt-in).
- Structs live in `contracts/interfaces/Types.sol`; external-facing interfaces sit in `contracts/interfaces/IModuleRegistry.sol` and `contracts/interfaces/ITrackRegistry.sol`.

## Completion + Badge Flow

1. **Module + track creation:** authors register modules (and optional tracks).
2. **Publish commitments:** the module author records a commitment hash (e.g. `keccak256(answer || salt)`) per section via `ModuleProgress.setSectionCommitment`. Each call registers the next section until reaching the module's `sectionCount`.
3. **Learner proves completion:** off-chain tooling (circom/snarkjs or any Groth16-compatible stack) generates a proof that the learner knows a preimage matching the section commitment. Public inputs follow `[uint256(userAddress), moduleId, sectionId, commitment]`.
4. **On-chain verification:** `claimModuleCompletion(moduleId, a, b, c, input)` calls an external Groth16 verifier; if the proof is valid, the learner is marked complete and `ModuleCompleted` fires.
5. **Badge mint:** learners call `mintModuleBadge(msg.sender, moduleId)` or `mintTrackBadge(trackId)` from `LearningBadges`. The contract checks `ModuleProgress` state, prevents duplicates, and allows optional burns.

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
- `test/ModuleProgress.test.ts` checks the proof-driven completion flow across multiple sections, public input validation, and author-only commitment publishing (it relies on a mock Groth16 verifier for local development).
- `test/LearningBadges.test.ts` covers module and track badge minting, duplicate prevention, and burns on top of the zero-knowledge completions.

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
npx hardhat run scripts/deploy-mock-verifier.ts --network <networkName>
```

The scripts log the deployer account, target block, and initial totals so you can verify deployments quickly.

### Create a track from a JSON payload

Create modules that are missing and then register the track in one go by feeding a JSON file to `scripts/create-track.ts`.

Example payload (`track.json`):

```json
{
  "title": "Foundations",
  "moduleIds": [0, 1],
  "newModules": [
    {
      "title": "ZK 101",
      "description": "Intro to zero-knowledge proofs",
      "image": "ipfs://zk.png",
      "ipfsCid": "bafy-123",
      "sectionCount": 3
    }
  ]
}
```

Run the script by passing registry addresses via flags or environment variables:

```bash
npx hardhat run scripts/create-track.ts --network <networkName> \
  --input track.json \
  --moduleRegistry <moduleRegistryAddress> \
  --trackRegistry <trackRegistryAddress>
```

The script validates existing module IDs, creates any additional modules from the JSON (logging the generated IDs), and finally submits the `createTrack` transaction with the full ordered list.

### Token basics example track (Spanish)

For a longer example focused on ERC-20/721 fundamentals—including introductory info plus multiple-selection quizzes—you can use `examples/token-basics-track.json` as the input file. It defines four modules:

1. **Bienvenida y setup de billetera** – onboarding and glossary before starting.
2. **Fungibles vs no fungibles** – compares ERC-20 vs ERC-721/1155 with classification quizzes.
3. **Transferencias, approvals y gas** – covers allowances, transfer flows, and safe-sending checks.
4. **Buenas prácticas y riesgos** – security checklist with scenario-based questions.

Run it the same way as any JSON payload:

```bash
npx hardhat run scripts/create-track.ts --network <networkName> \
  --input examples/token-basics-track.json \
  --moduleRegistry <moduleRegistryAddress> \
  --trackRegistry <trackRegistryAddress>
```

## Networks & Configuration

- Hardhat config (`hardhat.config.ts`) enables the Hardhat 3 + viem toolbox and ships with profiles for the default local chain, an OP-style simulation (`hardhatOp`), and Sepolia.
- For Sepolia deployments, set `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` via environment variables or `npx hardhat keystore set`.

## Roadmap

Next steps include wiring the real Groth16 verifier contracts generated by `snarkjs`, shipping a CLI to create proofs from module answers, and integrating badge-aware frontends. Contributions are welcome—open an issue or PR if you want to extend Poky!***
