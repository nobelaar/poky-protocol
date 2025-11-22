import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { network } from "hardhat";
import { encodePacked, hexToBytes, keccak256 } from "viem";

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

    moduleProgress = await deployModuleProgress(moduleRegistry.address);
    learningBadges = await deployLearningBadges(
      moduleProgress.address,
      trackRegistry.address,
    );
  });

  const signCompletion = async (
    userAddress: `0x${string}`,
    moduleId: bigint,
    nonce: bigint,
  ) => {
    const digest = keccak256(
      encodePacked(
        ["address", "address", "uint256", "uint256"],
        [moduleProgress.address, userAddress, moduleId, nonce],
      ),
    );

    return author.signMessage({
      account: author.account,
      message: { raw: hexToBytes(digest) },
    });
  };

  const claimCompletion = async (moduleId: bigint, nonce: bigint) => {
    const signature = await signCompletion(learner.account.address, moduleId, nonce);
    const txHash = await moduleProgress.write.claimModuleCompletion(
      [moduleId, nonce, signature],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: txHash });
  };

  it("mints module badges after completion proofs", async () => {
    await claimCompletion(0n, 1n);

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
    await claimCompletion(0n, 1n);
    await viem.assertions.revertWithCustomError(
      learningBadges.write.mintTrackBadge([0n], {
        account: learner.account,
      }),
      learningBadges,
      "TrackModulesIncomplete",
    );

    await claimCompletion(1n, 2n);
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
    await claimCompletion(0n, 1n);
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
    await claimCompletion(0n, 1n);
    await learningBadges.write.mintModuleBadge(
      [learner.account.address, 0n],
      { account: learner.account },
    );

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
