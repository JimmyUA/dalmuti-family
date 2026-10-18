export const BRAND={name:'Crownturn',wordmark:'CROWNTURN',tagline:'Ranks. Taxes. Revolutions.',description:'A card game of ranks, taxes and revolutions. Private rooms for family and friends.'} as const;
// Render old room logs/errors with the new terminology without editing stored games.
export const legacyGameText:Record<string,string>={
 'Taxation · Dalmutis choose their return cards':'Taxation · Royals choose their return cards',
 'Only the Dalmutis choose tax cards.':'Only the royals choose tax cards.',
};
