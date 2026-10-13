import {env} from 'cloudflare:workers';
import {secureGameRequest,type SecurityEnv} from '../../security';
export async function POST(request:Request){return secureGameRequest(request,env as unknown as SecurityEnv)}
