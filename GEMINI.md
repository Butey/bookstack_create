# Bridge.LM Project Instructions

Bridge.LM is a synchronization tool designed to bridge NotebookLM (or other sources) with BookStack Wiki using Google Gemini AI for content synthesis.

## Architecture

- **Frontend:** React 19, Vite, Tailwind CSS 4, Motion (framer-motion), Lucide React.
- **Backend:** Node.js + Express. The backend acts as a proxy for the BookStack API to handle CORS and authentication securely.
- **AI Integration:** Google Gemini API (`@google/genai`) for text extraction from files (PDF, HTML, TXT) and synthesizing articles.
- **Build System:** Vite for the frontend, `esbuild` for bundling the server, `tsx` for development.

## Core Conventions

### API Interaction
- **BookStack Proxy:** All interactions with the BookStack API **MUST** go through the `/api/bookstack/proxy` endpoint in `server.ts`. This ensures that sensitive credentials (Token ID/Secret) are handled securely and CORS issues are avoided.
- **Backend Services:** `server.ts` also provides endpoints for:
  - `/api/config`: Server-side configuration (presence of environment variables).
  - `/api/settings`: Persistence for user settings in `settings.json`.
  - `/api/process-source`: File upload handling via `multer`.

### Coding Standards
- **Language:** TypeScript for both frontend and backend.
- **Localization:** The primary user-facing language is **Russian**. All prompts in `src/services/gemini.ts` and error messages in the UI should remain in Russian unless otherwise requested.
- **State Management:** Standard React `useState` and `useEffect` hooks. No complex state management library is used.
- **Styling:** Tailwind CSS 4 using the `@tailwindcss/vite` plugin. Custom theme colors are defined in `src/index.css`.

### Environment Variables
The following environment variables are required (either in `.env` or `.env.local`):
- `GEMINI_API_KEY`: API key for Google Gemini.
- `BOOKSTACK_BASE_URL`: (Optional) Base URL for the BookStack instance.
- `BOOKSTACK_TOKEN_ID`: (Optional) BookStack API Token ID.
- `BOOKSTACK_TOKEN_SECRET`: (Optional) BookStack API Token Secret.

## Development Workflow

- **Dev Mode:** Run `npm run dev`. This starts the Express server using `tsx`, which in turn initializes the Vite development middleware.
- **Build:** Run `npm run build`. This bundles the frontend with Vite and the server with `esbuild` into the `dist/` directory.
- **Production:** Run `npm start`.

## Project Structure

- `server.ts`: Entry point for the Express server and API proxy.
- `src/`: Frontend React application.
- `src/services/`: Business logic for external integrations.
  - `api.ts`: BookStack API wrappers.
  - `gemini.ts`: AI prompt engineering and interaction logic.
- `src/types.ts`: Shared TypeScript interfaces.
