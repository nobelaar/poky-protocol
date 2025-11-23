import { network } from "hardhat";

const { viem } = await network.connect();
const [deployer] = await viem.getWalletClients();

console.log("Deploying MockVerifier from", deployer.account.address);

const verifier = await viem.deployContract("MockVerifier");

console.log("MockVerifier deployed at", verifier.address);
