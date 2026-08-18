# Frontend Guidelines

- **Form Schemas**: Load forms using JSON. Set up form schema, validations, and names in JSON files and load them so that future updates will only require JSON updates instead of code edits. Store these types of data in the `src/data` folder of the respective frontend app.
- **Core UI**: Always use `@ury/ui` (ury/core ui `apps/ury/packages/core`) for UI components. Do not edit core UI components or utilities without explicit user approval. Instead, use them or add generic utilities to `ury/core` when applicable.
- **Core Utilities**: Always use core utils packages. If a utility doesn't exist, create it as a generic utility inside the `ury/core` package rather than duplicating logic across apps.
- **Data Fetching**: For frontend data fetch, if available, always use built-in libraries (like `frappe.client` standard CRUD) to directly fetch them from the frontend rather than creating a custom backend API or function.
