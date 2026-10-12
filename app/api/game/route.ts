import { env } from 'cloudflare:workers';
import { handleGameRequest } from '../../game-service';
export async function POST(request: Request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Unknown action.' }, { status: 400 }); }
  try { return await handleGameRequest(env.DB!, body); }
  catch { return Response.json({ error: 'Could not connect.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
