import { TrackWiseConnector } from "./trackwise/TrackWiseConnector.js";
import { MasterControlConnector } from "./mastercontrol/MasterControlConnector.js";
import { VeevaVaultConnector } from "./veeva/VeevaVaultConnector.js";
import { EurofinsConnector } from "./eurofins/EurofinsConnector.js";

const registry = new Map([
  ["trackwise", new TrackWiseConnector()],
  ["mastercontrol", new MasterControlConnector()],
  ["veeva", new VeevaVaultConnector()],
  ["eurofins", new EurofinsConnector()],
]);

export const listEqmsConnectors = () =>
  Array.from(registry.values()).map((connector) => ({
    key: connector.systemKey,
    displayName: connector.displayName,
    providerAliases: connector.providerAliases,
    capabilities: connector.getCapabilities(),
  }));

export const getEqmsConnector = (systemKey = "") => registry.get(String(systemKey || "").toLowerCase()) || null;
