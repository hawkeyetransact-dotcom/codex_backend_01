export const supplierSitesDocs = {
  tags: [
    {
      name: "Supplier Sites",
      description: "APIs for managing supplier sites",
    },
  ],
  paths: {
    "/api/supplier-sites/add-sites": {
      post: {
        summary: "Upload an Excel file to add or update supplier sites",
        tags: ["Supplier Sites"],
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
                      "Excel file (.xlsx) containing site data (Max: 5MB)",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Sites added/updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          index: { type: "integer", example: 1 },
                          message: {
                            type: "string",
                            example: "Updated successfully",
                          },
                        },
                      },
                    },
                    errors: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          index: { type: "integer", example: 2 },
                          message: {
                            type: "string",
                            example: "Validation failed for city",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description:
              "Invalid file format, file too large, or validation error",
          },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/supplier-sites/add-site": {
      post: {
        summary: "Add a single supplier site",
        tags: ["Supplier Sites"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SupplierSite" }, // 🔹 Reference SupplierSite schema
            },
          },
        },
        responses: {
          201: { description: "Site added successfully" },
          200: { description: "Site updated successfully" },
          400: { description: "Validation error" },
          500: { description: "Internal server error" },
        },
      },
    },

    "/api/supplier-sites/delete-site/{id}": {
      delete: {
        summary: "Delete a supplier site",
        tags: ["Supplier Sites"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", example: "60d5f99b8a4b2c001c8e4f0a" },
            description: "Supplier Site ID to delete",
          },
        ],
        responses: {
          200: { description: "Site deleted successfully" },
          403: { description: "Unauthorized or site not found" },
          500: { description: "Internal server error" },
        },
      },
    },

    "/api/supplier-sites/site-list": {
      get: {
        summary: "Get a list of supplier sites",
        tags: ["Supplier Sites"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "page",
            schema: { type: "integer", example: 1 },
            description: "Page number for pagination",
          },
          {
            in: "query",
            name: "limit",
            schema: { type: "integer", example: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description: "List of supplier sites",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sites: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          _id: {
                            type: "string",
                            example: "60d5f99b8a4b2c001c8e4f0a",
                          },
                          site_name: { type: "string", example: "Site A" },
                          city: { type: "string", example: "New York" },
                          state: { type: "string", example: "NY" },
                          country: { type: "string", example: "USA" },
                          zipcode: { type: "string", example: "10001" },
                          plant_id: { type: "string", example: "PLANT001" },
                        },
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

    "/api/supplier-sites/update-site/{id}": {
      put: {
        summary: "Update an existing supplier site",
        tags: ["Supplier Sites"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Supplier site ID to update",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SupplierSite" },
            },
          },
        },
        responses: {
          200: { description: "Site updated successfully" },
          400: { description: "Validation error or duplicate plant_id" },
          404: { description: "Site not found or unauthorized access" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/supplier-sites/site/{id}": {
      get: {
        summary: "Get a supplier site by ID",
        tags: ["Supplier Sites"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Supplier site ID",
          },
        ],
        responses: {
          200: {
            description: "Supplier site details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SupplierSite" },
              },
            },
          },
          404: { description: "Site not found or unauthorized access" },
          500: { description: "Internal server error" },
        },
      },
    },
  },
};
