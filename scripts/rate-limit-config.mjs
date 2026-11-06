// Cloudflare rate-limit namespace IDs are separated across environments.
export const rateLimits=[
 {name:'NETWORK_LIMIT',namespace_id:'730001',simple:{limit:600,period:60}},
 {name:'SESSION_LIMIT',namespace_id:'730002',simple:{limit:120,period:60}},
 {name:'CREATE_LIMIT',namespace_id:'730003',simple:{limit:10,period:60}},
 {name:'JOIN_LIMIT',namespace_id:'730004',simple:{limit:40,period:60}},
];
const stagingNamespaces=['740001','740002','740003','740004'];
export function rateLimitsFor(target){
 if(target==='production')return rateLimits;
 if(target==='staging')return rateLimits.map((limit,i)=>({...limit,namespace_id:stagingNamespaces[i]}));
 throw Error('Unknown Cloudflare environment.');
}
