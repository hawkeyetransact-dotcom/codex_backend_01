import express from "express";
import { authenticate } from "../middlewares/authMiddleware.js";
import { permit } from "../middlewares/roleMiddleware.js";
import { validate } from "../middlewares/validate.js";
import { requireAnyTenantFeature } from "../middlewares/featureFlagMiddleware.js";
import {
  bulkPreviewCatalogRows,
  createCatalogClaim,
  createCatalogProduct,
  getCatalogClaimContext,
  getCatalogProductDetail,
  getLegacyFacadeClaims,
  getMarketplaceCatalogHealth,
  getMarketplaceSourceExplorerEventsController,
  getMarketplaceSourceExplorerSummaryController,
  getMarketplaceFormSchema,
  getMarketplaceFormUi,
  getMarketplaceSourceManifest,
  listCatalogClaims,
  listCatalogProducts,
  previewCatalogMatches,
} from "../controllers/marketplaceCatalogController.js";
import {
  bulkPreviewValidator,
  catalogProductPayloadValidator,
  supplierClaimPayloadValidator,
} from "../validators/marketplaceCatalogValidators.js";

const router = express.Router();

router.use(authenticate);
router.use(
  requireAnyTenantFeature(
    ["marketplaceCatalog", "productLibraryV2"],
    "Marketplace catalog is not enabled"
  )
);

router.get("/health", getMarketplaceCatalogHealth);
router.get("/form/schema", getMarketplaceFormSchema);
router.get("/form/ui", getMarketplaceFormUi);
router.get("/sources", getMarketplaceSourceManifest);
router.get("/source-explorer/summary", getMarketplaceSourceExplorerSummaryController);
router.get("/source-explorer/events", getMarketplaceSourceExplorerEventsController);
router.get("/products", listCatalogProducts);
router.get("/products/:productId", getCatalogProductDetail);
router.post(
  "/products",
  permit("supplier", "supplierUser", "buyer", "admin", "tenant_admin", "superadmin"),
  validate(catalogProductPayloadValidator),
  createCatalogProduct
);
router.post(
  "/products/match-preview",
  permit("supplier", "supplierUser", "buyer", "admin", "tenant_admin", "superadmin"),
  previewCatalogMatches
);
router.get(
  "/claims/context",
  permit("supplier", "supplierUser", "buyer", "admin", "tenant_admin", "superadmin"),
  getCatalogClaimContext
);
router.get(
  "/claims",
  permit("supplier", "supplierUser", "buyer", "admin", "tenant_admin", "superadmin"),
  listCatalogClaims
);
router.get(
  "/claims/legacy-facade",
  permit("supplier", "supplierUser", "buyer", "admin", "tenant_admin", "superadmin"),
  getLegacyFacadeClaims
);
router.post(
  "/claims",
  permit("supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  validate(supplierClaimPayloadValidator),
  createCatalogClaim
);
router.post(
  "/bulk/preview",
  permit("supplier", "supplierUser", "admin", "tenant_admin", "superadmin"),
  validate(bulkPreviewValidator),
  bulkPreviewCatalogRows
);

export default router;
