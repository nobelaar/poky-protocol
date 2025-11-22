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
  const deployModuleProgress = (registryAddress: `0x${string}`) =>
    viem.deployContract("ModuleProgress", [registryAddress]);
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

  let moduleRegistry: ModuleRegistryContract;
  let trackRegistry: TrackRegistryContract;
  let moduleProgress: ModuleProgressContract;
  let learningBadges: LearningBadgesContract;

  const saltFor = (input: string) =>
    keccak256(encodePacked(["string"], [input]));
  const providedHashFor = (answer: string) =>
    keccak256(encodePacked(["string"], [answer]));
  const makeCommitment = (answer: string, saltSeed: string) => {
    const providedHash = providedHashFor(answer);
    const salt = saltFor(saltSeed);
    const commitment = keccak256(
      encodePacked(["bytes32", "bytes32"], [providedHash, salt]),
    );
    return { commitment, providedHash, salt };
  };

  const claimCompletion = async (
    moduleId: bigint,
    sectionId: bigint,
    providedHash: `0x${string}`,
    salt: `0x${string}`,
  ) => {
    const txHash = await moduleProgress.write.claimSectionCompletion(
      [moduleId, sectionId, providedHash, salt],
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

    trackRegistry = await deployTrackRegistry();
    await trackRegistry.write.createTrack(
      ["ZK Fundamentals", [0n, 1n]],
      { account: author.account },
    );

    moduleProgress = await deployModuleProgress(moduleRegistry.address);
    learningBadges = await deployLearningBadges(
      moduleProgress.address,
      trackRegistry.address,
    );
  });

  it("mints module badges after completion proofs", async () => {
    const section0 = makeCommitment("answer1", "salt1");
    const section1 = makeCommitment("answer1b", "salt1b");
    await moduleProgress.write.setSectionCommitment([0n, section0.commitment], {
      account: author.account,
    });
    await moduleProgress.write.setSectionCommitment([0n, section1.commitment], {
      account: author.account,
    });
    await claimCompletion(0n, 0n, section0.providedHash, section0.salt);
    await claimCompletion(0n, 1n, section1.providedHash, section1.salt);

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
    const section00 = makeCommitment("answer1", "salt1");
    const section01 = makeCommitment("answer1b", "salt1b");
    const section10 = makeCommitment("answer2", "salt2");
    await moduleProgress.write.setSectionCommitment([0n, section00.commitment], {
      account: author.account,
    });
    await moduleProgress.write.setSectionCommitment([0n, section01.commitment], {
      account: author.account,
    });
    await claimCompletion(0n, 0n, section00.providedHash, section00.salt);
    await viem.assertions.revertWithCustomError(
      learningBadges.write.mintTrackBadge([0n], {
        account: learner.account,
      }),
      learningBadges,
      "TrackModulesIncomplete",
    );

    await moduleProgress.write.setSectionCommitment([1n, section10.commitment], {
      account: author.account,
    });
    await claimCompletion(0n, 1n, section01.providedHash, section01.salt);
    await claimCompletion(1n, 0n, section10.providedHash, section10.salt);
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
    const section0 = makeCommitment("answer1", "salt1");
    const section1 = makeCommitment("answer1b", "salt1b");
    await moduleProgress.write.setSectionCommitment([0n, section0.commitment], {
      account: author.account,
    });
    await moduleProgress.write.setSectionCommitment([0n, section1.commitment], {
      account: author.account,
    });
    await claimCompletion(0n, 0n, section0.providedHash, section0.salt);
    await claimCompletion(0n, 1n, section1.providedHash, section1.salt);
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
    const section0 = makeCommitment("answer1", "salt1");
    const section1 = makeCommitment("answer1b", "salt1b");
    await moduleProgress.write.setSectionCommitment([0n, section0.commitment], {
      account: author.account,
    });
    await moduleProgress.write.setSectionCommitment([0n, section1.commitment], {
      account: author.account,
    });
    await claimCompletion(0n, 0n, section0.providedHash, section0.salt);
    await claimCompletion(0n, 1n, section1.providedHash, section1.salt);
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
