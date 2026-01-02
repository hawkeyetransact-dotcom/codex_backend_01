export const supplierProductsDocs = {
  tags: [
    {
      name: "Supplier Products",
      description: "APIs for managing supplier Products",
    },
  ],
  paths: {
    "/api/supplier-products/add-products": {
      post: {
        summary: "Bulk upload supplier products via Excel file",
        tags: ["Supplier Products"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: {
                    type: "string",
                    format: "binary",
                    description:
                      "Excel file (.xlsx) containing product data (max 5MB)",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Products added/updated successfully" },
          400: { description: "Validation error or file issues" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/supplier-products/add-product": {
      post: {
        summary: "Add a single supplier product",
        tags: ["Supplier Products"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SupplierMasterProduct" },
            },
          },
        },
        responses: {
          201: { description: "Product added successfully" },
          400: { description: "Validation error" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/supplier-products/update-product/{id}": {
      put: {
        summary: "Update supplier product details",
        tags: ["Supplier Products"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Mapping ID for the product",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SupplierMasterProduct" },
            },
          },
        },
        responses: {
          200: { description: "Product updated successfully" },
          400: { description: "Validation error or duplicate casNumber" },
          404: { description: "Mapping or product not found" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/supplier-products/delete-product/{id}": {
      delete: {
        summary: "Delete a supplier product mapping",
        tags: ["Supplier Products"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Mapping ID to delete",
          },
        ],
        responses: {
          200: { description: "Product mapping deleted successfully" },
          404: { description: "Mapping not found" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/supplier-products/product-list": {
      get: {
        summary: "Get paginated list of supplier products",
        tags: ["Supplier Products"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", example: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", example: 10 },
          },
        ],
        responses: {
          200: {
            description: "List of product mappings",
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
    "/api/supplier-products/product/{id}": {
      get: {
        summary:
          "Get a single supplier product mapping by ID with supplier profile info",
        tags: ["Supplier Products"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Mapping ID",
          },
        ],
        responses: {
          200: {
            description: "Product mapping details with supplier profile info",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    _id: {
                      type: "string",
                      example: "60d5f99b8a4b2c001c8e4f1c",
                    },
                    user_id: {
                      type: "string",
                      example: "60d5f99b8a4b2c001c8e4f0a",
                    },
                    site_id: { $ref: "#/components/schemas/SupplierSite" },
                    product_id: {
                      $ref: "#/components/schemas/SupplierMasterProduct",
                    },
                    createdAt: { type: "string", format: "date-time" },
                    updatedAt: { type: "string", format: "date-time" },
                    supplierProfileInfo: {
                      $ref: "#/components/schemas/SupplierProfile",
                    },
                  },
                },
              },
            },
          },
          404: { description: "Product mapping not found" },
          500: { description: "Internal server error" },
        },
      },
    },
  },
};
