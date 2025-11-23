import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { network } from "hardhat";
import { encodePacked, keccak256, isAddress, type Address } from "viem";

type StablecoinsTrack = {
  title?: string;
  moduleTitle?: string;
  moduleDescription?: string;
  moduleImage?: string;
  moduleIpfsCid?: string;
  sections: Array<{
    title: string;
    description?: string;
    subsections?: Array<{
      title?: string;
      type: "INFO" | "SIMPLE_SELECTION" | "MULTIPLE_SELECTION";
      content: string;
      options?: string[];
      answerHash?: string;
      answersHash?: string;
    }>;
  }>;
};

type DeploymentAddresses = {
  moduleRegistry: Address;
  trackRegistry: Address;
  verifier: Address;
  moduleProgress: Address;
  learningBadges: Address;
};

const getFlag = (flag: string) => {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
};

const normalizeAddress = (label: string, value: string | undefined) => {
  if (!value) return undefined;
  if (!isAddress(value)) {
    throw new Error(`${label} must be a valid address`);
  }
  return value as Address;
};

const deployOrReuse = async (
  viem: Awaited<ReturnType<typeof network.connect>>["viem"],
  flagValue: Address | undefined,
  deployer: Awaited<ReturnType<Awaited<ReturnType<typeof network.connect>>["viem"]["getWalletClients"]>>[number],
  contractName: "ModuleRegistry" | "TrackRegistry" | "MockVerifier" | "ModuleProgress" | "LearningBadges",
  args: ReadonlyArray<any> = [],
) => {
  if (flagValue) {
    console.log(`${contractName} provided:`, flagValue);
    return viem.getContractAt(contractName, flagValue);
  }

  console.log(`Deploying ${contractName} from`, deployer.account.address);
  return viem.deployContract(contractName, args);
};

const loadStablecoinsData = async () => {
  const raw = await fs.readFile("examples/stablecoins-track.json", "utf8");
  return JSON.parse(raw) as StablecoinsTrack;
};

const buildTrackPayload = async (stablecoins: StablecoinsTrack) => {
  const trackTitle =
    process.env.STABLECOINS_TRACK_TITLE ??
    stablecoins.title ??
    "Stablecoins – Demo end-to-end";
  const moduleTitle =
    process.env.STABLECOINS_MODULE_TITLE ??
    stablecoins.moduleTitle ??
    "Stablecoins 101 (demo)";
  const moduleDescription =
    process.env.STABLECOINS_MODULE_DESCRIPTION ??
    stablecoins.moduleDescription ??
    "Módulo introductorio a stablecoins para el flujo end-to-end";
  const moduleImage =
    process.env.STABLECOINS_MODULE_IMAGE ??
    stablecoins.moduleImage ??
    "ipfs://placeholder/stablecoins.png";
  const moduleIpfsCid =
    process.env.STABLECOINS_MODULE_IPFS_CID ??
    stablecoins.moduleIpfsCid ??
    "bafy-stablecoins-demo";

  if (!moduleIpfsCid) {
    throw new Error(
      "A module IPFS CID is required (set STABLECOINS_MODULE_IPFS_CID or add moduleIpfsCid to the JSON)",
    );
  }

  return {
    title: trackTitle,
    moduleIds: [],
    newModules: [
      {
        title: moduleTitle,
        description: moduleDescription,
        image: moduleImage,
        ipfsCid: moduleIpfsCid,
        sections: stablecoins.sections,
      },
    ],
  };
};

const writeTempTrack = async (payload: unknown) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "poky-stablecoins-"));
  const filePath = path.join(tempDir, "track.json");
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
  return filePath;
};

const runCreateTrack = async (
  inputPath: string,
  moduleRegistry: Address,
  trackRegistry: Address,
) => {
  const originalArgv = [...process.argv];
  process.argv = [
    ...originalArgv,
    "--input",
    inputPath,
    "--moduleRegistry",
    moduleRegistry,
    "--trackRegistry",
    trackRegistry,
  ];

  await import("./create-track");
  process.argv = originalArgv;
};

const publishCommitmentsAndProofs = async (
  moduleProgress: Awaited<ReturnType<typeof deployOrReuse>>,
  verifier: Awaited<ReturnType<typeof deployOrReuse>>,
  author: Awaited<ReturnType<Awaited<ReturnType<typeof network.connect>>["viem"]["getWalletClients"]>>[number],
  learner: Awaited<ReturnType<Awaited<ReturnType<typeof network.connect>>["viem"]["getWalletClients"]>>[number],
  moduleId: bigint,
  sectionCount: number,
  publicClient: Awaited<ReturnType<Awaited<ReturnType<typeof network.connect>>["viem"]["getPublicClient"]>>,
) => {
  const commitments: `0x${string}`[] = [];
  for (let i = 0; i < sectionCount; i += 1) {
    const label = `stablecoins-section-${i}`;
    const commitment = keccak256(
      encodePacked(["string"], [label]),
    );
    commitments.push(commitment);
  }

  for (const [index, commitment] of commitments.entries()) {
    const txHash = await moduleProgress.write.setSectionCommitment([
      moduleId,
      commitment,
    ], {
      account: author.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(
      `Section ${index} commitment stored (tx: ${txHash}, commitment: ${commitment})`,
    );
  }

  for (const [index, commitment] of commitments.entries()) {
    const proof = encodePacked(["string"], [`proof-stablecoins-${index}`]);
    await verifier.write.setValidProof([proof, [commitment]]);

    const txHash = await moduleProgress.write.claimSectionCompletion(
      [moduleId, BigInt(index), proof],
      { account: learner.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(
      `Section ${index} completion claimed by ${learner.account.address} (tx: ${txHash})`,
    );
  }
};

const main = async () => {
  const moduleRegistryFlag = normalizeAddress(
    "moduleRegistry",
    getFlag("--moduleRegistry") ?? process.env.MODULE_REGISTRY_ADDRESS,
  );
  const trackRegistryFlag = normalizeAddress(
    "trackRegistry",
    getFlag("--trackRegistry") ?? process.env.TRACK_REGISTRY_ADDRESS,
  );
  const verifierFlag = normalizeAddress(
    "verifier",
    getFlag("--verifier") ?? process.env.VERIFIER_ADDRESS,
  );

  const connection = await network.connect();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [deployer, learner] = await viem.getWalletClients();

  console.log("Network:", connection.networkName);
  console.log("Deployer:", deployer.account.address);
  console.log("Learner:", learner.account.address);
  console.log("---------------------------------------");

  const moduleRegistry = await deployOrReuse(
    viem,
    moduleRegistryFlag,
    deployer,
    "ModuleRegistry",
  );
  const trackRegistry = await deployOrReuse(
    viem,
    trackRegistryFlag,
    deployer,
    "TrackRegistry",
    [moduleRegistry.address],
  );
  const verifier = await deployOrReuse(
    viem,
    verifierFlag,
    deployer,
    "MockVerifier",
  );
  const moduleProgress = await deployOrReuse(
    viem,
    undefined,
    deployer,
    "ModuleProgress",
    [moduleRegistry.address, verifier.address],
  );
  const learningBadges = await deployOrReuse(
    viem,
    undefined,
    deployer,
    "LearningBadges",
    [moduleProgress.address, trackRegistry.address],
  );

  const deployments: DeploymentAddresses = {
    moduleRegistry: moduleRegistry.address,
    trackRegistry: trackRegistry.address,
    verifier: verifier.address,
    moduleProgress: moduleProgress.address,
    learningBadges: learningBadges.address,
  };

  console.log("Deployments:", deployments);
  console.log("---------------------------------------");

  const stablecoins = await loadStablecoinsData();
  const trackPayload = await buildTrackPayload(stablecoins);
  const tempPath = await writeTempTrack(trackPayload);

  const modulesBefore = (await moduleRegistry.read.totalModules()) as bigint;
  const tracksBefore = (await trackRegistry.read.totalTracks()) as bigint;

  await runCreateTrack(tempPath, moduleRegistry.address, trackRegistry.address);

  const modulesAfter = (await moduleRegistry.read.totalModules()) as bigint;
  const tracksAfter = (await trackRegistry.read.totalTracks()) as bigint;
  const newModules = modulesAfter - modulesBefore;
  const newTracks = tracksAfter - tracksBefore;

  if (newModules <= 0n || newTracks <= 0n) {
    throw new Error("Track creation failed — no new modules/tracks detected");
  }

  const createdModuleIds = Array.from({ length: Number(newModules) }, (_, i) =>
    modulesBefore + BigInt(i),
  );
  const createdTrackId = tracksAfter - 1n;

  console.log("New module ids:", createdModuleIds.map((id) => id.toString()));
  console.log("Track id:", createdTrackId.toString());
  console.log("---------------------------------------");

  const moduleId = createdModuleIds[0];
  const moduleData = await moduleRegistry.read.getModule([moduleId]);
  const sectionCount = Number(moduleData.sectionCount);

  await publishCommitmentsAndProofs(
    moduleProgress,
    verifier,
    deployer,
    learner,
    moduleId,
    sectionCount,
    publicClient,
  );

  const moduleCompleted = await moduleProgress.read.hasCompletedModule([
    learner.account.address,
    moduleId,
  ]);
  console.log("Module completed:", moduleCompleted);

  const mintModuleTx = await learningBadges.write.mintModuleBadge(
    [learner.account.address, moduleId],
    { account: learner.account },
  );
  await publicClient.waitForTransactionReceipt({ hash: mintModuleTx });
  const moduleBadgeId = await learningBadges.read.moduleBadgeTokenId([
    learner.account.address,
    moduleId,
  ]);
  console.log(
    `Module badge minted with tokenId ${moduleBadgeId.toString()} (tx: ${mintModuleTx})`,
  );

  const mintTrackTx = await learningBadges.write.mintTrackBadge(
    [createdTrackId],
    { account: learner.account },
  );
  await publicClient.waitForTransactionReceipt({ hash: mintTrackTx });
  const trackBadgeId = await learningBadges.read.trackBadgeTokenId([
    learner.account.address,
    createdTrackId,
  ]);
  console.log(
    `Track badge minted with tokenId ${trackBadgeId.toString()} (tx: ${mintTrackTx})`,
  );

  console.log("End-to-end stablecoins flow finished successfully.");
};

main().catch((error) => {
  console.error("Script failed:", error);
  process.exitCode = 1;
});
