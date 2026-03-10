import { BaseEqmsConnector } from "../BaseEqmsConnector.js";

export class VeevaVaultConnector extends BaseEqmsConnector {
  constructor() {
    super({
      systemKey: "veeva",
      displayName: "Veeva Vault QMS",
      providerAliases: ["veeva", "veeva_vault", "veeva_vault_qms"],
    });
  }
}
