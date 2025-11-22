import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { network } from "hardhat";

describe("TrackRegistry", async () => {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer, anotherAccount] = await viem.getWalletClients();

  const deployTrackRegistry = () => viem.deployContract("TrackRegistry");
  type TrackRegistryContract = Awaited<
    ReturnType<typeof deployTrackRegistry>
  >;

  let trackRegistry: TrackRegistryContract;

  beforeEach(async () => {
    trackRegistry = await deployTrackRegistry();
  });

  const createTrack = async (options?: {
    title?: string;
    moduleIds?: bigint[];
    author?: typeof deployer.account;
  }) => {
    const args = {
      title: options?.title ?? "Track 1",
      moduleIds: options?.moduleIds ?? [1n, 2n],
    };

    const txHash = await trackRegistry.write.createTrack(
      [args.title, args.moduleIds],
      { account: options?.author ?? deployer.account },
    );

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const total = await trackRegistry.read.totalTracks();
    return total - 1n;
  };

  it("stores title, author, moduleIds and timestamps", async () => {
    const moduleIds = [5n, 10n, 15n];

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

    const track = await trackRegistry.read.getTrack([0n]);

    assert.equal(track.title, "Advanced ZK");
    assert.equal(
      track.author.toLowerCase(),
      deployer.account.address.toLowerCase(),
    );
    assert.deepEqual(track.moduleIds, moduleIds);
    assert.equal(track.createdAt, block.timestamp);
  });

  it("preserves the order of module ids", async () => {
    const moduleIds = [11n, 2n, 9n];
    const trackId = await createTrack({
      title: "Mixed Track",
      moduleIds,
      author: anotherAccount.account,
    });

    const created = await trackRegistry.read.getTrack([trackId]);

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

    const stored = await trackRegistry.read.getTrack([trackId]);

    assert.equal(stored.title, "Stored Track");
  });

  it("tracks total number of stored tracks", async () => {
    await createTrack({ title: "Track A" });
    await createTrack({ title: "Track B" });
    await createTrack({ title: "Track C" });

    assert.equal(await trackRegistry.read.totalTracks(), 3n);
  });

  it("returns the correct slice when paginating tracks", async () => {
    const titles = ["One", "Two", "Three", "Four"];
    for (const title of titles) {
      await createTrack({ title });
    }

    const page = await trackRegistry.read.getTracks([1n, 2n]);
    const pageTitles = page.map((track: any) => track.title);

    assert.deepEqual(pageTitles, ["Two", "Three"]);
  });

  it("allows pagination ranges that overflow the available amount", async () => {
    await createTrack({ title: "Solo track" });

    const page = await trackRegistry.read.getTracks([0n, 5n]);

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
});
