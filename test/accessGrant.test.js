import assert from "assert";
import { enforceTenant } from "../src/controllers/askHawkController.js";

const run = () => {
  assert.equal(enforceTenant("abc", "abc"), true);
  assert.equal(enforceTenant("abc", "def"), false);
};

run();
