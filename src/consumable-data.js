import { FLOOR_HEIGHT as H } from './layout.js';

export const CONSUMABLE_TYPES = Object.freeze({
  hay: { name: 'Hay stack', energy: 10, color: 0xd6b85c, verb: 'Nibble' },
  carrot: { name: 'Carrot', energy: 5, color: 0xef984d, verb: 'Nibble' },
  rabbitFood: { name: 'Rabbit food', energy: 20, color: 0x97b583, verb: 'Eat' },
  bread: { name: 'Bread', energy: 25, color: 0xd5a267, verb: 'Nibble' },
  apple: { name: 'Apple', energy: 15, color: 0xd87566, verb: 'Nibble' },
  banana: { name: 'Banana', energy: 20, color: 0xe9ca65, verb: 'Nibble' },
  book: { name: 'Book', energy: 2, color: 0x8eafbb, verb: 'Chew' },
  cake: { name: 'Cake', energy: 50, color: 0xe6a7b6, verb: 'Eat' },
  noodles: { name: 'Noodles', energy: 30, color: 0xe6cb93, verb: 'Eat' },
});

// Fixed, reachable places on both floors. Books here are loose chewable props;
// the large structural book steps in furnishings.js remain solid climbing aids.
const places = {
  book: [[-12,0,5],[-8,0,12.5],[-18,0,-7],[-17,0,-15.5],[-10,0,-6],[-22.5,0,-12],[-17,H+.96,-13.4],[-21,H,-6],[1,H,-8],[4.8,H,-16],[12.8,H+1.46,-12],[22.5,H,-12]],
  carrot: [[-12.5,0,17.6],[19.5,0,10],[18,0,17.5],[-1.8,0,-14],[4.7,0,-17.5],[10,0,-7],[16,0,-16],[2,H+.4,-11.3]],
  hay: [[-9,0,15.5],[-21.4,0,10],[18,0,-12],[11,0,-16],[6,0,-6],[-11,H,0]],
  apple: [[-8.4,1.44,7.5],[18.5,0,7],[3.4,.92,-10.3],[3.5,H+.84,-13.2]],
  rabbitFood: [[-10.8,0,5],[14,1.56,-12],[10.5,H+.88,-18]],
  banana: [[-9.8,1.44,7.7],[11.8,1.52,15],[17,H,-7]],
  bread: [[13,1.52,14.7],[17,0,11]],
  noodles: [[15.3,1.52,14.6],[15.5,H+1.46,-12]],
  cake: [[14.3,1.52,15.4]],
};
export const CONSUMABLE_SLOTS = Object.freeze(Object.entries(places).flatMap(([type, positions]) =>
  positions.map(([x,y,z], i) => Object.freeze({ id: `${type}-${i}`, type, x, y, z }))));

// Choosing the kind before its location keeps P(kind) exactly proportional to 1/energy.
export function randomConsumableType(random = Math.random) {
  const entries = Object.entries(CONSUMABLE_TYPES);
  let pick = random() * entries.reduce((sum, [, type]) => sum + 1 / type.energy, 0);
  for (const [id, type] of entries) { pick -= 1 / type.energy; if (pick < 0) return id; }
  return entries.at(-1)[0];
}
