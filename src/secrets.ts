// Copyright (c) 2026 Saurabh Pathak. MIT License.
// Secret words and a tiny seeded random generator (so a seed always gives the same game).

// "lantern" was removed from the starter list: Old Marrow haunts a lantern shop, so a real model
// would say it all the time and hand out free wins.
export const WORDS = [
  "marigold", "cobweb", "nightshade", "wraith", "phantom", "candlewick", "hollow", "graveyard", "raven",
  "ember", "moonlit", "specter", "cauldron", "pumpkin", "willow", "banshee", "gravedust", "mausoleum", "sorcery",
  "zombie", "vampire", "poltergeist", "ofrenda", "calavera", "cempasuchil", "skeleton", "midnight", "werewolf",
  "goblin", "witchcraft", "bonfire", "scarecrow", "thistle", "hemlock", "belladonna", "obsidian", "lullaby", "whisper",
];

/** Small, fast, seedable PRNG (mulberry32). Not for security: only for picking game words. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` distinct secret words for one game. */
export function pickSecrets(seed: number, count: number): string[] {
  const next = rng(seed);
  const pool = [...WORDS];
  const out: string[] = [];
  while (out.length < count && pool.length) {
    const i = Math.floor(next() * pool.length);
    out.push(pool.splice(i, 1)[0].toUpperCase());
  }
  return out;
}
