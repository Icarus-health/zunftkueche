// Isolated component test fixture: never imports or writes a repository/provider.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Planning from '../../src/screens/Planning.tsx';
import Orders from '../../src/screens/Orders.tsx';
import Analysis from '../../src/screens/Analysis.tsx';
import Deliveries from '../../src/screens/Deliveries.tsx';
import { SavePendingContext } from '../../src/components/shared.tsx';
import source from '../../import/2026.json';
import type { KitchenState } from '../../src/domain/state.ts';
import '../../src/styles.css';
const screens = {Planning, Orders, Analysis, Deliveries};
const name = new URLSearchParams(location.search).get('screen') || 'Planning';
const Screen = screens[name as keyof typeof screens] ?? Planning;
const fixture = structuredClone(source) as KitchenState;
function Harness() {
  const [pending, setPending] = useState(false);
  const [attempts, setAttempts] = useState(0);
  return <SavePendingContext value={pending}>
    <header style={{padding:16, background:'#fff8e9'}}>
      <strong>Isolated draft regression · {name} · no persistence</strong>
      <label className="checkbox-label"><input type="checkbox" checked={pending} onChange={event => setPending(event.target.checked)} />Simulate pending write</label>
      <output>Commit attempts: {attempts}</output>
    </header>
    <main><Screen state={fixture} busy={pending} readOnly={false} mode="local" saveError="" initialSupplier={fixture.suppliers[0]?.id ?? ''}
      commit={async () => {setAttempts(value=>value+1);return false;}} go={()=>{}} /></main>
  </SavePendingContext>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
