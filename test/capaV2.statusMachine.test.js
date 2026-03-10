import assert from "assert";
import { assertCapaV2Transition, canTransitionCapaV2Status, isValidCapaV2Status } from "../src/modules/capaV2/statusMachine.js";

const run = () => {
  assert.strictEqual(isValidCapaV2Status("CAPA_OPEN"), true);
  assert.strictEqual(isValidCapaV2Status("UNKNOWN"), false);
  assert.strictEqual(canTransitionCapaV2Status("CAPA_OPEN", "INVESTIGATION_IN_PROGRESS"), true);
  assert.strictEqual(canTransitionCapaV2Status("CAPA_OPEN", "CLOSED_EFFECTIVE"), false);

  assert.throws(
    () =>
      assertCapaV2Transition({
        fromStatus: "UNDER_TRIAGE",
        toStatus: "CAPA_OPEN",
        capa: {},
      }),
    /Missing required CAPA fields/
  );

  assert.doesNotThrow(() =>
    assertCapaV2Transition({
      fromStatus: "CAPA_OPEN",
      toStatus: "INVESTIGATION_IN_PROGRESS",
      capa: { sourceIntakeId: "x", ownerUserId: "y", dueDate: new Date() },
    })
  );
};

run();
