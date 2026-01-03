# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Nexus CRM (dev)

Em um terminal:

- `npm run server` (API local em `http://localhost:8787`)

Em outro terminal:

- `npm run dev` (Vite em `http://localhost:5173`)

### WhatsApp via Evolution API

- No CRM: `Agente IA` → `WhatsApp` → `Conectar` → selecione `Evolution API` e preencha `URL`, `API Key` e `Instância`.
- Clique em `Gerar QR` e leia o QR com o WhatsApp.
- Webhook (inbound): configure na Evolution para chamar `http://localhost:8787/api/evolution/webhook`.
  - Se você definir `EVOLUTION_WEBHOOK_TOKEN`, inclua `?token=SEU_TOKEN` na URL (ou envie o header `x-webhook-token`).
