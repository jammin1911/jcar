import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    // Single Node server (adapter-node) serves the whole app on PORT (3000).
    // No reverse proxy / Caddy in front inside the container: public access is
    // via Cloudflare Tunnel straight to this container's static IP.
    adapter: adapter()
  }
};

export default config;
