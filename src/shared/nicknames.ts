/**
 * Friendly random nicknames for the "nickname generator" game option.
 * Shared by the player UI (preview / spin button) and the room (server-side assignment).
 * Keep the lists family-friendly: these appear on a projector in classrooms.
 */
const ADJECTIVES = [
  'Brave', 'Calm', 'Clever', 'Cosmic', 'Daring', 'Eager', 'Fuzzy', 'Gentle', 'Golden', 'Happy',
  'Jolly', 'Keen', 'Lucky', 'Mighty', 'Nimble', 'Quick', 'Quiet', 'Rapid', 'Shiny', 'Silly',
  'Snappy', 'Speedy', 'Sunny', 'Swift', 'Tiny', 'Witty', 'Zesty', 'Zippy', 'Bold', 'Merry',
];
const ANIMALS = [
  'Otter', 'Panda', 'Falcon', 'Koala', 'Tiger', 'Dolphin', 'Fox', 'Owl', 'Lynx', 'Moose',
  'Badger', 'Heron', 'Gecko', 'Yak', 'Puffin', 'Walrus', 'Bison', 'Ferret', 'Pelican', 'Raven',
  'Newt', 'Wombat', 'Ibex', 'Crane', 'Lemur', 'Marmot', 'Osprey', 'Quokka', 'Toucan', 'Zebra',
];

export function generateNickname(rand: () => number = Math.random): string {
  const a = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)];
  const n = ANIMALS[Math.floor(rand() * ANIMALS.length)];
  return `${a} ${n}`;
}

/** True when `name` could have come from generateNickname(). */
export function isGeneratedNickname(name: string): boolean {
  const [a, n, extra] = name.trim().split(/\s+/);
  return !extra && ADJECTIVES.includes(a ?? '') && ANIMALS.includes(n ?? '');
}
