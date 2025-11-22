import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { network } from "hardhat";
import { encodePacked, keccak256 } from "viem";

describe("LearningBadges", async () => {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [author, learner] = await viem.getWalletClients();

  const deployModuleRegistry = () => viem.deployContract("ModuleRegistry");
  const deployTrackRegistry = () => viem.deployContract("TrackRegistry");
  const deployVerifier = () => viem.deployContract("MockGroth16Verifier");
  const deployModuleProgress = (
    registryAddress: `0x${string}`,
    verifierAddress: `0x${string}`,
  ) => viem.deployContract("ModuleProgress", [registryAddress, verifierAddress]);
  const deployLearningBadges = (
    progress: `0x${string}`,
    trackRegistry: `0x${string}`,
  ) => viem.deployContract("LearningBadges", [progress, trackRegistry]);

  type ModuleRegistryContract = Awaited<
    ReturnType<typeof deployModuleRegistry>
  >;
  type TrackRegistryContract = Awaited<ReturnType<typeof deployTrackRegistry>>;
  type ModuleProgressContract = Awaited<
    ReturnType<typeof deployModuleProgress>
  >;
  type LearningBadgesContract = Awaited<
    ReturnType<typeof deployLearningBadges>
  >;
  type MockVerifierContract = Awaited<ReturnType<typeof deployVerifier>>;

  let moduleRegistry: ModuleRegistryContract;
  let trackRegistry: TrackRegistryContract;
  let moduleProgress: ModuleProgressContract;
  let learningBadges: LearningBadgesContract;
  let verifier: MockVerifierContract;

  const addressAsUint = (address: `0x${string}`) => BigInt(address);
  const makeCommitment = (answer: string, salt: string) =>
    keccak256(encodePacked(["string", "string"], [answer, salt]));

  const buildProof = (
    moduleId: bigint,
    commitment: `0x${string}`,
    offset: bigint,
  ) => {
    const a: [bigint, bigint] = [1n + offset, 2n + offset];
    const b: [[bigint, bigint], [bigint, bigint]] = [
      [3n + offset, 4n + offset],
      [5n + offset, 6n + offset],
    ];
    const c: [bigint, bigint] = [7n + offset, 8n + offset];
    const input = [
      addressAsUint(learner.account.address),
      moduleId,
      BigInt(commitment),
    ];
    return { a, b, c, input };
  };

  const registerProof = async (proof: ReturnType<typeof buildProof>) => {
    await verifier.write.setValidProof([proof.a, proof.b, proof.c, proof.input]);
  };

  const claimCompletion = async (
    moduleId: bigint,
    commitment: `0x${string}`,
    offset: bigint,
  ) => {
    await moduleProgress.write.setModuleCommitment(
      [moduleId, commitment],
      { account: author.account },
    );
    const proof = buildProof(moduleId, commitment, offset);
    await registerProof(proof);
    const txHash = await moduleProgress.write.claimModuleCompletion(
      [moduleId, proof.a, proof.b, proof.c, proof.input],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: txHash });
  };

  beforeEach(async () => {
    moduleRegistry = await deployModuleRegistry();
    await moduleRegistry.write.createModule(
      ["Intro to Hashes", "Hashing basics", "ipfs://mod1", "bafy-mod1"],
      { account: author.account },
    );
    await moduleRegistry.write.createModule(
      ["Merkle Proofs", "Trees", "ipfs://mod2", "bafy-mod2"],
      { account: author.account },
    );

    trackRegistry = await deployTrackRegistry();
    await trackRegistry.write.createTrack(
      ["ZK Fundamentals", [0n, 1n]],
      { account: author.account },
    );

    verifier = await deployVerifier();
    moduleProgress = await deployModuleProgress(
      moduleRegistry.address,
      verifier.address,
    );
    learningBadges = await deployLearningBadges(
      moduleProgress.address,
      trackRegistry.address,
    );
  });

  it("mints module badges after completion proofs", async () => {
    const commitment = makeCommitment("answer1", "salt1");
    await claimCompletion(0n, commitment, 0n);

    const txHash = await learningBadges.write.mintModuleBadge(
      [learner.account.address, 0n],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const hasBadge = await learningBadges.read.hasModuleBadge([
      learner.account.address,
      0n,
    ]);
    assert.equal(hasBadge, true);
  });

  it("rejects module badge minting without completion", async () => {
    await viem.assertions.revertWithCustomError(
      learningBadges.write.mintModuleBadge([learner.account.address, 0n], {
        account: learner.account,
      }),
      learningBadges,
      "MissingModuleCompletion",
    );
  });

  it("mints track badges only after all modules are completed", async () => {
    const commitment0 = makeCommitment("answer1", "salt1");
    const commitment1 = makeCommitment("answer2", "salt2");
    await claimCompletion(0n, commitment0, 0n);
    await viem.assertions.revertWithCustomError(
      learningBadges.write.mintTrackBadge([0n], {
        account: learner.account,
      }),
      learningBadges,
      "TrackModulesIncomplete",
    );

    await claimCompletion(1n, commitment1, 10n);
    const txHash = await learningBadges.write.mintTrackBadge([0n], {
      account: learner.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const events = await publicClient.getContractEvents({
      address: learningBadges.address,
      abi: learningBadges.abi,
      eventName: "TrackBadgeMinted",
      strict: true,
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].args.trackId, 0n);
  });

  it("prevents duplicate module badge mints", async () => {
    const commitment = makeCommitment("answer1", "salt1");
    await claimCompletion(0n, commitment, 0n);
    const mintTx = await learningBadges.write.mintModuleBadge(
      [learner.account.address, 0n],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: mintTx });

    await viem.assertions.revertWithCustomError(
      learningBadges.write.mintModuleBadge([learner.account.address, 0n], {
        account: learner.account,
      }),
      learningBadges,
      "ModuleBadgeAlreadyMinted",
    );
  });

  it("allows holders to burn their badge", async () => {
    const commitment = makeCommitment("answer1", "salt1");
    await claimCompletion(0n, commitment, 0n);
    const mintTx = await learningBadges.write.mintModuleBadge(
      [learner.account.address, 0n],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: mintTx });

    const badgeId = await learningBadges.read.moduleBadgeTokenId([
      learner.account.address,
      0n,
    ]);

    const burnTx = await learningBadges.write.burn([badgeId], {
      account: learner.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: burnTx });

    assert.equal(
      await learningBadges.read.ownerOf([badgeId]),
      "0x0000000000000000000000000000000000000000",
    );
  });
});
