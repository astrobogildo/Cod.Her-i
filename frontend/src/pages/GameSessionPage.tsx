import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getTableDetails, getTableRolls, getTableChat, postChatMessage,
  rollDice, startSession, pauseSession, archiveSession, removePlayer,
  getEncounter, startEncounter, endEncounter,
  createZone, deleteZone, renameZone, moveCharacterZone,
  rollAllInitiative, setInitiative, nextTurn, prevTurn,
  requestTest, submitTest, dismissTest,
  SessionDetails, SessionPlayer, RollEntry, ChatMsg, RollResult, CombatState,
} from '../api';

export default function GameSessionPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const tid = Number(tableId);

  const [session, setSession] = useState<SessionDetails | null>(null);
  const [rolls, setRolls] = useState<RollEntry[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [rightPanel, setRightPanel] = useState<'chat' | 'rolls'>('chat');
  const [quickRollPool, setQuickRollPool] = useState(4);
  const [quickRollTN, setQuickRollTN] = useState(3);
  const [lastRoll, setLastRoll] = useState<RollResult | null>(null);
  const [showPlayerSheet, setShowPlayerSheet] = useState<SessionPlayer | null>(null);
  const [combat, setCombat] = useState<CombatState | null>(null);
  const [showGmTools, setShowGmTools] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── Loaders ─── */
  const loadSession = useCallback(async () => {
    try {
      const data = await getTableDetails(tid);
      setSession(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar sessão');
    } finally { setLoading(false); }
  }, [tid]);

  const loadRolls = useCallback(async () => {
    try { setRolls(await getTableRolls(tid)); } catch {}
  }, [tid]);

  const loadChat = useCallback(async () => {
    try { setChat(await getTableChat(tid)); } catch {}
  }, [tid]);

  const loadCombat = useCallback(async () => {
    try {
      const cs = await getEncounter(tid);
      setCombat(cs.active ? cs : null);
    } catch {}
  }, [tid]);

  useEffect(() => { loadSession(); loadRolls(); loadChat(); loadCombat(); }, [loadSession, loadRolls, loadChat, loadCombat]);

  /* ─── WebSocket ─── */
  useEffect(() => {
    if (!user || !tid) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${proto}//${host}/ws/${tid}?user_id=${user.id}&display_name=${encodeURIComponent(user.display_name)}`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const event = msg.event;
        if (event === 'player_joined' || event === 'player_left' || event === 'session_control') { loadSession(); loadCombat(); }
        if (event === 'chat_message') loadChat();
        if (event === 'dice_roll') { loadRolls(); loadSession(); }
        if (event === 'encounter_update') loadCombat();
      } catch {}
    };
    ws.onclose = () => { setTimeout(() => { if (wsRef.current === ws) loadSession(); }, 3000); };
    wsRef.current = ws;
    return () => { ws.close(); wsRef.current = null; };
  }, [user, tid, loadSession, loadChat, loadRolls, loadCombat]);

  useEffect(() => {
    pollRef.current = setInterval(() => { loadSession(); loadCombat(); }, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadSession, loadCombat]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  const wsBroadcast = (event: string, data: Record<string, unknown> = {}) => {
    wsRef.current?.send(JSON.stringify({ event, data }));
  };

  /* ─── Chat ─── */
  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput('');
    try { await postChatMessage(tid, text); wsBroadcast('chat_message', { content: text }); await loadChat(); } catch {}
  };

  /* ─── Quick Roll ─── */
  const doQuickRoll = async () => {
    try {
      const result = await rollDice(quickRollPool, 0, quickRollTN, { table_id: tid, roll_type: 'custom', description: `Rolagem rápida (${quickRollPool}d10 vs DN ${quickRollTN})` });
      setLastRoll(result);
      wsBroadcast('dice_roll');
      await loadRolls();
    } catch {}
  };

  /* ─── Session ─── */
  const handleCtrl = async (action: 'start' | 'pause' | 'archive') => {
    try {
      if (action === 'start') await startSession(tid);
      else if (action === 'pause') await pauseSession(tid);
      else await archiveSession(tid);
      wsBroadcast('session_control', { action });
      await loadSession();
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro'); }
  };

  const handleKick = async (charId: number) => {
    if (!confirm('Remover este jogador da mesa?')) return;
    try { await removePlayer(tid, charId); await loadSession(); } catch {}
  };

  /* ─── Encounter helpers (all broadcast) ─── */
  const enc = async (fn: () => Promise<CombatState | { detail: string }>) => {
    try { const r = await fn(); if ('active' in r) setCombat(r.active ? r : null); else setCombat(null); wsBroadcast('encounter_update'); } catch {}
  };

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Carregando sessão...</div>;
  if (error) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <p className="text-red-400">{error}</p>
      <button onClick={() => navigate('/tables')} className="text-hero-400 hover:underline">← Voltar às Mesas</button>
    </div>
  );
  if (!session) return null;

  const { table, gm, players, is_gm } = session;
  const statusColors: Record<string, string> = { lobby: 'bg-yellow-600/20 text-yellow-400', active: 'bg-green-600/20 text-green-400', archived: 'bg-gray-600/20 text-gray-400' };
  const statusLabels: Record<string, string> = { lobby: 'Aguardando', active: 'Em Jogo', archived: 'Encerrada' };

  // Resolve character_id → name
  const charName = (id: number) => players.find(p => p.character_id === id)?.character_name ?? `#${id}`;
  const currentTurnCharId = combat?.initiative_order?.[combat.current_turn_index]?.character_id;

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* ─── TOP BAR ─── */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/tables')} className="text-gray-400 hover:text-white text-sm">← Mesas</button>
          <div>
            <h1 className="text-lg font-bold text-hero-400">{table.name}</h1>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>NP {table.power_level}</span><span>•</span>
              <span>Mestre: {gm.display_name}</span><span>•</span>
              <span className="font-mono">{table.code}</span>
              {combat && <><span>•</span><span className="text-orange-400">⚔ Round {combat.round}</span></>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[table.status] || ''}`}>
            {statusLabels[table.status] || table.status}
          </span>
          {is_gm && (
            <div className="flex gap-1.5">
              {table.status === 'lobby' && <button onClick={() => handleCtrl('start')} className="text-xs bg-green-700 hover:bg-green-600 px-3 py-1.5 rounded-lg transition">▶ Iniciar</button>}
              {table.status === 'active' && <button onClick={() => handleCtrl('pause')} className="text-xs bg-yellow-700 hover:bg-yellow-600 px-3 py-1.5 rounded-lg transition">⏸ Pausar</button>}
              {table.status !== 'archived' && <button onClick={() => handleCtrl('archive')} className="text-xs bg-red-800 hover:bg-red-700 px-3 py-1.5 rounded-lg transition">⏹ Encerrar</button>}
              <button
                onClick={() => setShowGmTools(!showGmTools)}
                className={`text-xs px-3 py-1.5 rounded-lg transition ${showGmTools ? 'bg-hero-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
              >🎭 Ferramentas</button>
            </div>
          )}
        </div>
      </header>

      {/* ─── MAIN LAYOUT ─── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ─── LEFT: Players ─── */}
        <aside className="w-64 bg-gray-900/50 border-r border-gray-800 flex flex-col overflow-y-auto shrink-0">
          <div className="p-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-300">Jogadores ({players.length})</h2>
          </div>
          <div className="flex-1 p-2 space-y-2">
            {players.map(p => (
              <PlayerCard
                key={p.character_id}
                player={p}
                isGm={is_gm}
                isCurrentTurn={currentTurnCharId === p.character_id}
                onKick={() => handleKick(p.character_id)}
                onClick={() => setShowPlayerSheet(p)}
              />
            ))}
            {players.length === 0 && <p className="text-xs text-gray-600 text-center py-8">Nenhum jogador</p>}
          </div>
          {/* Initiative order (compact) */}
          {combat && combat.initiative_order.length > 0 && (
            <div className="border-t border-gray-800 p-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-gray-500 font-semibold">INICIATIVA</span>
                {is_gm && <div className="flex gap-1">
                  <button onClick={() => enc(() => prevTurn(tid))} className="text-[10px] bg-gray-800 hover:bg-gray-700 px-1.5 py-0.5 rounded">◀</button>
                  <button onClick={() => enc(() => nextTurn(tid))} className="text-[10px] bg-hero-600 hover:bg-hero-700 px-1.5 py-0.5 rounded">▶</button>
                </div>}
              </div>
              <div className="space-y-0.5">
                {combat.initiative_order.map((e, i) => (
                  <div key={e.character_id} className={`flex items-center justify-between px-2 py-1 rounded text-[11px] transition ${
                    i === combat.current_turn_index ? 'bg-hero-600/20 border border-hero-600/40 text-hero-300' : 'text-gray-400'
                  }`}>
                    <span className="truncate">{i === combat.current_turn_index && '▸ '}{charName(e.character_id)}</span>
                    <span className="text-[10px] font-mono">{e.initiative}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ─── CENTER ─── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Quick roll bar */}
          <div className="bg-gray-900/30 border-b border-gray-800 px-4 py-2 flex items-center gap-3 shrink-0">
            <span className="text-xs text-gray-500">🎲</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setQuickRollPool(Math.max(1, quickRollPool - 1))} className="w-6 h-6 bg-gray-800 hover:bg-gray-700 rounded text-xs">−</button>
              <span className="w-6 text-center text-sm font-bold text-hero-400">{quickRollPool}</span>
              <button onClick={() => setQuickRollPool(Math.min(20, quickRollPool + 1))} className="w-6 h-6 bg-gray-800 hover:bg-gray-700 rounded text-xs">+</button>
              <span className="text-[10px] text-gray-500">d10</span>
            </div>
            <span className="text-[10px] text-gray-600">DN</span>
            <input type="number" value={quickRollTN} onChange={e => setQuickRollTN(Number(e.target.value))} min={0} max={30}
              className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs text-center text-white outline-none" />
            <button onClick={doQuickRoll} className="bg-hero-600 hover:bg-hero-700 text-white text-xs px-3 py-1 rounded-lg transition">Rolar</button>
            {lastRoll && <QuickRollResult roll={lastRoll} />}
          </div>

          {/* GM Tools panel (slides down) */}
          {is_gm && showGmTools && (
            <GmToolbar
              tid={tid}
              combat={combat}
              players={players}
              onUpdate={(cs) => { setCombat(cs?.active ? cs : null); wsBroadcast('encounter_update'); }}
            />
          )}

          {/* Center content */}
          <div className="flex-1 overflow-y-auto p-4">
            {showPlayerSheet ? (
              <PlayerSheetView player={showPlayerSheet} isGm={is_gm} onClose={() => setShowPlayerSheet(null)} />
            ) : combat ? (
              <EncounterView
                combat={combat}
                tid={tid}
                players={players}
                isGm={is_gm}
                myUserId={user?.id || 0}
                onUpdate={(cs) => { setCombat(cs?.active ? cs : null); wsBroadcast('encounter_update'); }}
              />
            ) : (
              <SessionOverview table={table} gm={gm} players={players} isGm={is_gm} />
            )}
          </div>
        </main>

        {/* ─── RIGHT: Chat/Rolls ─── */}
        <aside className="w-72 bg-gray-900/50 border-l border-gray-800 flex flex-col shrink-0">
          <div className="flex border-b border-gray-800 shrink-0">
            <button onClick={() => { setRightPanel('chat'); loadChat(); }}
              className={`flex-1 py-2 text-xs font-semibold transition ${rightPanel === 'chat' ? 'text-hero-400 border-b-2 border-hero-400' : 'text-gray-500 hover:text-gray-300'}`}>
              💬 Chat
            </button>
            <button onClick={() => { setRightPanel('rolls'); loadRolls(); }}
              className={`flex-1 py-2 text-xs font-semibold transition ${rightPanel === 'rolls' ? 'text-hero-400 border-b-2 border-hero-400' : 'text-gray-500 hover:text-gray-300'}`}>
              🎲 Rolagens
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {rightPanel === 'chat' ? (
              <>{chat.map(m => <ChatBubble key={m.id} msg={m} myUserId={user?.id || 0} />)}<div ref={chatEndRef} /></>
            ) : (
              <>{rolls.map(r => <RollCard key={r.id} roll={r} />)}{rolls.length === 0 && <p className="text-xs text-gray-600 text-center py-4">Nenhuma rolagem</p>}</>
            )}
          </div>
          {rightPanel === 'chat' && (
            <div className="border-t border-gray-800 p-2 shrink-0">
              <div className="flex gap-2">
                <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder="Mensagem..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-hero-500" />
                <button onClick={sendChat} disabled={!chatInput.trim()}
                  className="bg-hero-600 hover:bg-hero-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm transition">➤</button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   GM TOOLBAR
   ═══════════════════════════════════════════════════ */
function GmToolbar({
  tid, combat, players, onUpdate,
}: {
  tid: number;
  combat: CombatState | null;
  players: SessionPlayer[];
  onUpdate: (cs: CombatState | null) => void;
}) {
  const [newZoneName, setNewZoneName] = useState('');
  const [testLabel, setTestLabel] = useState('');
  const [testAttr, setTestAttr] = useState('');
  const [testTN, setTestTN] = useState(3);

  const attrs = ['FOR', 'RES', 'AGI', 'DES', 'CMB', 'INT', 'PER', 'PRE'];

  const doStartEncounter = async () => {
    const names = newZoneName.trim() ? newZoneName.split(',').map(s => s.trim()).filter(Boolean) : ['Zona A'];
    const cs = await startEncounter(tid, names);
    onUpdate(cs);
    setNewZoneName('');
  };

  const doEndEncounter = async () => {
    if (!confirm('Encerrar o encontro?')) return;
    await endEncounter(tid);
    onUpdate(null);
  };

  const doAddZone = async () => {
    if (!newZoneName.trim()) return;
    const cs = await createZone(tid, newZoneName.trim());
    onUpdate(cs);
    setNewZoneName('');
  };

  const doRollInit = async () => {
    const cs = await rollAllInitiative(tid);
    onUpdate(cs);
  };

  const doRequestTest = async () => {
    if (!testLabel.trim()) return;
    const cs = await requestTest(tid, testLabel.trim(), testAttr, testTN, []);
    onUpdate(cs);
    setTestLabel('');
  };

  return (
    <div className="bg-gray-900/80 border-b border-gray-800 px-4 py-3 space-y-3 shrink-0">
      <div className="flex items-center gap-6 flex-wrap">
        {/* Encounter control */}
        {!combat ? (
          <div className="flex items-center gap-2">
            <input type="text" value={newZoneName} onChange={e => setNewZoneName(e.target.value)}
              placeholder="Zonas (ex: Rua, Telhado, Beco)" onKeyDown={e => e.key === 'Enter' && doStartEncounter()}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none w-56" />
            <button onClick={doStartEncounter} className="text-xs bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg transition">
              ⚔ Iniciar Encontro
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-orange-400 font-semibold">⚔ Round {combat.round}</span>
            <div className="flex items-center gap-1">
              <input type="text" value={newZoneName} onChange={e => setNewZoneName(e.target.value)}
                placeholder="Nova zona..." onKeyDown={e => e.key === 'Enter' && doAddZone()}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none w-32" />
              <button onClick={doAddZone} disabled={!newZoneName.trim()} className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-2 py-1 rounded transition">+ Zona</button>
            </div>
            <button onClick={doRollInit} className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-2.5 py-1 rounded-lg transition">🎲 Iniciativa</button>
            <button onClick={doEndEncounter} className="text-xs bg-red-800 hover:bg-red-700 text-white px-2.5 py-1 rounded-lg transition">✕ Fim</button>
          </div>
        )}

        {/* Test request */}
        <div className="flex items-center gap-2 border-l border-gray-700 pl-4">
          <span className="text-[10px] text-gray-500">TESTE:</span>
          <input type="text" value={testLabel} onChange={e => setTestLabel(e.target.value)}
            placeholder="Descrição..." onKeyDown={e => e.key === 'Enter' && doRequestTest()}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none w-36" />
          <select value={testAttr} onChange={e => setTestAttr(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-white outline-none">
            <option value="">Livre</option>
            {attrs.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="flex items-center gap-0.5">
            <span className="text-[10px] text-gray-500">DN</span>
            <input type="number" value={testTN} onChange={e => setTestTN(Number(e.target.value))} min={0} max={20}
              className="w-8 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs text-center text-white outline-none" />
          </div>
          <button onClick={doRequestTest} disabled={!testLabel.trim()} className="text-xs bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white px-2.5 py-1 rounded-lg transition">
            📋 Pedir
          </button>
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   ENCOUNTER VIEW (Zones + Tests)
   ═══════════════════════════════════════════════════ */
function EncounterView({
  combat, tid, players, isGm, myUserId, onUpdate,
}: {
  combat: CombatState;
  tid: number;
  players: SessionPlayer[];
  isGm: boolean;
  myUserId: number;
  onUpdate: (cs: CombatState | null) => void;
}) {
  const charName = (id: number) => players.find(p => p.character_id === id)?.character_name ?? `#${id}`;
  const charPlayer = (id: number) => players.find(p => p.character_id === id);

  // Characters not in any zone
  const placedIds = new Set(combat.zones.flatMap(z => z.character_ids));
  const unplaced = players.filter(p => !placedIds.has(p.character_id));

  const myCharIds = players.filter(p => p.user_id === myUserId).map(p => p.character_id);
  const currentTurnCharId = combat.initiative_order?.[combat.current_turn_index]?.character_id;

  const handleMove = async (charId: number, zoneId: string) => {
    const cs = await moveCharacterZone(tid, charId, zoneId);
    onUpdate(cs);
  };

  const handleDeleteZone = async (zoneId: string) => {
    const cs = await deleteZone(tid, zoneId);
    onUpdate(cs);
  };

  const handleRenameZone = async (zoneId: string, name: string) => {
    const cs = await renameZone(tid, zoneId, name);
    onUpdate(cs);
  };

  const handleSubmitTest = async (testId: string, charId: number, successes: number, complications: number) => {
    const cs = await submitTest(tid, testId, charId, successes, complications);
    onUpdate(cs);
  };

  const handleDismissTest = async (testId: string) => {
    const cs = await dismissTest(tid, testId);
    onUpdate(cs);
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Pending tests banner */}
      {combat.pending_tests?.length > 0 && (
        <div className="space-y-2">
          {combat.pending_tests.map(test => (
            <div key={test.id} className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-sm font-semibold text-purple-300">📋 Teste: {test.label}</span>
                  {test.attribute && <span className="text-xs text-purple-500 ml-2">({test.attribute})</span>}
                  {test.tn > 0 && <span className="text-xs text-purple-500 ml-1">DN {test.tn}</span>}
                </div>
                {isGm && <button onClick={() => handleDismissTest(test.id)} className="text-[10px] text-gray-500 hover:text-red-400">✕ Dispensar</button>}
              </div>
              {/* Results so far */}
              {test.results.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {test.results.map((r, i) => (
                    <span key={i} className={`text-xs px-2 py-1 rounded-full ${r.passed ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}`}>
                      {charName(r.character_id)}: {r.successes} {r.passed ? '✓' : '✗'}
                    </span>
                  ))}
                </div>
              )}
              {/* My characters that haven't submitted yet */}
              {myCharIds.filter(cid =>
                !test.results.some(r => r.character_id === cid) &&
                (test.target_character_ids.length === 0 || test.target_character_ids.includes(cid))
              ).map(cid => (
                <TestSubmitRow key={cid} charId={cid} charName={charName(cid)} testId={test.id} onSubmit={handleSubmitTest} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Zones grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {combat.zones.map(zone => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            players={players}
            isGm={isGm}
            currentTurnCharId={currentTurnCharId}
            allZones={combat.zones}
            myCharIds={myCharIds}
            onMove={handleMove}
            onDelete={() => handleDeleteZone(zone.id)}
            onRename={(name) => handleRenameZone(zone.id, name)}
          />
        ))}
      </div>

      {/* Unplaced characters */}
      {unplaced.length > 0 && (
        <div className="bg-gray-900/50 border border-dashed border-gray-700 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-2">Fora do encontro — arraste para uma zona:</p>
          <div className="flex flex-wrap gap-2">
            {unplaced.map(p => (
              <div key={p.character_id} className="flex items-center gap-2">
                <span className="text-sm text-gray-300">{p.character_name}</span>
                {combat.zones.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={e => { if (e.target.value) handleMove(p.character_id, e.target.value); }}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none"
                  >
                    <option value="" disabled>Mover para...</option>
                    {combat.zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


/* ─── Zone Card ─── */
function ZoneCard({
  zone, players, isGm, currentTurnCharId, allZones, myCharIds,
  onMove, onDelete, onRename,
}: {
  zone: { id: string; name: string; character_ids: number[] };
  players: SessionPlayer[];
  isGm: boolean;
  currentTurnCharId?: number;
  allZones: { id: string; name: string }[];
  myCharIds: number[];
  onMove: (charId: number, zoneId: string) => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(zone.name);

  const charsInZone = zone.character_ids
    .map(id => players.find(p => p.character_id === id))
    .filter(Boolean) as SessionPlayer[];

  const otherZones = allZones.filter(z => z.id !== zone.id);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Zone header */}
      <div className="bg-gray-800/50 px-4 py-2.5 flex items-center justify-between">
        {editing ? (
          <input
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={() => { onRename(editName); setEditing(false); }}
            onKeyDown={e => { if (e.key === 'Enter') { onRename(editName); setEditing(false); } }}
            autoFocus
            className="bg-transparent border-b border-hero-500 text-sm font-semibold text-white outline-none w-full"
          />
        ) : (
          <h3 className="text-sm font-semibold text-white cursor-pointer" onClick={() => isGm && setEditing(true)}>
            {zone.name}
          </h3>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">{charsInZone.length} herói{charsInZone.length !== 1 ? 's' : ''}</span>
          {isGm && <button onClick={onDelete} className="text-[10px] text-red-500 hover:text-red-400">✕</button>}
        </div>
      </div>

      {/* Characters in zone */}
      <div className="p-3 space-y-1.5 min-h-[60px]">
        {charsInZone.length === 0 && <p className="text-[10px] text-gray-600 text-center py-3">Zona vazia</p>}
        {charsInZone.map(p => {
          const hpPct = p.vitalidade_max > 0 ? (p.vitalidade_current / p.vitalidade_max) * 100 : 100;
          const isTurn = currentTurnCharId === p.character_id;
          const canMove = isGm || myCharIds.includes(p.character_id);

          return (
            <div key={p.character_id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition ${
              isTurn ? 'bg-hero-600/15 border border-hero-600/30' : 'bg-gray-800/40 hover:bg-gray-800/60'
            }`}>
              {isTurn && <span className="text-hero-400 text-xs">▸</span>}
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-white truncate block">{p.character_name}</span>
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  <span className={hpPct > 60 ? 'text-green-400' : hpPct > 30 ? 'text-yellow-400' : 'text-red-400'}>
                    {p.vitalidade_current}/{p.vitalidade_max}
                  </span>
                  <span>E{p.dodge} A{p.parry}</span>
                </div>
              </div>
              {canMove && otherZones.length > 0 && (
                <select
                  defaultValue=""
                  onChange={e => { if (e.target.value) onMove(p.character_id, e.target.value); }}
                  className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-400 outline-none"
                >
                  <option value="" disabled>Mover →</option>
                  {otherZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* ─── Test Submit Row ─── */
function TestSubmitRow({
  charId, charName, testId, onSubmit,
}: {
  charId: number;
  charName: string;
  testId: string;
  onSubmit: (testId: string, charId: number, successes: number, complications: number) => void;
}) {
  const [successes, setSuccesses] = useState(0);
  const [complications, setComplications] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) return <span className="text-[10px] text-gray-500">✓ {charName} enviou resultado</span>;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-purple-300 font-medium">{charName}:</span>
      <div className="flex items-center gap-1">
        <span className="text-gray-500">Sucessos</span>
        <input type="number" value={successes} onChange={e => setSuccesses(Number(e.target.value))} min={0} max={20}
          className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-center text-white outline-none" />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-gray-500">Comp.</span>
        <input type="number" value={complications} onChange={e => setComplications(Number(e.target.value))} min={0} max={10}
          className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-center text-white outline-none" />
      </div>
      <button onClick={() => { onSubmit(testId, charId, successes, complications); setSubmitted(true); }}
        className="bg-purple-700 hover:bg-purple-600 text-white px-2 py-0.5 rounded transition">Enviar</button>
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   SMALL SUB-COMPONENTS (unchanged logic)
   ═══════════════════════════════════════════════════ */

function PlayerCard({
  player, isGm, isCurrentTurn, onKick, onClick,
}: {
  player: SessionPlayer;
  isGm: boolean;
  isCurrentTurn: boolean;
  onKick: () => void;
  onClick: () => void;
}) {
  const hpPct = player.vitalidade_max > 0 ? Math.round((player.vitalidade_current / player.vitalidade_max) * 100) : 100;
  const hpColor = hpPct > 60 ? 'bg-green-500' : hpPct > 30 ? 'bg-yellow-500' : 'bg-red-500';
  const wounds = (player.ferimentos || []).reduce((s: number, v: number) => s + v, 0);

  return (
    <div onClick={onClick}
      className={`rounded-lg p-2.5 border cursor-pointer transition group ${
        isCurrentTurn ? 'bg-hero-600/10 border-hero-600/40' : 'bg-gray-800/60 border-gray-700/50 hover:border-hero-600/50'
      }`}>
      <div className="flex items-center justify-between mb-1">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{isCurrentTurn && '▸ '}{player.character_name}</p>
          <p className="text-[10px] text-gray-500 truncate">{player.display_name}</p>
        </div>
        {isGm && (
          <button onClick={e => { e.stopPropagation(); onKick(); }}
            className="opacity-0 group-hover:opacity-100 text-[10px] text-red-500 hover:text-red-400 transition-opacity" title="Remover">✕</button>
        )}
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1">
        <div className={`h-full ${hpColor} transition-all`} style={{ width: `${hpPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span>VIT {player.vitalidade_current}/{player.vitalidade_max}</span>
        <div className="flex gap-1.5">
          {wounds > 0 && <span className="text-red-400">🩸{wounds}</span>}
          {player.active_conditions.length > 0 && <span className="text-yellow-400">⚠ {player.active_conditions.length}</span>}
          <span>🎲 {player.hero_dice}</span>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ msg, myUserId }: { msg: ChatMsg; myUserId: number }) {
  const isMine = msg.user_id === myUserId;
  if (msg.message_type === 'system') return <div className="text-center text-[10px] text-gray-600 py-0.5 italic">{msg.content}</div>;

  return (
    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
      {!isMine && <span className="text-[10px] text-gray-500 ml-1 mb-0.5">{msg.display_name}</span>}
      <div className={`max-w-[85%] px-3 py-1.5 rounded-xl text-sm ${
        msg.message_type === 'roll' ? 'bg-purple-900/40 border border-purple-700/40 text-purple-200' :
        isMine ? 'bg-hero-600/30 text-hero-100' : 'bg-gray-800 text-gray-200'
      }`}>{msg.content}</div>
      <span className="text-[9px] text-gray-600 mx-1 mt-0.5">
        {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
      </span>
    </div>
  );
}

function RollCard({ roll }: { roll: RollEntry }) {
  const isSuccess = roll.margin !== null && roll.margin >= 0;
  return (
    <div className={`rounded-lg p-2.5 text-xs border ${isSuccess ? 'bg-green-900/20 border-green-800/40' : 'bg-red-900/20 border-red-800/40'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-white">{roll.character_name || 'Anônimo'}</span>
        <span className="text-gray-500">{roll.timestamp ? new Date(roll.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
      </div>
      <p className="text-gray-400 mb-1">{roll.description || roll.roll_type}</p>
      <div className="flex gap-0.5 flex-wrap mb-1">
        {(roll.dice_results || []).map((d, i) => (
          <span key={i} className={`w-5 h-5 flex items-center justify-center rounded font-bold text-[9px] ${
            d.is_success ? 'bg-green-700 text-white' : d.is_complication ? 'bg-red-700 text-white' : 'bg-gray-700 text-gray-300'
          }`}>{d.value}</span>
        ))}
      </div>
      <div className="flex items-center gap-2 text-gray-400">
        <span>✓ {roll.successes}</span>
        {roll.complications > 0 && <span className="text-red-400">✗ {roll.complications}</span>}
        {roll.tn !== null && <span>DN {roll.tn}</span>}
        {roll.margin !== null && <span className={`font-bold ${isSuccess ? 'text-green-400' : 'text-red-400'}`}>{isSuccess ? `+${roll.margin}` : roll.margin}</span>}
      </div>
    </div>
  );
}

function QuickRollResult({ roll }: { roll: RollResult }) {
  const isSuccess = roll.margin >= 0;
  return (
    <div className={`flex items-center gap-2 text-xs px-2 py-1 rounded-lg border ${isSuccess ? 'bg-green-900/30 border-green-700/40 text-green-300' : 'bg-red-900/30 border-red-700/40 text-red-300'}`}>
      <div className="flex gap-0.5">
        {roll.dice.map((d, i) => (
          <span key={i} className={`w-5 h-5 flex items-center justify-center rounded text-[9px] font-bold ${
            d.successes > 0 ? 'bg-green-700 text-white' : d.complication ? 'bg-red-700 text-white' : 'bg-gray-700 text-gray-400'
          }`}>{d.face_value}</span>
        ))}
      </div>
      <span className="font-bold">{isSuccess ? `Sucesso (+${roll.margin})` : `Falha (${roll.margin})`}</span>
    </div>
  );
}

function PlayerSheetView({ player, isGm, onClose }: { player: SessionPlayer; isGm: boolean; onClose: () => void }) {
  const hpPct = player.vitalidade_max > 0 ? Math.round((player.vitalidade_current / player.vitalidade_max) * 100) : 100;
  const hpColor = hpPct > 60 ? 'text-green-400' : hpPct > 30 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-hero-400">{player.character_name}</h2>
          <p className="text-sm text-gray-400">{player.character_concept} — {player.display_name}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-sm px-4 py-2 bg-gray-800 rounded-lg">← Voltar</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox label="Vitalidade" value={`${player.vitalidade_current}/${player.vitalidade_max}`} color={hpColor} />
        <StatBox label="Dados Heróicos" value={String(player.hero_dice)} color="text-purple-400" />
        <StatBox label="NP" value={String(player.power_level)} color="text-blue-400" />
        <StatBox label="PP" value={`${player.pp_spent}/${player.pp_total}`} color="text-gray-300" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-2">Defesas</h3>
        <div className="grid grid-cols-4 gap-2">
          {[['Esquiva', player.dodge], ['Aparar', player.parry], ['Fortitude', player.fortitude], ['Vontade', player.willpower]].map(([label, val]) => (
            <div key={String(label)} className="bg-gray-900 rounded-lg p-3 border border-gray-800 text-center">
              <p className="text-lg font-bold text-white">{String(val)}</p>
              <p className="text-[10px] text-gray-500">{String(label)}</p>
            </div>
          ))}
        </div>
      </div>
      {player.ferimentos?.some(f => f > 0) && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Ferimentos</h3>
          <div className="flex gap-2">
            {['Leve', 'Moderado', 'Grave', 'Crítico'].map((label, i) => (
              <div key={i} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${player.ferimentos[i] > 0 ? 'bg-red-900/40 text-red-300 border border-red-700/40' : 'bg-gray-800 text-gray-600'}`}>
                {label}: {player.ferimentos[i] || 0}
              </div>
            ))}
          </div>
        </div>
      )}
      {player.active_conditions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Condições Ativas</h3>
          <div className="flex gap-1.5 flex-wrap">
            {player.active_conditions.map((c, i) => (
              <span key={i} className="px-2.5 py-1 bg-yellow-900/30 text-yellow-300 text-xs rounded-full border border-yellow-700/30">{c}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionOverview({ table, gm, players, isGm }: { table: SessionDetails['table']; gm: SessionDetails['gm']; players: SessionPlayer[]; isGm: boolean }) {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="bg-gradient-to-br from-hero-900/40 to-gray-900 rounded-2xl border border-hero-800/30 p-8 text-center">
        <h2 className="text-3xl font-bold text-hero-400 mb-2">{table.name}</h2>
        {table.description && <p className="text-gray-400 mb-4">{table.description}</p>}
        <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
          <span>NP {table.power_level}</span><span>•</span><span>Mestre: {gm.display_name}</span><span>•</span>
          <span>{players.length} jogador{players.length !== 1 ? 'es' : ''}</span>
        </div>
      </div>
      {isGm && (
        <div className="bg-purple-900/10 border border-purple-800/30 rounded-xl p-4 text-sm text-purple-300">
          <p className="font-semibold mb-2">🎭 Como Mestrar</p>
          <ul className="text-xs space-y-1 text-purple-400">
            <li>• Clique <strong>🎭 Ferramentas</strong> no topo para abrir os controles do Mestre</li>
            <li>• <strong>⚔ Iniciar Encontro</strong>: Cria zonas dinâmicas (ex: "Rua, Beco, Telhado")</li>
            <li>• Arraste personagens entre zonas usando o dropdown "Mover →"</li>
            <li>• <strong>🎲 Iniciativa</strong>: Rola AGI de todos automaticamente</li>
            <li>• <strong>▶ / ◀</strong>: Avança ou volta turnos (inicia novo round ao final)</li>
            <li>• <strong>📋 Pedir Teste</strong>: Solicita rolagem de qualquer atributo com DN</li>
            <li>• Jogadores na barra lateral — clique para ver ficha completa</li>
          </ul>
        </div>
      )}
      {isGm && players.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-800 text-left text-xs text-gray-500">
              <th className="px-4 py-2">Personagem</th><th className="px-4 py-2">Jogador</th>
              <th className="px-4 py-2">VIT</th><th className="px-4 py-2">Defesas</th>
              <th className="px-4 py-2">Status</th>
            </tr></thead>
            <tbody>{players.map(p => {
              const pct = p.vitalidade_max > 0 ? Math.round((p.vitalidade_current / p.vitalidade_max) * 100) : 100;
              return (
                <tr key={p.character_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-2 font-medium text-white">{p.character_name}</td>
                  <td className="px-4 py-2 text-gray-400">{p.display_name}</td>
                  <td className="px-4 py-2"><span className={pct > 60 ? 'text-green-400' : pct > 30 ? 'text-yellow-400' : 'text-red-400'}>{p.vitalidade_current}/{p.vitalidade_max}</span></td>
                  <td className="px-4 py-2 text-xs text-gray-400">E{p.dodge} A{p.parry} F{p.fortitude} V{p.willpower}</td>
                  <td className="px-4 py-2">{p.active_conditions.length > 0 ? <span className="text-yellow-400 text-xs">⚠ {p.active_conditions.join(', ')}</span> : <span className="text-green-400 text-xs">OK</span>}</td>
                </tr>);
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
