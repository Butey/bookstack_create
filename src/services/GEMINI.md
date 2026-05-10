# Services Layer Instructions

This directory contains the core integration logic for Bridge.LM.

## Sub-modules

### `api.ts` (BookStack Integration)
- **Role:** Handles all direct communication with the BookStack Wiki via the server-side proxy.
- **Conventions:**
  - All functions must be asynchronous.
  - Return the direct data payload from BookStack (usually nested under a `data` property in the response).
  - Use the `bookstackProxy` helper to ensure all requests go through the `/api/bookstack/proxy` endpoint.
  - Error handling: Allow errors to bubble up to the UI components where they can be displayed to the user with appropriate context.

### `gemini.ts` (AI Integration)
- **Role:** Orchestrates interactions with Google Gemini AI for text extraction and article generation.
- **Conventions:**
  - **Prompt Engineering:** Prompts should be detailed and written in **Russian**. They should include clear instructions for the AI's persona (Technical Writer), output format (Strict JSON), and specific constraints (no technical fields in the markdown).
  - **JSON Mode:** Use `responseMimeType: "application/json"` in the Gemini configuration to ensure reliable structured output.
  - **Text Extraction:** Use the `extractTextFromFile` function for processing base64 data from uploaded files.
  - **Error Handling:** Catch and re-throw errors with user-friendly Russian messages, specifically handling quota (`RESOURCE_EXHAUSTED`) issues.

## General Principles
- **Separation of Concerns:** Keep API-specific logic in `api.ts` and AI-specific logic in `gemini.ts`.
- **Type Safety:** Use the interfaces defined in `src/types.ts` for all service parameters and return values.
- **Consistency:** Maintain the established pattern of using Russian for all internal AI instructions and user-facing messages.
