export const buyerDocs = {
  tags: [
    {
      name: "Buyer",
      description: "APIs available for buyers",
    },
  ],
  paths: {
    "/api/buyer/auditors": {
      get: {
        summary: "Get a paginated list of auditor users",
        tags: ["Buyer"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1, example: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10, example: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description: "List of auditor users retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    auditors: {
                      type: "array",
                      items: { $ref: "#/components/schemas/User" },
                    },
                    totalRecords: { type: "integer", example: 50 },
                    totalPages: { type: "integer", example: 5 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/buyer/suppliers": {
      get: {
        summary: "Get a paginated list of all suppliers",
        tags: ["Buyer"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description: "List of suppliers retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    suppliers: {
                      type: "array",
                      items: { $ref: "#/components/schemas/User" },
                    },
                    totalRecords: { type: "integer", example: 50 },
                    totalPages: { type: "integer", example: 5 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/buyer/sites": {
      get: {
        summary: "Get a paginated list of supplier sites",
        tags: ["Buyer"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description: "List of supplier sites retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sites: {
                      type: "array",
                      items: { $ref: "#/components/schemas/SupplierSite" },
                    },
                    totalRecords: { type: "integer", example: 50 },
                    totalPages: { type: "integer", example: 5 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/buyer/site-products/{id}": {
      get: {
        summary: "Get products linked to a specific supplier site",
        tags: ["Buyer"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Supplier site ID",
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description:
              "List of product mappings for the given site retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    mappings: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/ProductSiteMapping",
                      },
                    },
                    totalRecords: { type: "integer", example: 20 },
                    totalPages: { type: "integer", example: 2 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/buyer/all-products": {
      get: {
        summary: "Get a paginated list of all product mappings",
        tags: ["Buyer"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description: "List of all product mappings retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    mappings: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/ProductSiteMapping",
                      },
                    },
                    totalRecords: { type: "integer", example: 100 },
                    totalPages: { type: "integer", example: 10 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/buyer/audit-request": {
      post: {
        summary: "Create a new audit request",
        tags: ["Audit Requests"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  supplier_id: {
                    type: "string",
                    example: "60d5f99b8a4b2c001c8e4f0a",
                  },
                  auditor_id: {
                    type: "string",
                    example: "60d5f99b8a4b2c001c8e4f2b",
                  },
                  supplier_product_id: {
                    type: "string",
                    example: "60d5f99b8a4b2c001c8e4f3c",
                  },
                  complianceDate: {
                    type: "string",
                    format: "date",
                    example: "2023-12-31",
                  },
                  site_id: {
                    type: "string",
                    example: "60d5f99b8a4b2c001c8e4f3c",
                  },
                },
                required: [
                  "supplier_id",
                  "auditor_id",
                  "supplier_product_id",
                  "complianceDate",
                  "site_id"
                ],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Audit request created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: {
                      type: "string",
                      example: "Audit request created successfully",
                    },
                    auditRequest: {
                      $ref: "#/components/schemas/AuditRequestMaster",
                    },
                  },
                },
              },
            },
          },
          400: { description: "Validation error or invalid IDs" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/buyer/profile/create": {
      post: {
        summary: "Create a buyer profile",
        tags: ["Buyer"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BuyerProfileRequest" },
            },
          },
        },
        responses: {
          201: { description: "Buyer profile created successfully" },
          400: { description: "Validation error or profile already exists" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/buyer/profile/update": {
      put: {
        summary: "Update buyer profile",
        tags: ["Buyer"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BuyerProfileRequest" },
            },
          },
        },
        responses: {
          200: { description: "Buyer profile updated successfully" },
          404: { description: "Profile not found" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/buyer/products-by-supplier": {
      get: {
        summary: "Get a paginated list of products by supplier",
        tags: ["Buyer"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "supplier_id",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Supplier ID to filter products",
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description:
              "List of product mappings for the specified supplier retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    mappings: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/ProductSiteMapping",
                      },
                    },
                    totalRecords: { type: "integer", example: 50 },
                    totalPages: { type: "integer", example: 5 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          400: { description: "supplier_id query parameter is required" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/buyer/sites-by-supplier": {
      get: {
        summary: "Get a paginated list of products by supplier",
        tags: ["Buyer"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "supplier_id",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Supplier ID to filter products",
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description:
              "List of site mappings for the specified supplier retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    mappings: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/ProductSiteMapping",
                      },
                    },
                    totalRecords: { type: "integer", example: 50 },
                    totalPages: { type: "integer", example: 5 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          400: { description: "supplier_id query parameter is required" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/buyer/suppliers-profile": {
      get: {
        summary: "Get a paginated list of supplier profile",
        tags: ["Buyer"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description:
              "List of Supplier profile retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    mappings: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/ProductSiteMapping",
                      },
                    },
                    totalRecords: { type: "integer", example: 50 },
                    totalPages: { type: "integer", example: 5 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          400: { description: "supplier_id query parameter is required" },
          500: { description: "Internal server error" },
        },
      },
    },

    "/api/buyer/auditors": {
      get: {
        summary: "Get a paginated list of all auditors",
        tags: ["Buyer"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description: "List of auditors retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    auditors: {
                      type: "array",
                      items: { $ref: "#/components/schemas/User" },
                    },
                    totalRecords: { type: "integer", example: 50 },
                    totalPages: { type: "integer", example: 5 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },

    "/api/buyer/suppliers/{id}": {
      get: {
        summary: "Get supplier linked to a specific supplier profile",
        tags: ["Buyer"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Supplier site ID",
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", default: 1 },
            description: "Page number",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description:
              "Supplier profile for the given supplier retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    mappings: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/ProductSiteMapping",
                      },
                    },
                    totalRecords: { type: "integer", example: 20 },
                    totalPages: { type: "integer", example: 2 },
                    currentPage: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          500: { description: "Internal server error" },
        },
      },
    },
  },
};
