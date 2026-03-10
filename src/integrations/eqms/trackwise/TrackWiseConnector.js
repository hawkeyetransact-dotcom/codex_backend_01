import { BaseEqmsConnector } from "../BaseEqmsConnector.js";

export class TrackWiseConnector extends BaseEqmsConnector {
  constructor() {
    super({
      systemKey: "trackwise",
      displayName: "TrackWise",
      providerAliases: ["trackwise"],
    });
  }
}
