export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const match = url.pathname.match(/^\/([^/]+)\/watchlist$/);
    if (!match) {
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    }

    const token = match[1];
    if (token !== env.API_TOKEN) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    if (request.method === 'GET') {
      const data = await env.WATCHLIST.get('watchlist', 'text');
      return new Response(data || '[]', {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'PUT') {
      try {
        const body = await request.text();
        JSON.parse(body);
        await env.WATCHLIST.put('watchlist', body);
        return new Response('OK', { status: 200, headers: corsHeaders });
      } catch (e) {
        return new Response('Invalid JSON', { status: 400, headers: corsHeaders });
      }
    }

    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  },
};
