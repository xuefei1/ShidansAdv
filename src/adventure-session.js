// A finished day is a fresh run without rebuilding the renderer or the house.
export function resetAdventure({clock,controller,consumables,poop},now) {
  clock.reset(now);
  controller.energy.refill(); controller.sprintExhausted=false; controller.reset();
  consumables.reset(); poop.reset();
}
