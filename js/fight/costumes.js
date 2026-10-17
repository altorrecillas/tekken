// Costumes: the fighters' clothes in other colours (js/materials.js applyCostume). The first is the outfit of the
// photo; the second is chosen at the select screen (and given to the second player of a mirror match, so the two
// can be told apart); the third, the champion's, is unlocked by winning the arcade with that fighter.
// Garments by name (the meshes of the built fighter): hue = degrees round the colour wheel (sat / val scale the
// saturation and the value), dye = a new colour (sRGB) keeping the fabric's shading, base = the luminance (linear) of
// the garment's original colour.
export const COSTUMES = {
  alejandro: [
    { name: 'ORIGINAL' },
    { name: 'AZUL MARINO', parts: { shirt: { hue: 182, sat: 0.9, val: 0.55 }, collar: { hue: 182, sat: 0.9, val: 0.55 }, shorts: { dye: [0.78, 0.72, 0.6], base: 0.13 } } },
    { name: 'CAMPEÓN', champ: true, parts: { shirt: { dye: [0.08, 0.08, 0.09], base: 0.56 }, collar: { dye: [0.08, 0.08, 0.09], base: 0.56 }, shorts: { dye: [0.86, 0.66, 0.2], base: 0.13 } } },
  ],
  arnau: [
    { name: 'ORIGINAL' },
    { name: 'GRANATE', parts: { jacket: { dye: [0.46, 0.07, 0.11], base: 0.0012 }, pants: { dye: [0.14, 0.15, 0.22], base: 0.019 } } },
    { name: 'CAMPEÓN', champ: true, parts: { jacket: { dye: [0.86, 0.66, 0.2], base: 0.0012 }, pants: { dye: [0.08, 0.08, 0.09], base: 0.019 } } },
  ],
  camilo: [
    { name: 'ORIGINAL' },
    { name: 'VERDE', parts: { shirt: { hue: 140, sat: 0.95, val: 0.9 }, shorts: { dye: [0.12, 0.16, 0.34], base: 0.0012 } } },
    { name: 'CAMPEÓN', champ: true, parts: { shirt: { dye: [0.86, 0.66, 0.2], base: 0.13 }, shorts: { dye: [0.06, 0.06, 0.07], base: 0.0012 } } },
  ],
  rafa: [
    { name: 'ORIGINAL' },
    { name: 'NARANJA', parts: { shirt: { hue: -62, sat: 1.0, val: 0.95 }, shorts: { dye: [0.32, 0.33, 0.36], base: 0.0012 } } },
    { name: 'CAMPEÓN', champ: true, parts: { shirt: { dye: [0.86, 0.66, 0.2], base: 0.7 }, shorts: { dye: [0.06, 0.06, 0.07], base: 0.0012 } } },
  ],
  zapponi: [
    { name: 'ORIGINAL' },
    { name: 'BURDEOS', parts: { shirt: { hue: 128, sat: 0.9, val: 1.0 } } },
    { name: 'CAMPEÓN', champ: true, parts: { shirt: { dye: [0.86, 0.66, 0.2], base: 0.019 }, shorts: { dye: [0.86, 0.66, 0.2], base: 0.0012 } } },
  ],
  dani: [
    { name: 'ORIGINAL' },
    { name: 'ROJO', parts: { shirt: { hue: 128, sat: 0.9, val: 1.1 }, shorts: { val: 0.4, sat: 0.6 } } },
    { name: 'CAMPEÓN', champ: true, parts: { shirt: { dye: [0.86, 0.66, 0.2], base: 0.02 }, shorts: { dye: [0.08, 0.08, 0.09], base: 0.2 } } },
  ],
  noemi: [
    { name: 'ORIGINAL' },
    { name: 'PIJAMA AZUL', parts: { jacket: { dye: [0.58, 0.76, 0.94], base: 0.85 }, top: { dye: [0.16, 0.24, 0.5], base: 0.34 }, pants: { dye: [0.2, 0.3, 0.62], base: 0.0072 } } },
    { name: 'CAMPEÓN', champ: true, parts: { jacket: { dye: [0.86, 0.66, 0.2], base: 0.85 }, top: { dye: [0.08, 0.08, 0.09], base: 0.34 }, pants: { dye: [0.08, 0.08, 0.09], base: 0.0072 } } },
  ],
};

export const costumesOf = (id) => COSTUMES[id] || [{ name: 'ORIGINAL' }];
// the costumes this player may wear (the champion's only once unlocked)
export function costumeChoices(id, unlocked = () => false) {
  return costumesOf(id).map((c, i) => i).filter((i) => !costumesOf(id)[i].champ || unlocked(id));
}
// the costume of the second player: another one than the first player's if both picked the same fighter
export function mirrorCostume(id1, c1, id2, c2, choices) {
  if (id1 !== id2 || c1 !== c2) return c2;
  const list = choices || costumesOf(id2).map((c, i) => i);
  return list.find((i) => i !== c1) ?? c2;
}
