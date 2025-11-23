import { network } from "hardhat";

const { viem } = await network.connect();

const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

const moduleRegistryAddress = process.env.MODULE_REGISTRY_ADDRESS;
if (!moduleRegistryAddress) {
  throw new Error("MODULE_REGISTRY_ADDRESS env var is required");
}

console.log("Deploying TrackRegistry from", deployer.account.address);

const trackRegistry = await viem.deployContract("TrackRegistry", [
  moduleRegistryAddress as `0x${string}`,
]);
const latestBlock = await publicClient.getBlockNumber();

console.log("TrackRegistry deployed to:", trackRegistry.address);
console.log("Deployment block:", latestBlock.toString());
console.log(
  "Initial total tracks:",
  ((await trackRegistry.read.totalTracks()) as bigint).toString(),
);
