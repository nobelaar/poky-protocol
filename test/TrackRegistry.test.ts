import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { network } from "hardhat";

describe("TrackRegistry", async () => {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer, anotherAccount] = await viem.getWalletClients();
  type TrackStruct = {
    id: bigint;
    title: string;
    author: `0x${string}`;
    moduleIds: bigint[];
    createdAt: bigint;
  };

  const deployModuleRegistry = () => viem.deployContract("ModuleRegistry");
  const deployTrackRegistry = (moduleRegistry: `0x${string}`) =>
    viem.deployContract("TrackRegistry", [moduleRegistry]);
  type ModuleRegistryContract = Awaited<
    ReturnType<typeof deployModuleRegistry>
  >;
  type TrackRegistryContract = Awaited<
    ReturnType<typeof deployTrackRegistry>
  >;

  let moduleRegistry: ModuleRegistryContract;
  let trackRegistry: TrackRegistryContract;
  let availableModuleIds: bigint[];

  const createModule = async (title: string) => {
    const txHash = await moduleRegistry.write.createModule(
      [title, "Description", "image.png", "bafy", 1n],
      { account: deployer.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const total = (await moduleRegistry.read.totalModules()) as bigint;
    return total - 1n;
  };

  beforeEach(async () => {
    moduleRegistry = await deployModuleRegistry();
    availableModuleIds = [];

    const titles = ["Intro", "Basics", "Advanced", "Security", "Tooling"];
    for (const title of titles) {
      const moduleId = await createModule(title);
      availableModuleIds.push(moduleId);
    }

    trackRegistry = await deployTrackRegistry(moduleRegistry.address);
  });

  const createTrack = async (options?: {
    title?: string;
    moduleIds?: bigint[];
    author?: typeof deployer.account;
  }) => {
    const args = {
      title: options?.title ?? "Track 1",
      moduleIds: options?.moduleIds ?? [availableModuleIds[0], availableModuleIds[1]],
    };

    const txHash = await trackRegistry.write.createTrack(
      [args.title, args.moduleIds],
      { account: options?.author ?? deployer.account },
    );

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const total = (await trackRegistry.read.totalTracks()) as bigint;
    return total - 1n;
  };

  it("stores title, author, moduleIds and timestamps", async () => {
    const moduleIds = [availableModuleIds[3], availableModuleIds[1], availableModuleIds[4]];

    const txHash = await trackRegistry.write.createTrack(
      ["Advanced ZK", moduleIds],
      { account: deployer.account },
    );
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    const block = await publicClient.getBlock({
      blockNumber: receipt.blockNumber,
    });

    const track = (await trackRegistry.read.getTrack([0n])) as TrackStruct;

    assert.equal(track.title, "Advanced ZK");
    assert.equal(
      track.author.toLowerCase(),
      deployer.account.address.toLowerCase(),
    );
    assert.deepEqual(track.moduleIds, moduleIds);
    assert.equal(track.createdAt, block.timestamp);
  });

  it("preserves the order of module ids", async () => {
    const moduleIds = [availableModuleIds[2], availableModuleIds[0], availableModuleIds[4]];
    const trackId = await createTrack({
      title: "Mixed Track",
      moduleIds,
      author: anotherAccount.account,
    });

    const created = (await trackRegistry.read.getTrack([trackId])) as TrackStruct;

    assert.deepEqual(created.moduleIds, moduleIds);
  });

  it("returns incremental track ids", async () => {
    const firstId = await createTrack({ title: "Intro" });
    const secondId = await createTrack({
      title: "Intermediate",
      author: anotherAccount.account,
    });

    assert.equal(firstId, 0n);
    assert.equal(secondId, 1n);
  });

  it("retrieves tracks by id", async () => {
    const trackId = await createTrack({ title: "Stored Track" });

    const stored = (await trackRegistry.read.getTrack([trackId])) as TrackStruct;

    assert.equal(stored.title, "Stored Track");
  });

  it("tracks total number of stored tracks", async () => {
    await createTrack({ title: "Track A" });
    await createTrack({ title: "Track B" });
    await createTrack({ title: "Track C" });

    assert.equal((await trackRegistry.read.totalTracks()) as bigint, 3n);
  });

  it("returns the correct slice when paginating tracks", async () => {
    const titles = ["One", "Two", "Three", "Four"];
    for (const title of titles) {
      await createTrack({ title });
    }

    const page = (await trackRegistry.read.getTracks([1n, 2n])) as TrackStruct[];
    const pageTitles = page.map((track) => track.title);

    assert.deepEqual(pageTitles, ["Two", "Three"]);
  });

  it("allows pagination ranges that overflow the available amount", async () => {
    await createTrack({ title: "Solo track" });

    const page = (await trackRegistry.read.getTracks([0n, 5n])) as TrackStruct[];

    assert.equal(page.length, 1);
    assert.equal(page[0].title, "Solo track");
  });

  it("reverts when creating a track with no modules", async () => {
    await viem.assertions.revertWithCustomError(
      trackRegistry.write.createTrack(["Empty Track", [] as bigint[]]),
      trackRegistry,
      "EmptyModuleIds",
    );
  });

  it("reverts when fetching a non existing track", async () => {
    await viem.assertions.revertWithCustomError(
      trackRegistry.read.getTrack([0n]),
      trackRegistry,
      "TrackNotFound",
    );
  });

  it("reverts when any module id does not exist", async () => {
    await viem.assertions.revertWithCustomError(
      trackRegistry.write.createTrack([
        "Invalid Track",
        [availableModuleIds[0], 99n],
      ]),
      moduleRegistry,
      "ModuleNotFound",
    );
  });

  it("creates tracks when all module ids are valid", async () => {
    const moduleIds = [availableModuleIds[1], availableModuleIds[2]];
    const trackId = await createTrack({
      title: "Valid Modules",
      moduleIds,
    });

    const stored = (await trackRegistry.read.getTrack([trackId])) as TrackStruct;

    assert.equal(stored.title, "Valid Modules");
    assert.deepEqual(stored.moduleIds, moduleIds);
  });
});
