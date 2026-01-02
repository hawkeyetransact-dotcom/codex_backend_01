export const authDocs = {
  tags: [
    {
      name: "Authentication",
      description: "APIs related to user authentication",
    },
  ],
  paths: {
    "/api/auth/register": {
      post: {
        summary: "Register a new user",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", example: "user@example.com" },
                  password: { type: "string", example: "password123" },
                  role: {
                    type: "string",
                    description:
                      "User role (must be one of the allowed values)",
                    enum: [
                      "buyer",
                      "supplier",
                      "auditor",
                      "admin",
                      "supplierUser",
                    ],
                    example: "buyer",
                  },
                },
                required: ["email", "password", "role"],
              },
            },
          },
        },
        responses: {
          201: {
            description:
              "User registered successfully. Verification email sent.",
          },
          400: { description: "Bad request" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/auth/verify-email": {
      get: {
        summary: "Verify user email",
        tags: ["Authentication"],
        parameters: [
          {
            name: "token",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Email verification token",
          },
        ],
        responses: {
          302: {
            description: "Redirects to email verified page",
          },
          400: { description: "Invalid or expired token" },
        },
      },
    },
    "/api/auth/login": {
      post: {
        summary: "Login user",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", example: "user@example.com" },
                  password: { type: "string", example: "password123" },
                },
                required: ["email", "password"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Login successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    token: { type: "string", example: "JWT_TOKEN_HERE" },
                    role: {
                      type: "string",
                      description: "User role assigned after login",
                      enum: [
                        "buyer",
                        "supplier",
                        "auditor",
                        "admin",
                        "supplierUser",
                      ],
                      example: "buyer",
                    },
                  },
                },
              },
            },
          },
          400: { description: "Invalid credentials" },
          401: { description: "Email is not verified" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/auth/supplier-register-and-create-profile": {
      post: {
        summary:
          "Register a new supplier and create their profile in a single request",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                allOf: [
                  {
                    type: "object",
                    properties: {
                      email: { type: "string", example: "user@example.com" },
                      password: { type: "string", example: "password123" },
                    },
                    required: ["email", "password"],
                  },
                  {
                    type: "object",
                    properties: {
                      title: { type: "string", example: "Mr." },
                      firstName: { type: "string", example: "John" },
                      lastName: { type: "string", example: "Doe" },
                      countryCode: { type: "string", example: "+1" },
                      phone: { type: "number", example: 1234567890 },
                      gender: { type: "string", example: "Male" },
                      companyName: { type: "string", example: "Tech Corp" },
                      addressline1: { type: "string", example: "Suite 1" },
                      addressline2: { type: "string", example: "Building B" },
                      addressline3: { type: "string", example: "" },
                      country: { type: "string", example: "USA" },
                      state: { type: "string", example: "California" },
                      city: { type: "string", example: "Los Angeles" },
                      zipcode: { type: "string", example: "90001" },
                    },
                    required: [
                      "title",
                      "firstName",
                      "lastName",
                      "countryCode",
                      "phone",
                      "companyName",
                      "addressline1",
                      "zipcode",
                    ],
                  },
                ],
              },
            },
          },
        },
        responses: {
          201: {
            description:
              "Supplier registered successfully. Verification email sent.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: {
                      type: "string",
                      example:
                        "Supplier registered successfully. Verification email sent.",
                    },
                    user: { $ref: "#/components/schemas/User" },
                    profile: { $ref: "#/components/schemas/SupplierProfile" },
                  },
                },
              },
            },
          },
          400: { description: "Validation error or email already exists" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/auth/buyer-register-and-create-profile": {
      post: {
        summary:
          "Register a new buyer and create their profile in a single request",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                allOf: [
                  {
                    type: "object",
                    properties: {
                      email: { type: "string", example: "buyer@example.com" },
                      password: { type: "string", example: "password123" },
                    },
                    required: ["email", "password"],
                  },
                  {
                    type: "object",
                    properties: {
                      title: { type: "string", example: "Ms." },
                      firstName: { type: "string", example: "Alice" },
                      lastName: { type: "string", example: "Smith" },
                      countryCode: { type: "string", example: "+1" },
                      phone: { type: "number", example: 5551234567 },
                      gender: { type: "string", example: "Female" },
                      companyName: { type: "string", example: "Buyer Corp" },
                      addressline1: { type: "string", example: "123 Buyer St" },
                      addressline2: { type: "string", example: "Suite 100" },
                      addressline3: { type: "string", example: "" },
                      country: { type: "string", example: "USA" },
                      state: { type: "string", example: "NY" },
                      city: { type: "string", example: "New York" },
                      zipcode: { type: "string", example: "10001" },
                    },
                    required: [
                      "title",
                      "firstName",
                      "lastName",
                      "countryCode",
                      "phone",
                      "companyName",
                      "addressline1",
                      "zipcode",
                    ],
                  },
                ],
              },
            },
          },
        },
        responses: {
          201: {
            description:
              "Buyer registered successfully. Verification email sent.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: {
                      type: "string",
                      example:
                        "Buyer registered successfully. Verification email sent.",
                    },
                    user: { $ref: "#/components/schemas/User" },
                    profile: { $ref: "#/components/schemas/BuyerProfile" },
                  },
                },
              },
            },
          },
          400: { description: "Validation error or email already exists" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/auth/auditor-register-and-create-profile": {
      post: {
        summary:
          "Register a new auditor and create their profile in a single request",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                allOf: [
                  {
                    type: "object",
                    properties: {
                      email: { type: "string", example: "user@example.com" },
                      password: { type: "string", example: "password123" },
                    },
                    required: ["email", "password"],
                  },
                  {
                    type: "object",
                    properties: {
                      title: { type: "string", example: "Mr." },
                      firstName: { type: "string", example: "John" },
                      lastName: { type: "string", example: "Doe" },
                      countryCode: { type: "string", example: "+1" },
                      phone: { type: "number", example: 1234567890 },
                      gender: { type: "string", example: "Male" },
                      companyName: { type: "string", example: "Tech Corp" },
                      addressline1: { type: "string", example: "Suite 1" },
                      addressline2: { type: "string", example: "Building B" },
                      addressline3: { type: "string", example: "" },
                      country: { type: "string", example: "USA" },
                      state: { type: "string", example: "California" },
                      city: { type: "string", example: "Los Angeles" },
                      zipcode: { type: "string", example: "90001" },
                      linkedinUrl: { type: "string", example: "www.linkedin.com/userprofile" },
                    },
                    required: [
                      "title",
                      "firstName",
                      "lastName",
                      "countryCode",
                      "phone",
                      "companyName",
                      "addressline1",
                      "zipcode",
                    ],
                  },
                ],
              },
            },
          },
        },
        responses: {
          201: {
            description:
              "Auditor registered successfully. Verification email sent.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: {
                      type: "string",
                      example:
                        "Auditor registered successfully. Verification email sent.",
                    },
                    user: { $ref: "#/components/schemas/User" },
                    profile: { $ref: "#/components/schemas/SupplierProfile" },
                  },
                },
              },
            },
          },
          400: { description: "Validation error or email already exists" },
          500: { description: "Internal server error" },
        },
      },
    },
    "/api/auth/supplier-user": {
      post: {
        summary: "Create a new supplier user",
        description:
          "Allows an authenticated supplier (role 'supplier') to create a new user with role 'supplierUser'. The new user will have isEmailVerified set to true and invitedBy set to the supplier's ID. An email containing the credentials will be sent to the new user.",
        tags: ["Authentication"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: {
                    type: "string",
                    example: "supplieruser@example.com",
                  },
                  password: {
                    type: "string",
                    minLength: 6,
                    example: "securePassword123",
                  },
                },
                required: ["email", "password"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Supplier user created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: {
                      type: "string",
                      example: "Supplier user created successfully",
                    },
                    user: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
          400: { description: "Validation error or user already exists" },
          403: { description: "Forbidden – user does not have permission" },
          500: { description: "Internal server error" },
        },
      },
    },
    // New endpoint: Resend Verification Email
    "/api/auth/resend-verification-email": {
      post: {
        summary: "Resend email verification link",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", example: "user@example.com" },
                },
                required: ["email"],
              },
            },
          },
        },
        responses: {
          200: { description: "Verification email resent successfully" },
          400: {
            description:
              "Validation error, email already verified, or missing email",
          },
          404: { description: "Email not found" },
          500: { description: "Internal server error" },
        },
      },
    },
  },
};
