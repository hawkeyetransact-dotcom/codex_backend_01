import { BaseEqmsConnector } from "../BaseEqmsConnector.js";

export class EurofinsConnector extends BaseEqmsConnector {
  constructor() {
    super({
      systemKey: "eurofins",
      displayName: "Eurofins",
      providerAliases: ["eurofins"],
    });
  }
}
