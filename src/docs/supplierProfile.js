export const supplierProfileDocs = {
  tags: [
    {
      name: "Supplier Profile",
      description: "APIs for managing supplier profiles",
    },
  ],
  paths: {
    "/api/profile/supplier/create": {
      post: {
        summary: "Create a supplier profile",
        tags: ["Supplier Profile"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SupplierProfile" },
            },
          },
        },
        responses: {
          201: { description: "Profile created successfully" },
          400: { description: "Validation error" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/profile/supplier/update": {
      put: {
        summary: "Update supplier profile",
        tags: ["Supplier Profile"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SupplierProfile" },
            },
          },
        },
        responses: {
          200: { description: "Profile updated successfully" },
          404: { description: "Profile not found" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/profile/": {
      get: {
        summary: "Get user profile",
        tags: ["Authentication"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Profile retrieved successfully" },
          404: { description: "Profile not found" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/profile/supplier/users": {
      get: {
        summary: "Get all supplier users invited by the current supplier",
        tags: ["Supplier Profile"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", example: 1 },
            description: "Page number for pagination",
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", example: 10 },
            description: "Number of records per page",
          },
        ],
        responses: {
          200: {
            description: "Supplier users retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    users: {
                      type: "array",
                      items: { $ref: "#/components/schemas/User" },
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
  },
};
