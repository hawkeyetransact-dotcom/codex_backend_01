import { authDocs } from "./auth.js";
import { supplierProfileDocs } from "./supplierProfile.js";
import { supplierSitesDocs } from "./supplierSites.js";
import { supplierProductsDocs } from "./supplierProducts.js";
import { schemas } from "./schemas.js"; // Import schemas
import { supplierUserProfileDocs } from "./supplierUserProfile.js";
import { buyerDocs } from "./buyer.js";
import { auditRequestsDocs } from "./auditRequests.js";
import { auditorsDocs } from "./auditors.js";
import { commonEndpointsDocs } from "./commonEndpoints.js";
import {notificationsDocs} from "./notification.js";

export const swaggerDocs = {
  openapi: "3.0.0",
  info: {
    title: "API Documentation",
    version: "1.0.0",
    description: "API documentation for the backend.",
  },
  tags: [
    ...authDocs.tags,
    ...supplierProfileDocs.tags,
    ...supplierUserProfileDocs.tags,
    ...supplierSitesDocs.tags,
    ...supplierProductsDocs.tags,
    ...buyerDocs.tags,
    ...auditRequestsDocs.tags,
    ...auditorsDocs.tags,
    ...commonEndpointsDocs.tags,
    ...notificationsDocs.tags
  ],
  paths: {
    ...authDocs.paths,
    ...supplierProfileDocs.paths,
    ...supplierUserProfileDocs.paths,
    ...supplierSitesDocs.paths,
    ...supplierProductsDocs.paths,
    ...buyerDocs.paths,
    ...auditRequestsDocs.paths,
    ...auditorsDocs.paths,
    ...commonEndpointsDocs.paths,
    ...notificationsDocs.paths
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas,
  },
};
