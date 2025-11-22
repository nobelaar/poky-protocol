import { network } from "hardhat";

const { viem } = await network.connect();

const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

console.log("Deploying TrackRegistry from", deployer.account.address);

const trackRegistry = await viem.deployContract("TrackRegistry");
const latestBlock = await publicClient.getBlockNumber();

console.log("TrackRegistry deployed to:", trackRegistry.address);
console.log("Deployment block:", latestBlock.toString());
console.log(
  "Initial total tracks:",
  ((await trackRegistry.read.totalTracks()) as bigint).toString(),
);
