import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { network } from "hardhat";
import { encodePacked, keccak256 } from "viem";

describe("LearningBadges", async () => {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [author, learner] = await viem.getWalletClients();

  const deployModuleRegistry = () => viem.deployContract("ModuleRegistry");
  const deployTrackRegistry = (moduleRegistry: `0x${string}`) =>
    viem.deployContract("TrackRegistry", [moduleRegistry]);
  const deployVerifier = () => viem.deployContract("MockVerifier");
  const deployModuleProgress = (
    registryAddress: `0x${string}`,
    verifier: `0x${string}`,
  ) => viem.deployContract("ModuleProgress", [registryAddress, verifier]);
  const deployLearningBadges = (
    progress: `0x${string}`,
    trackRegistry: `0x${string}`,
  ) => viem.deployContract("LearningBadges", [progress, trackRegistry]);

  type ModuleRegistryContract = Awaited<
    ReturnType<typeof deployModuleRegistry>
  >;
  type TrackRegistryContract = Awaited<
    ReturnType<typeof deployTrackRegistry>
  >;
  type ModuleProgressContract = Awaited<
    ReturnType<typeof deployModuleProgress>
  >;
  type LearningBadgesContract = Awaited<
    ReturnType<typeof deployLearningBadges>
  >;
  type VerifierContract = Awaited<ReturnType<typeof deployVerifier>>;

  let moduleRegistry: ModuleRegistryContract;
  let trackRegistry: TrackRegistryContract;
  let verifier: VerifierContract;
  let moduleProgress: ModuleProgressContract;
  let learningBadges: LearningBadgesContract;

  const makeCommitment = (label: string) =>
    keccak256(encodePacked(["string"], [label]));
  const proofFor = (label: string) =>
    encodePacked(["string"], [`proof-${label}`]);
  const registerProof = async (
    proof: `0x${string}`,
    commitment: `0x${string}`,
  ) => {
    await verifier.write.setValidProof([proof, [commitment]]);
  };

  const claimCompletion = async (
    moduleId: bigint,
    sectionId: bigint,
    proof: `0x${string}`,
  ) => {
    const txHash = await moduleProgress.write.claimSectionCompletion(
      [moduleId, sectionId, proof],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: txHash });
  };

  beforeEach(async () => {
    moduleRegistry = await deployModuleRegistry();
    await moduleRegistry.write.createModule(
      [
        "Intro to Hashes",
        "Hashing basics",
        "ipfs://mod1",
        "bafy-mod1",
        2n,
      ],
      { account: author.account },
    );
    await moduleRegistry.write.createModule(
      [
        "Merkle Proofs",
        "Trees",
        "ipfs://mod2",
        "bafy-mod2",
        1n,
      ],
      { account: author.account },
    );

    trackRegistry = await deployTrackRegistry(moduleRegistry.address);
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
    const section0 = makeCommitment("answer1");
    const section1 = makeCommitment("answer1b");
    await moduleProgress.write.setSectionCommitment([0n, section0], {
      account: author.account,
    });
    await moduleProgress.write.setSectionCommitment([0n, section1], {
      account: author.account,
    });
    const proof0 = proofFor("answer1");
    const proof1 = proofFor("answer1b");
    await registerProof(proof0, section0);
    await registerProof(proof1, section1);
    await claimCompletion(0n, 0n, proof0);
    await claimCompletion(0n, 1n, proof1);

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
    const section00 = makeCommitment("answer1");
    const section01 = makeCommitment("answer1b");
    const section10 = makeCommitment("answer2");
    await moduleProgress.write.setSectionCommitment([0n, section00], {
      account: author.account,
    });
    await moduleProgress.write.setSectionCommitment([0n, section01], {
      account: author.account,
    });
    const proof00 = proofFor("answer1");
    const proof01 = proofFor("answer1b");
    const proof10 = proofFor("answer2");
    await registerProof(proof00, section00);
    await registerProof(proof01, section01);
    await registerProof(proof10, section10);
    await claimCompletion(0n, 0n, proof00);
    await viem.assertions.revertWithCustomError(
      learningBadges.write.mintTrackBadge([0n], {
        account: learner.account,
      }),
      learningBadges,
      "TrackModulesIncomplete",
    );

    await moduleProgress.write.setSectionCommitment([1n, section10], {
      account: author.account,
    });
    await claimCompletion(0n, 1n, proof01);
    await claimCompletion(1n, 0n, proof10);
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
    const [mintEvent] = events as Array<{ args: { trackId: bigint } }>;
    assert.equal(mintEvent.args.trackId, 0n);
  });

  it("prevents duplicate module badge mints", async () => {
    const section0 = makeCommitment("answer1");
    const section1 = makeCommitment("answer1b");
    await moduleProgress.write.setSectionCommitment([0n, section0], {
      account: author.account,
    });
    await moduleProgress.write.setSectionCommitment([0n, section1], {
      account: author.account,
    });
    const proof0 = proofFor("answer1");
    const proof1 = proofFor("answer1b");
    await registerProof(proof0, section0);
    await registerProof(proof1, section1);
    await claimCompletion(0n, 0n, proof0);
    await claimCompletion(0n, 1n, proof1);
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
    const section0 = makeCommitment("answer1");
    const section1 = makeCommitment("answer1b");
    await moduleProgress.write.setSectionCommitment([0n, section0], {
      account: author.account,
    });
    await moduleProgress.write.setSectionCommitment([0n, section1], {
      account: author.account,
    });
    const proof0 = proofFor("answer1");
    const proof1 = proofFor("answer1b");
    await registerProof(proof0, section0);
    await registerProof(proof1, section1);
    await claimCompletion(0n, 0n, proof0);
    await claimCompletion(0n, 1n, proof1);
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
