import {env} from 'cloudflare:workers';
import {health} from '../../health';
import type {SecurityEnv} from '../../security';
export const dynamic='force-dynamic';
export async function GET(){return health(env as unknown as SecurityEnv)}
