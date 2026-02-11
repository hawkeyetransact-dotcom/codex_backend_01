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
  createStubProvider("email_inbox", "Email Inbox", { supportsPolling: true, supportsApiAuth: true }),
  createStubProvider("gmail_inbox", "Gmail Inbox", { supportsPolling: true, supportsApiAuth: true }),
  createStubProvider("outlook_inbox", "Outlook Inbox", { supportsPolling: true, supportsApiAuth: true }),
  createStubProvider("google_drive", "Google Drive", { supportsPolling: true, supportsApiAuth: true }),
  createStubProvider("box_drive", "Box", { supportsPolling: true, supportsApiAuth: true }),
].forEach((provider) => registry.set(provider.providerKey, provider));

export const getProvider = (providerKey) => registry.get(providerKey);

export const listProviders = () => Array.from(registry.values());
