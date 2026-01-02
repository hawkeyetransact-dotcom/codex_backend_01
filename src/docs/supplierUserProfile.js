export const supplierUserProfileDocs = {
    tags: [
      {
        name: "Supplier User Profile",
        description: "APIs for managing supplier user profiles",
      },
    ],
    paths: {
      "/api/profile/supplier-user/create": {
        post: {
          summary: "Create a supplier user profile",
          tags: ["Supplier User Profile"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SupplierUserProfileRequest" },
              },
            },
          },
          responses: {
            201: {
              description: "Profile created successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string", example: "Supplier user profile created successfully" },
                      profile: { $ref: "#/components/schemas/SupplierUserProfile" },
                    },
                  },
                },
              },
            },
            400: { description: "Validation error or profile already exists" },
            500: { description: "Internal server error" },
          },
        },
      },
      "/api/profile/supplier-user/update": {
        put: {
          summary: "Update supplier user profile",
          tags: ["Supplier User Profile"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SupplierUserProfileRequest" },
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
    },
  };
  