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

/* ─── Avatar helper ─── */
function Avatar({ src, name, size = 32, className = '' }: { src?: string; name: string; size?: number; className?: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['from-violet-600 to-purple-500', 'from-blue-600 to-cyan-500', 'from-emerald-600 to-teal-500', 'from-orange-600 to-amber-500', 'from-rose-600 to-pink-500', 'from-indigo-600 to-blue-500'];
  const colorIdx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;

  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size }} className={`rounded-full object-cover border-2 border-gray-700 flex-shrink-0 ${className}`} />;
  }
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.35 }}
      className={`rounded-full bg-gradient-to-br ${colors[colorIdx]} flex items-center justify-center font-bold text-white flex-shrink-0 border-2 border-gray-700 ${className}`}>
      {initials}
    </div>
  );
}


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
  const [quickRollPool, setQuickRollPool] = useState(4);
  const [quickRollTN, setQuickRollTN] = useState(3);
  const [lastRoll, setLastRoll] = useState<RollResult | null>(null);
  const [showPlayerSheet, setShowPlayerSheet] = useState<SessionPlayer | null>(null);
  const [combat, setCombat] = useState<CombatState | null>(null);
  const [showGmTools, setShowGmTools] = useState(false);

  // Mobile panel state
  const [mobilePanel, setMobilePanel] = useState<'main' | 'players' | 'chat' | 'rolls'>('main');

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

  /* ─── Encounter helpers ─── */
  const enc = async (fn: () => Promise<CombatState | { detail: string }>) => {
    try { const r = await fn(); if ('active' in r) setCombat(r.active ? r : null); else setCombat(null); wsBroadcast('encounter_update'); } catch {}
  };

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400 animate-fade-in">Carregando sessão...</div>;
  if (error) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4 animate-fade-in">
      <p className="text-red-400">{error}</p>
      <button onClick={() => navigate('/tables')} className="text-hero-400 hover:underline">← Voltar às Mesas</button>
    </div>
  );
  if (!session) return null;

  const { table, gm, players, is_gm } = session;
  const statusColors: Record<string, string> = { lobby: 'bg-yellow-600/20 text-yellow-400', active: 'bg-green-600/20 text-green-400', archived: 'bg-gray-600/20 text-gray-400' };
  const statusLabels: Record<string, string> = { lobby: 'Aguardando', active: 'Em Jogo', archived: 'Encerrada' };
  const charName = (id: number) => players.find(p => p.character_id === id)?.character_name ?? `#${id}`;
  const charAvatar = (id: number) => players.find(p => p.character_id === id)?.avatar_url ?? '';
  const currentTurnCharId = combat?.initiative_order?.[combat.current_turn_index]?.character_id;

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-950 text-white overflow-hidden">
      {/* ─── TOP BAR ─── */}
      <header className="bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 px-3 md:px-4 py-2 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/tables')} className="text-gray-400 hover:text-white text-sm shrink-0">←</button>
          <div className="min-w-0">
            <h1 className="text-base md:text-lg font-bold text-hero-400 truncate">{table.name}</h1>
            <div className="flex items-center gap-2 text-[10px] text-gray-500">
              <span className="hidden sm:inline">NP {table.power_level}</span>
              <span className="hidden sm:inline">•</span>
              <span className="truncate">🎭 {gm.display_name}</span>
              {combat && <><span>•</span><span className="text-orange-400 font-semibold">⚔ R{combat.round}</span></>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[table.status] || ''}`}>
            {statusLabels[table.status] || table.status}
          </span>
          {is_gm && (
            <div className="flex gap-1">
              {table.status === 'lobby' && <button onClick={() => handleCtrl('start')} className="text-[10px] bg-green-700 hover:bg-green-600 px-2 py-1 rounded-lg transition-all-fast">▶ Start</button>}
              {table.status === 'active' && <button onClick={() => handleCtrl('pause')} className="text-[10px] bg-yellow-700 hover:bg-yellow-600 px-2 py-1 rounded-lg transition-all-fast hidden sm:block">⏸</button>}
              {table.status !== 'archived' && <button onClick={() => handleCtrl('archive')} className="text-[10px] bg-red-800 hover:bg-red-700 px-2 py-1 rounded-lg transition-all-fast hidden sm:block">⏹</button>}
              <button
                onClick={() => setShowGmTools(!showGmTools)}
                className={`text-[10px] px-2 py-1 rounded-lg transition-all-fast ${showGmTools ? 'bg-hero-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
              >🎭</button>
            </div>
          )}
        </div>
      </header>

      {/* ─── GM TOOLS (slides down) ─── */}
      {is_gm && showGmTools && (
        <div className="animate-slide-down">
          <GmToolbar tid={tid} combat={combat} players={players}
            onUpdate={(cs) => { setCombat(cs?.active ? cs : null); wsBroadcast('encounter_update'); }} />
        </div>
      )}

      {/* ─── MAIN LAYOUT ─── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ─── LEFT SIDEBAR: Players (hidden on mobile) ─── */}
        <aside className="hidden md:flex w-56 lg:w-64 bg-gray-900/50 border-r border-gray-800 flex-col overflow-y-auto shrink-0">
          <div className="p-3 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Jogadores ({players.length})</h2>
          </div>
          <div className="flex-1 p-2 space-y-1.5">
            {players.map(p => (
              <PlayerCard key={p.character_id} player={p} isGm={is_gm} isCurrentTurn={currentTurnCharId === p.character_id}
                onKick={() => handleKick(p.character_id)} onClick={() => setShowPlayerSheet(p)} />
            ))}
            {players.length === 0 && <p className="text-xs text-gray-600 text-center py-8">Nenhum jogador</p>}
          </div>
          {/* Initiative tracker */}
          {combat && combat.initiative_order.length > 0 && (
            <InitiativePanel combat={combat} charName={charName} charAvatar={charAvatar} isGm={is_gm}
              onPrev={() => enc(() => prevTurn(tid))} onNext={() => enc(() => nextTurn(tid))} />
          )}
        </aside>

        {/* ─── CENTER ─── */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Quick roll bar */}
          <div className="bg-gray-900/30 border-b border-gray-800 px-3 py-1.5 flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-500">🎲</span>
            <div className="flex items-center gap-0.5">
              <button onClick={() => setQuickRollPool(Math.max(1, quickRollPool - 1))} className="w-5 h-5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] transition-all-fast">−</button>
              <span className="w-5 text-center text-xs font-bold text-hero-400">{quickRollPool}</span>
              <button onClick={() => setQuickRollPool(Math.min(20, quickRollPool + 1))} className="w-5 h-5 bg-gray-800 hover:bg-gray-700 rounded text-[10px] transition-all-fast">+</button>
              <span className="text-[9px] text-gray-500">d10</span>
            </div>
            <span className="text-[9px] text-gray-600">DN</span>
            <input type="number" value={quickRollTN} onChange={e => setQuickRollTN(Number(e.target.value))} min={0} max={30}
              className="w-8 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-center text-white outline-none" />
            <button onClick={doQuickRoll} className="bg-hero-600 hover:bg-hero-700 text-white text-[10px] px-2.5 py-1 rounded-lg transition-all-fast">Rolar</button>
            {lastRoll && <QuickRollResult roll={lastRoll} />}
          </div>

          {/* Center content */}
          <div className="flex-1 overflow-y-auto">
            {/* Mobile: different panels based on bottom nav */}
            <div className="md:hidden">
              {mobilePanel === 'players' ? (
                <div className="p-3 space-y-2 animate-fade-in">
                  <h2 className="text-sm font-semibold text-gray-300 mb-2">Jogadores ({players.length})</h2>
                  {players.map(p => (
                    <PlayerCard key={p.character_id} player={p} isGm={is_gm} isCurrentTurn={currentTurnCharId === p.character_id}
                      onKick={() => handleKick(p.character_id)} onClick={() => { setShowPlayerSheet(p); setMobilePanel('main'); }} />
                  ))}
                  {combat && combat.initiative_order.length > 0 && (
                    <InitiativePanel combat={combat} charName={charName} charAvatar={charAvatar} isGm={is_gm}
                      onPrev={() => enc(() => prevTurn(tid))} onNext={() => enc(() => nextTurn(tid))} />
                  )}
                </div>
              ) : mobilePanel === 'chat' ? (
                <div className="flex flex-col h-full animate-fade-in">
                  <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {chat.map(m => <ChatBubble key={m.id} msg={m} myUserId={user?.id || 0} />)}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="border-t border-gray-800 p-2 shrink-0">
                    <div className="flex gap-2">
                      <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder="Mensagem..."
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-hero-500" />
                      <button onClick={sendChat} disabled={!chatInput.trim()}
                        className="bg-hero-600 hover:bg-hero-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm transition-all-fast">➤</button>
                    </div>
                  </div>
                </div>
              ) : mobilePanel === 'rolls' ? (
                <div className="p-3 space-y-1.5 animate-fade-in">
                  {rolls.map(r => <RollCard key={r.id} roll={r} />)}
                  {rolls.length === 0 && <p className="text-xs text-gray-600 text-center py-8">Nenhuma rolagem</p>}
                </div>
              ) : (
                <div className="p-3 animate-fade-in">
                  {showPlayerSheet ? (
                    <PlayerSheetView player={showPlayerSheet} isGm={is_gm} onClose={() => setShowPlayerSheet(null)} />
                  ) : combat ? (
                    <EncounterView combat={combat} tid={tid} players={players} isGm={is_gm} myUserId={user?.id || 0}
                      onUpdate={(cs) => { setCombat(cs?.active ? cs : null); wsBroadcast('encounter_update'); }} />
                  ) : (
                    <SessionOverview table={table} gm={gm} players={players} isGm={is_gm} />
                  )}
                </div>
              )}
            </div>

            {/* Desktop: center content only */}
            <div className="hidden md:block p-4">
              {showPlayerSheet ? (
                <PlayerSheetView player={showPlayerSheet} isGm={is_gm} onClose={() => setShowPlayerSheet(null)} />
              ) : combat ? (
                <EncounterView combat={combat} tid={tid} players={players} isGm={is_gm} myUserId={user?.id || 0}
                  onUpdate={(cs) => { setCombat(cs?.active ? cs : null); wsBroadcast('encounter_update'); }} />
              ) : (
                <SessionOverview table={table} gm={gm} players={players} isGm={is_gm} />
              )}
            </div>
          </div>
        </main>

        {/* ─── RIGHT SIDEBAR: Chat/Rolls (hidden on mobile) ─── */}
        <aside className="hidden md:flex w-64 lg:w-72 bg-gray-900/50 border-l border-gray-800 flex-col shrink-0">
          <RightPanel chat={chat} rolls={rolls} chatInput={chatInput} setChatInput={setChatInput}
            sendChat={sendChat} loadChat={loadChat} loadRolls={loadRolls} myUserId={user?.id || 0} chatEndRef={chatEndRef} />
        </aside>
      </div>

      {/* ─── MOBILE BOTTOM NAV ─── */}
      <nav className="md:hidden mobile-nav flex items-center justify-around">
        {[
          { key: 'main' as const, icon: '⚔', label: combat ? 'Combate' : 'Sessão' },
          { key: 'players' as const, icon: '👥', label: 'Jogadores' },
          { key: 'chat' as const, icon: '💬', label: 'Chat' },
          { key: 'rolls' as const, icon: '🎲', label: 'Rolagens' },
        ].map(tab => (
          <button key={tab.key} onClick={() => { setMobilePanel(tab.key); if (tab.key === 'chat') loadChat(); if (tab.key === 'rolls') loadRolls(); }}
            className={`flex flex-col items-center py-2 px-3 text-[10px] transition-all-fast ${
              mobilePanel === tab.key ? 'text-hero-400' : 'text-gray-500'
            }`}>
            <span className="text-base mb-0.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   INITIATIVE PANEL
   ═══════════════════════════════════════════════════ */
function InitiativePanel({ combat, charName, charAvatar, isGm, onPrev, onNext }: {
  combat: CombatState;
  charName: (id: number) => string;
  charAvatar: (id: number) => string;
  isGm: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="border-t border-gray-800 p-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Iniciativa</span>
        {isGm && <div className="flex gap-1">
          <button onClick={onPrev} className="text-[10px] bg-gray-800 hover:bg-gray-700 px-1.5 py-0.5 rounded transition-all-fast">◀</button>
          <button onClick={onNext} className="text-[10px] bg-hero-600 hover:bg-hero-700 px-1.5 py-0.5 rounded transition-all-fast">▶</button>
        </div>}
      </div>
      <div className="space-y-0.5">
        {combat.initiative_order.map((e, i) => {
          const isCurrent = i === combat.current_turn_index;
          return (
            <div key={e.character_id} className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] transition-all duration-300 ${
              isCurrent ? 'bg-hero-600/20 border border-hero-600/40 text-hero-300' : 'text-gray-400'
            }`}>
              <Avatar src={charAvatar(e.character_id)} name={charName(e.character_id)} size={20}
                className={isCurrent ? 'border-hero-500 shadow-[0_0_6px_rgba(124,58,237,0.4)]' : ''} />
              <span className="truncate flex-1">{isCurrent && '▸ '}{charName(e.character_id)}</span>
              <span className="text-[10px] font-mono">{e.initiative}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   RIGHT PANEL (Chat + Rolls)
   ═══════════════════════════════════════════════════ */
function RightPanel({ chat, rolls, chatInput, setChatInput, sendChat, loadChat, loadRolls, myUserId, chatEndRef }: {
  chat: ChatMsg[]; rolls: RollEntry[]; chatInput: string; setChatInput: (v: string) => void;
  sendChat: () => void; loadChat: () => void; loadRolls: () => void; myUserId: number;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [tab, setTab] = useState<'chat' | 'rolls'>('chat');
  return (
    <>
      <div className="flex border-b border-gray-800 shrink-0">
        <button onClick={() => { setTab('chat'); loadChat(); }}
          className={`flex-1 py-2 text-xs font-semibold transition-all-fast ${tab === 'chat' ? 'text-hero-400 border-b-2 border-hero-400' : 'text-gray-500 hover:text-gray-300'}`}>
          💬 Chat
        </button>
        <button onClick={() => { setTab('rolls'); loadRolls(); }}
          className={`flex-1 py-2 text-xs font-semibold transition-all-fast ${tab === 'rolls' ? 'text-hero-400 border-b-2 border-hero-400' : 'text-gray-500 hover:text-gray-300'}`}>
          🎲 Rolagens
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {tab === 'chat' ? (
          <>{chat.map(m => <ChatBubble key={m.id} msg={m} myUserId={myUserId} />)}<div ref={chatEndRef} /></>
        ) : (
          <>{rolls.map(r => <RollCard key={r.id} roll={r} />)}{rolls.length === 0 && <p className="text-xs text-gray-600 text-center py-4">Nenhuma rolagem</p>}</>
        )}
      </div>
      {tab === 'chat' && (
        <div className="border-t border-gray-800 p-2 shrink-0">
          <div className="flex gap-2">
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder="Mensagem..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-hero-500" />
            <button onClick={sendChat} disabled={!chatInput.trim()}
              className="bg-hero-600 hover:bg-hero-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm transition-all-fast">➤</button>
          </div>
        </div>
      )}
    </>
  );
}


/* ═══════════════════════════════════════════════════
   GM TOOLBAR
   ═══════════════════════════════════════════════════ */
function GmToolbar({ tid, combat, players, onUpdate }: {
  tid: number; combat: CombatState | null; players: SessionPlayer[];
  onUpdate: (cs: CombatState | null) => void;
}) {
  const [newZoneName, setNewZoneName] = useState('');
  const [testLabel, setTestLabel] = useState('');
  const [testAttr, setTestAttr] = useState('');
  const [testTN, setTestTN] = useState(3);
  const attrs = ['FOR', 'RES', 'AGI', 'DES', 'CMB', 'INT', 'PER', 'PRE'];

  const doStartEncounter = async () => {
    const names = newZoneName.trim() ? newZoneName.split(',').map(s => s.trim()).filter(Boolean) : ['Zona A'];
    const cs = await startEncounter(tid, names); onUpdate(cs); setNewZoneName('');
  };
  const doEndEncounter = async () => { if (!confirm('Encerrar o encontro?')) return; await endEncounter(tid); onUpdate(null); };
  const doAddZone = async () => { if (!newZoneName.trim()) return; const cs = await createZone(tid, newZoneName.trim()); onUpdate(cs); setNewZoneName(''); };
  const doRollInit = async () => { const cs = await rollAllInitiative(tid); onUpdate(cs); };
  const doRequestTest = async () => { if (!testLabel.trim()) return; const cs = await requestTest(tid, testLabel.trim(), testAttr, testTN, []); onUpdate(cs); setTestLabel(''); };

  return (
    <div className="bg-gray-900/90 backdrop-blur-sm border-b border-gray-800 px-3 py-2">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Encounter control */}
        {!combat ? (
          <div className="flex items-center gap-2">
            <input type="text" value={newZoneName} onChange={e => setNewZoneName(e.target.value)}
              placeholder="Zonas (ex: Rua, Telhado)" onKeyDown={e => e.key === 'Enter' && doStartEncounter()}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white outline-none w-40 sm:w-52" />
            <button onClick={doStartEncounter} className="text-[10px] bg-orange-600 hover:bg-orange-700 text-white px-2.5 py-1 rounded-lg transition-all-fast whitespace-nowrap">
              ⚔ Encontro
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-orange-400 font-semibold">⚔ R{combat.round}</span>
            <input type="text" value={newZoneName} onChange={e => setNewZoneName(e.target.value)}
              placeholder="Nova zona..." onKeyDown={e => e.key === 'Enter' && doAddZone()}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none w-24 sm:w-32" />
            <button onClick={doAddZone} disabled={!newZoneName.trim()} className="text-[10px] bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-2 py-1 rounded transition-all-fast">+</button>
            <button onClick={doRollInit} className="text-[10px] bg-blue-700 hover:bg-blue-600 text-white px-2 py-1 rounded-lg transition-all-fast">🎲 Init</button>
            <button onClick={doEndEncounter} className="text-[10px] bg-red-800 hover:bg-red-700 text-white px-2 py-1 rounded-lg transition-all-fast">✕</button>
          </div>
        )}

        {/* Test request */}
        <div className="flex items-center gap-1.5 border-l border-gray-700 pl-3">
          <span className="text-[9px] text-gray-500 hidden sm:inline">TESTE:</span>
          <input type="text" value={testLabel} onChange={e => setTestLabel(e.target.value)}
            placeholder="Descrição..." onKeyDown={e => e.key === 'Enter' && doRequestTest()}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none w-24 sm:w-36" />
          <select value={testAttr} onChange={e => setTestAttr(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-1 py-1 text-xs text-white outline-none">
            <option value="">Livre</option>
            {attrs.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div className="flex items-center gap-0.5">
            <span className="text-[9px] text-gray-500">DN</span>
            <input type="number" value={testTN} onChange={e => setTestTN(Number(e.target.value))} min={0} max={20}
              className="w-7 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs text-center text-white outline-none" />
          </div>
          <button onClick={doRequestTest} disabled={!testLabel.trim()} className="text-[10px] bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white px-2 py-1 rounded-lg transition-all-fast">📋</button>
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   ENCOUNTER VIEW (Zones + Tests)
   ═══════════════════════════════════════════════════ */
function EncounterView({ combat, tid, players, isGm, myUserId, onUpdate }: {
  combat: CombatState; tid: number; players: SessionPlayer[];
  isGm: boolean; myUserId: number; onUpdate: (cs: CombatState | null) => void;
}) {
  const charName = (id: number) => players.find(p => p.character_id === id)?.character_name ?? `#${id}`;
  const charPlayer = (id: number) => players.find(p => p.character_id === id);
  const placedIds = new Set(combat.zones.flatMap(z => z.character_ids));
  const unplaced = players.filter(p => !placedIds.has(p.character_id));
  const myCharIds = players.filter(p => p.user_id === myUserId).map(p => p.character_id);
  const currentTurnCharId = combat.initiative_order?.[combat.current_turn_index]?.character_id;

  const handleMove = async (charId: number, zoneId: string) => { const cs = await moveCharacterZone(tid, charId, zoneId); onUpdate(cs); };
  const handleDeleteZone = async (zoneId: string) => { const cs = await deleteZone(tid, zoneId); onUpdate(cs); };
  const handleRenameZone = async (zoneId: string, name: string) => { const cs = await renameZone(tid, zoneId, name); onUpdate(cs); };
  const handleSubmitTest = async (testId: string, charId: number, successes: number, complications: number) => { const cs = await submitTest(tid, testId, charId, successes, complications); onUpdate(cs); };
  const handleDismissTest = async (testId: string) => { const cs = await dismissTest(tid, testId); onUpdate(cs); };

  return (
    <div className="space-y-4 max-w-5xl mx-auto animate-fade-in">
      {/* Pending tests */}
      {combat.pending_tests?.length > 0 && (
        <div className="space-y-2">
          {combat.pending_tests.map(test => (
            <div key={test.id} className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-3 md:p-4 animate-scale-in">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-sm font-semibold text-purple-300">📋 {test.label}</span>
                  {test.attribute && <span className="text-xs text-purple-500 ml-2">({test.attribute})</span>}
                  {test.tn > 0 && <span className="text-xs text-purple-500 ml-1">DN {test.tn}</span>}
                </div>
                {isGm && <button onClick={() => handleDismissTest(test.id)} className="text-[10px] text-gray-500 hover:text-red-400 transition-all-fast">✕</button>}
              </div>
              {test.results.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {test.results.map((r, i) => (
                    <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full ${r.passed ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'}`}>
                      {charName(r.character_id)}: {r.successes} {r.passed ? '✓' : '✗'}
                    </span>
                  ))}
                </div>
              )}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {combat.zones.map(zone => (
          <ZoneCard key={zone.id} zone={zone} players={players} isGm={isGm} currentTurnCharId={currentTurnCharId}
            allZones={combat.zones} myCharIds={myCharIds} onMove={handleMove}
            onDelete={() => handleDeleteZone(zone.id)} onRename={(name) => handleRenameZone(zone.id, name)} />
        ))}
      </div>

      {/* Unplaced characters */}
      {unplaced.length > 0 && (
        <div className="bg-gray-900/50 border border-dashed border-gray-700 rounded-xl p-3 animate-fade-in">
          <p className="text-[10px] text-gray-500 mb-2">Fora do encontro:</p>
          <div className="flex flex-wrap gap-2">
            {unplaced.map(p => (
              <div key={p.character_id} className="flex items-center gap-2 bg-gray-800/60 rounded-lg px-2.5 py-1.5">
                <Avatar src={p.avatar_url} name={p.character_name} size={24} />
                <span className="text-xs text-gray-300">{p.character_name}</span>
                {combat.zones.length > 0 && (
                  <select defaultValue="" onChange={e => { if (e.target.value) handleMove(p.character_id, e.target.value); }}
                    className="bg-gray-700 border border-gray-600 rounded px-1.5 py-0.5 text-[10px] text-gray-300 outline-none">
                    <option value="" disabled>→</option>
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
function ZoneCard({ zone, players, isGm, currentTurnCharId, allZones, myCharIds, onMove, onDelete, onRename }: {
  zone: { id: string; name: string; character_ids: number[] }; players: SessionPlayer[];
  isGm: boolean; currentTurnCharId?: number; allZones: { id: string; name: string }[];
  myCharIds: number[]; onMove: (charId: number, zoneId: string) => void; onDelete: () => void; onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(zone.name);
  const charsInZone = zone.character_ids.map(id => players.find(p => p.character_id === id)).filter(Boolean) as SessionPlayer[];
  const otherZones = allZones.filter(z => z.id !== zone.id);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden transition-all duration-300 hover:border-gray-700">
      {/* Zone header */}
      <div className="bg-gray-800/50 px-3 py-2 flex items-center justify-between">
        {editing ? (
          <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
            onBlur={() => { onRename(editName); setEditing(false); }}
            onKeyDown={e => { if (e.key === 'Enter') { onRename(editName); setEditing(false); } }}
            autoFocus className="bg-transparent border-b border-hero-500 text-sm font-semibold text-white outline-none w-full" />
        ) : (
          <h3 className="text-sm font-semibold text-white cursor-pointer hover:text-hero-400 transition-all-fast" onClick={() => isGm && setEditing(true)}>
            {zone.name}
          </h3>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">{charsInZone.length}</span>
          {isGm && <button onClick={onDelete} className="text-[10px] text-red-500 hover:text-red-400 transition-all-fast">✕</button>}
        </div>
      </div>

      {/* Characters in zone — avatar miniatures */}
      <div className="p-2.5 space-y-1 min-h-[60px]">
        {charsInZone.length === 0 && <p className="text-[10px] text-gray-600 text-center py-3">Zona vazia</p>}
        {charsInZone.map(p => {
          const hpPct = p.vitalidade_max > 0 ? (p.vitalidade_current / p.vitalidade_max) * 100 : 100;
          const isTurn = currentTurnCharId === p.character_id;
          const canMove = isGm || myCharIds.includes(p.character_id);

          return (
            <div key={p.character_id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-300 ${
              isTurn ? 'bg-hero-600/15 border border-hero-600/30 turn-active' : 'bg-gray-800/40 hover:bg-gray-800/60'
            }`}>
              <Avatar src={p.avatar_url} name={p.character_name} size={28}
                className={isTurn ? 'border-hero-500 shadow-[0_0_8px_rgba(124,58,237,0.4)]' : ''} />
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-medium text-white truncate block">{p.character_name}</span>
                <div className="flex items-center gap-1.5 text-[9px] text-gray-500">
                  <span className={hpPct > 60 ? 'text-green-400' : hpPct > 30 ? 'text-yellow-400' : 'text-red-400'}>
                    {p.vitalidade_current}/{p.vitalidade_max}
                  </span>
                  <span>E{p.dodge} A{p.parry}</span>
                </div>
              </div>
              {canMove && otherZones.length > 0 && (
                <select defaultValue="" onChange={e => { if (e.target.value) onMove(p.character_id, e.target.value); }}
                  className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[9px] text-gray-400 outline-none">
                  <option value="" disabled>→</option>
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
function TestSubmitRow({ charId, charName, testId, onSubmit }: {
  charId: number; charName: string; testId: string;
  onSubmit: (testId: string, charId: number, successes: number, complications: number) => void;
}) {
  const [successes, setSuccesses] = useState(0);
  const [complications, setComplications] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  if (submitted) return <span className="text-[10px] text-gray-500">✓ {charName} enviou resultado</span>;

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <span className="text-purple-300 font-medium">{charName}:</span>
      <div className="flex items-center gap-1">
        <span className="text-gray-500 text-[10px]">Suc</span>
        <input type="number" value={successes} onChange={e => setSuccesses(Number(e.target.value))} min={0} max={20}
          className="w-9 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-center text-white outline-none text-xs" />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-gray-500 text-[10px]">Comp</span>
        <input type="number" value={complications} onChange={e => setComplications(Number(e.target.value))} min={0} max={10}
          className="w-9 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-center text-white outline-none text-xs" />
      </div>
      <button onClick={() => { onSubmit(testId, charId, successes, complications); setSubmitted(true); }}
        className="bg-purple-700 hover:bg-purple-600 text-white px-2 py-0.5 rounded transition-all-fast text-[10px]">Enviar</button>
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   PLAYER CARD
   ═══════════════════════════════════════════════════ */
function PlayerCard({ player, isGm, isCurrentTurn, onKick, onClick }: {
  player: SessionPlayer; isGm: boolean; isCurrentTurn: boolean; onKick: () => void; onClick: () => void;
}) {
  const hpPct = player.vitalidade_max > 0 ? Math.round((player.vitalidade_current / player.vitalidade_max) * 100) : 100;
  const hpColor = hpPct > 60 ? 'bg-green-500' : hpPct > 30 ? 'bg-yellow-500' : 'bg-red-500';
  const wounds = (player.ferimentos || []).reduce((s: number, v: number) => s + v, 0);

  return (
    <div onClick={onClick}
      className={`rounded-xl p-2.5 border cursor-pointer transition-all duration-300 group ${
        isCurrentTurn ? 'bg-hero-600/10 border-hero-600/40 animate-pulse-glow' : 'bg-gray-800/60 border-gray-700/50 hover:border-hero-600/50'
      }`}>
      <div className="flex items-center gap-2.5 mb-1.5">
        <Avatar src={player.avatar_url} name={player.character_name} size={36}
          className={isCurrentTurn ? 'border-hero-500' : ''} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{player.character_name}</p>
          <p className="text-[10px] text-gray-500 truncate">{player.display_name}</p>
        </div>
        {isGm && (
          <button onClick={e => { e.stopPropagation(); onKick(); }}
            className="opacity-0 group-hover:opacity-100 text-[10px] text-red-500 hover:text-red-400 transition-all-fast" title="Remover">✕</button>
        )}
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1">
        <div className={`h-full ${hpColor} hp-bar-fill rounded-full`} style={{ width: `${hpPct}%` }} />
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


/* ═══════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════ */

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
    <div className={`rounded-lg p-2.5 text-xs border transition-all duration-300 ${isSuccess ? 'bg-green-900/20 border-green-800/40' : 'bg-red-900/20 border-red-800/40'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-white">{roll.character_name || 'Anônimo'}</span>
        <span className="text-gray-500">{roll.timestamp ? new Date(roll.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
      </div>
      <p className="text-gray-400 mb-1">{roll.description || roll.roll_type}</p>
      <div className="flex gap-0.5 flex-wrap mb-1">
        {(roll.dice_results || []).map((d, i) => (
          <span key={i} className={`w-5 h-5 flex items-center justify-center rounded font-bold text-[9px] transition-all ${
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
    <div className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-lg border animate-scale-in ${isSuccess ? 'bg-green-900/30 border-green-700/40 text-green-300' : 'bg-red-900/30 border-red-700/40 text-red-300'}`}>
      <div className="flex gap-0.5">
        {roll.dice.map((d, i) => (
          <span key={i} className={`w-4 h-4 flex items-center justify-center rounded text-[8px] font-bold ${
            d.successes > 0 ? 'bg-green-700 text-white' : d.complication ? 'bg-red-700 text-white' : 'bg-gray-700 text-gray-400'
          }`}>{d.face_value}</span>
        ))}
      </div>
      <span className="font-bold">{isSuccess ? `+${roll.margin}` : roll.margin}</span>
    </div>
  );
}

function PlayerSheetView({ player, isGm, onClose }: { player: SessionPlayer; isGm: boolean; onClose: () => void }) {
  const hpPct = player.vitalidade_max > 0 ? Math.round((player.vitalidade_current / player.vitalidade_max) * 100) : 100;
  const hpColor = hpPct > 60 ? 'text-green-400' : hpPct > 30 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-5 max-w-3xl mx-auto animate-scale-in">
      <div className="flex items-center gap-4">
        <Avatar src={player.avatar_url} name={player.character_name} size={64} />
        <div className="flex-1 min-w-0">
          <h2 className="text-xl md:text-2xl font-bold text-hero-400 truncate">{player.character_name}</h2>
          <p className="text-sm text-gray-400">{player.character_concept} — {player.display_name}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-sm px-3 py-1.5 bg-gray-800 rounded-lg transition-all-fast shrink-0">← Voltar</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox label="Vitalidade" value={`${player.vitalidade_current}/${player.vitalidade_max}`} color={hpColor} />
        <StatBox label="Dados Heróicos" value={String(player.hero_dice)} color="text-purple-400" />
        <StatBox label="NP" value={String(player.power_level)} color="text-blue-400" />
        <StatBox label="PP" value={`${player.pp_spent}/${player.pp_total}`} color="text-gray-300" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-2">Defesas</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
          <div className="flex gap-2 flex-wrap">
            {['Leve', 'Moderado', 'Grave', 'Crítico'].map((label, i) => (
              <div key={i} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${player.ferimentos[i] > 0 ? 'bg-red-900/40 text-red-300 border border-red-700/40' : 'bg-gray-800 text-gray-600'}`}>
                {label}: {player.ferimentos[i] || 0}
              </div>
            ))}
          </div>
        </div>
      )}
      {player.active_conditions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Condições</h3>
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

function SessionOverview({ table, gm, players, isGm }: {
  table: SessionDetails['table']; gm: { id: number; display_name: string }; players: SessionPlayer[]; isGm: boolean;
}) {
  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-fade-in">
      <div className="text-center py-8">
        <h2 className="text-2xl font-bold text-hero-400">{table.name}</h2>
        <p className="text-gray-400 mt-1">{table.description || `Nível de Poder ${table.power_level}`}</p>
        <p className="text-sm text-gray-500 mt-2">Mestre: {gm.display_name} • Código: <span className="font-mono text-hero-400">{table.code}</span></p>
      </div>
      {players.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Heróis na Mesa</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {players.map(p => (
              <div key={p.character_id} className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center gap-3">
                <Avatar src={p.avatar_url} name={p.character_name} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white truncate">{p.character_name}</p>
                  <p className="text-xs text-gray-400">{p.character_concept}</p>
                  <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
                    <span>NP {p.power_level}</span>
                    <span>VIT {p.vitalidade_current}/{p.vitalidade_max}</span>
                    <span>🎲 {p.hero_dice}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {isGm && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-400">💡 <strong>Dica:</strong> Clique em <strong>🎭</strong> no topo para abrir as ferramentas de mestre — encontros, zonas e testes genéricos.</p>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-800 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
