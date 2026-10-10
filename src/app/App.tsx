import { Component, useEffect, type ReactNode } from 'react';
import { NavBar } from '../components/navigation/NavBar';
import { StoryBackdrop } from '../components/storytelling/StoryBackdrop';
import { Hero } from '../components/storytelling/Hero';
import { Blackout } from '../components/storytelling/Blackout';
import { Constraints } from '../components/storytelling/Constraints';
import { Geometry } from '../components/storytelling/Geometry';
import { Closing } from '../components/storytelling/Closing';
import { StationViewer } from '../components/interactions/StationViewer';
import { MeshLab } from '../components/interactions/MeshLab';
import { RoutePlanner } from '../components/interactions/RoutePlanner';
import { EnergySystem } from '../components/interactions/EnergySystem';
import { MissionOps } from '../components/interactions/MissionOps';
import { OpsDashboard } from '../components/dashboard/OpsDashboard';
import { Architecture } from '../components/interactions/Architecture';
import { Safety } from '../components/interactions/Safety';
import { Roadmap } from '../components/interactions/Roadmap';
import { useSimDriver } from '../hooks/useSimDriver';
import { ScrollTrigger } from '../hooks/gsap';
import { warmTerrain } from '../utils/terrainField';

class Guard extends Component<{ name: string; children: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() {
    return { err: true };
  }
  componentDidCatch(e: unknown) {
    console.error(`${this.props.name} failed`, e);
  }
  render() {
    if (this.state.err)
      return (
        <section className="relative z-10 bg-night px-4 py-16 text-center text-mist">
          <p className="label text-coral">{this.props.name} could not load</p>
          <p className="mt-2">The rest of the page still works. Reload to try again.</p>
        </section>
      );
    return this.props.children;
  }
}

export function App() {
  warmTerrain();
  useSimDriver();

  useEffect(() => {
    // deep links (#simulation etc.) once layout and fonts settle
    const id = location.hash.replace('#', '');
    const go = () => {
      ScrollTrigger.refresh();
      if (id && /^[\w-]+$/.test(id)) document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'start' });
    };
    const t = window.setTimeout(go, 350);
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    fonts?.ready.then(() => ScrollTrigger.refresh()).catch(() => undefined);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-16 focus:z-[60] focus:rounded focus:bg-amber focus:px-3 focus:py-2 focus:text-night">
        Skip to content
      </a>
      <NavBar />
      <StoryBackdrop />
      <main id="main" className="relative">
        <Hero />
        <Blackout />
        <Constraints />
        <Guard name="Station viewer">
          <StationViewer />
        </Guard>
        <Geometry />
        <Guard name="Mesh lab">
          <MeshLab />
        </Guard>
        <Guard name="Route planner">
          <RoutePlanner />
        </Guard>
        <Guard name="Energy system">
          <EnergySystem />
        </Guard>
        <Guard name="Live simulation">
          <MissionOps />
        </Guard>
        <Guard name="Operations dashboard">
          <OpsDashboard />
        </Guard>
        <Guard name="Architecture">
          <Architecture />
        </Guard>
        <Guard name="Safety">
          <Safety />
        </Guard>
        <Guard name="Roadmap">
          <Roadmap />
        </Guard>
        <Closing />
      </main>
    </>
  );
}
