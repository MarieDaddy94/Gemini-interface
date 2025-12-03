<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally as a web application or Electron desktop application.

View your app in AI Studio: https://ai.studio/apps/drive/1ll_qPJXya2VTv8PFSgQGL1FSVkCmTbgf

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   - **Web application:** `npm run dev`
   - **Electron desktop app:** 
     - First, build the app: `npm run build`
     - Then, start Electron: `npm run electron:start`

## Electron Desktop Application

The application can run as an Electron desktop app with the following features:
- **Window size:** 1400x900 pixels (default)
- **Internet access:** Enabled by default for full functionality
- **Security:** Context isolation and web security enabled
- **Development mode:** Use `npm run electron:dev` (requires Vite dev server running)
- **Production mode:** Use `npm run electron:start` after building with `npm run build`

### Development Workflow

For development with hot-reload:
1. Start the Vite dev server: `npm run dev`
2. In another terminal, run: `npm run electron:dev`

