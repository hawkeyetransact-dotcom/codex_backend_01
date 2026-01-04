import dotenv from "dotenv";
import { runAll, runConnector } from "../src/services/publicIntel/index.js";
import { connectDatabase } from "../src/config/database.js";

dotenv.config();

const args = process.argv.slice(2);
const getArg = (key) => {
  const prefix = `--${key}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.replace(prefix, "") : null;
};

const main = async () => {
  await connectDatabase();
  const source = getArg("source");
  const all = getArg("all");

  if (source) {
    const res = await runConnector(source);
    // eslint-disable-next-line no-console
    console.log(`Ran connector ${source}`, res);
  } else if (all !== null || !source) {
    const res = await runAll();
    console.log("Ran all connectors", res);
  }
  process.exit(0);
};

main().catch((err) => {
  console.error("publicIntelSync failed", err);
  process.exit(1);
});

