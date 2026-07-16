import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Allow serving through Cloudflare quick tunnels (`cloudflared tunnel
    // --url http://localhost:5173`) — Vite 6 rejects unknown Host headers
    // otherwise. The leading dot allows any *.trycloudflare.com subdomain,
    // so a fresh tunnel (new random subdomain) works without editing this.
    allowedHosts: ['.trycloudflare.com'],
  },
});
