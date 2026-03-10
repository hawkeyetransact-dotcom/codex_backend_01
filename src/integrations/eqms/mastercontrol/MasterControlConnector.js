import { BaseEqmsConnector } from "../BaseEqmsConnector.js";

export class MasterControlConnector extends BaseEqmsConnector {
  constructor() {
    super({
      systemKey: "mastercontrol",
      displayName: "MasterControl",
      providerAliases: ["mastercontrol", "master_control"],
    });
  }
}
