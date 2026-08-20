export const config = { runtime: 'edge' };

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');

  if (!endpoint) return new Response(JSON.stringify({ error: 'Endpoint required' }), { status: 400, headers: {'Content-Type': 'application/json'} });

  try {
    const r = await fetch(endpoint, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
        'Referer': 'https://kick.com/',
        'Origin': 'https://kick.com'
      }
    });
    
    if (!r.ok) {
        throw new Error('Kick server blocked or returned ' + r.status);
    }
    
    const data = await r.json();
    return new Response(JSON.stringify(data), { 
      status: 200, 
      headers: { 
        'Content-Type': 'application/json', 
        'Cache-Control': 's-maxage=60' 
      } 
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: {'Content-Type': 'application/json'} });
  }
}
