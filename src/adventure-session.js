// A finished day is a fresh run without rebuilding the renderer or the house.
export function resetAdventure({clock,controller,consumables,poop,water},now) {
  clock.reset(now);
  controller.energy.refill(); controller.sprintExhausted=false; controller.resetDay();
  poop.reset(); consumables.reset(); water?.reset();
}
