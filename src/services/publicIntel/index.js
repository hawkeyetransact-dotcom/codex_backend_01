import fdaInspections from "./connectors/fdaInspections.js";
import fdaRecalls from "./connectors/fdaRecalls.js";

export const connectors = {
  [fdaInspections.name]: fdaInspections,
  [fdaRecalls.name]: fdaRecalls,
};

export const runConnector = async (name) => {
  const connector = connectors[name];
  if (!connector) throw new Error(`Unknown connector: ${name}`);
  return connector.run();
};

export const runAll = async () => {
  const results = {};
  for (const key of Object.keys(connectors)) {
    // eslint-disable-next-line no-await-in-loop
    results[key] = await connectors[key].run();
  }
  return results;
};

