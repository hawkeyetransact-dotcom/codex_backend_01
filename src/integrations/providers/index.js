import { genericWebhookProvider } from "./genericWebhook.js";
import { csvUploadProvider } from "./csvUpload.js";
import { demoSimulatorProvider } from "./demoSimulator.js";
import { createStubProvider } from "./stubProvider.js";

const registry = new Map();

[
  genericWebhookProvider,
  csvUploadProvider,
  demoSimulatorProvider,
  createStubProvider("trackwise", "TrackWise"),
  createStubProvider("sap_s4", "SAP S/4HANA"),
  createStubProvider("sftp_drop", "SFTP Drop"),
].forEach((provider) => registry.set(provider.providerKey, provider));

export const getProvider = (providerKey) => registry.get(providerKey);

export const listProviders = () => Array.from(registry.values());
