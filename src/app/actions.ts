import { getSim } from '../simulation/store';
import { resetDemo, startMission } from '../simulation/failureScenarios';
import { prefersReducedMotion } from '../scenes/core/webgl';

export function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  try {
    history.replaceState(null, '', `#${id}`);
  } catch {
    /* sandboxed frames may refuse history updates */
  }
}

/** "Run Demo": go to the live simulation and start the reference mission. */
export function runDemo(): void {
  const s = getSim();
  const m = s.missions.find((x) => x.id === s.activeMissionId);
  if (!m || m.status === 'completed' || m.status === 'interrupted') {
    if (m) resetDemo();
    startMission('trauma');
  }
  scrollToId('simulation');
}
