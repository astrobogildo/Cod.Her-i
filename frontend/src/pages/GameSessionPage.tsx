import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getTableDetails,
  getTableRolls,
  getTableChat,
  postChatMessage,
  rollDice,
  startSession,
  pauseSession,
  archiveSession,
  removePlayer,
  SessionDetails,
  SessionPlayer,
  RollEntry,
  ChatMsg,
  RollResult,
} from '../api';

/* ─────────────────────────────────────────────────
   GAME SESSION PAGE
   The live VTT-like experience for GM + Players
   ───────────────────────────────────────────────── */

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
  const [quickRollTN, setQuickRollTN] = useState(10);
  const [lastRoll, setLastRoll] = useState<RollResult | null>(null);
  const [showPlayerSheet, setShowPlayerSheet] = useState<SessionPlayer | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load session data ──
  const loadSession = useCallback(async () => {
    try {
      const data = await getTableDetails(tid);
      setSession(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar sessão');
    } finally {
      setLoading(false);
    }
  }, [tid]);

  const loadRolls = useCallback(async () => {
    try {
      const data = await getTableRolls(tid);
      setRolls(data);
    } catch { /* ignore */ }
  }, [tid]);

  const loadChat = useCallback(async () => {
    try {
      const data = await getTableChat(tid);
      setChat(data);
    } catch { /* ignore */ }
  }, [tid]);

  useEffect(() => {
    loadSession();
    loadRolls();
    loadChat();
  }, [loadSession, loadRolls, loadChat]);

  // ── WebSocket connection ──
  useEffect(() => {
    if (!user || !tid) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${proto}//${host}/ws/${tid}?user_id=${user.id}&display_name=${encodeURIComponent(user.display_name)}`);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const event = msg.event;
        if (event === 'player_joined' || event === 'player_left') {
          loadSession(); // refresh player list
        }
        if (event === 'chat_message') {
          loadChat();
        }
        if (event === 'dice_roll') {
          loadRolls();
          loadSession(); // might update vitalidade etc.
        }
        if (event === 'session_control') {
          loadSession();
        }
      } catch { /* ignore bad messages */ }
    };

    ws.onclose = () => {
      // Reconnect after 3s
      setTimeout(() => {
        if (wsRef.current === ws) loadSession();
      }, 3000);
    };

    wsRef.current = ws;
    return () => { ws.close(); wsRef.current = null; };
  }, [user, tid, loadSession, loadChat, loadRolls]);

  // ── Polling fallback (every 10s) ──
  useEffect(() => {
    pollRef.current = setInterval(() => {
      loadSession();
      if (rightPanel === 'chat') loadChat();
      else loadRolls();
    }, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadSession, loadChat, loadRolls, rightPanel]);

  // ── Auto-scroll chat ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  // ── Send chat message ──
  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatInput('');
    try {
      await postChatMessage(tid, text);
      // Broadcast via WS
      wsRef.current?.send(JSON.stringify({ event: 'chat_message', data: { content: text } }));
      await loadChat();
    } catch { /* ignore */ }
  };

  // ── Quick roll ──
  const doQuickRoll = async () => {
    try {
      const result = await rollDice(quickRollPool, 0, quickRollTN, {
        table_id: tid,
        roll_type: 'custom',
        description: `Rolagem rápida (${quickRollPool}d10 vs DN ${quickRollTN})`,
      });
      setLastRoll(result);
      wsRef.current?.send(JSON.stringify({ event: 'dice_roll', data: {} }));
      await loadRolls();
    } catch { /* ignore */ }
  };

  // ── Session controls (GM) ──
  const handleSessionControl = async (action: 'start' | 'pause' | 'archive') => {
    try {
      if (action === 'start') await startSession(tid);
      else if (action === 'pause') await pauseSession(tid);
      else await archiveSession(tid);
      wsRef.current?.send(JSON.stringify({ event: 'session_control', data: { action } }));
      await loadSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    }
  };

  const handleKickPlayer = async (charId: number) => {
    if (!confirm('Remover este jogador da mesa?')) return;
    try {
      await removePlayer(tid, charId);
      await loadSession();
    } catch { /* ignore */ }
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
  const statusColors: Record<string, string> = {
    lobby: 'bg-yellow-600/20 text-yellow-400',
    active: 'bg-green-600/20 text-green-400',
    archived: 'bg-gray-600/20 text-gray-400',
  };
  const statusLabels: Record<string, string> = {
    lobby: 'Aguardando',
    active: 'Em Jogo',
    archived: 'Encerrada',
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* ─── TOP BAR ─── */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/tables')} className="text-gray-400 hover:text-white text-sm">
            ← Mesas
          </button>
          <div>
            <h1 className="text-lg font-bold text-hero-400">{table.name}</h1>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>NP {table.power_level}</span>
              <span>•</span>
              <span>Mestre: {gm.display_name}</span>
              <span>•</span>
              <span className="font-mono">{table.code}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[table.status] || ''}`}>
            {statusLabels[table.status] || table.status}
          </span>
          {is_gm && (
            <div className="flex gap-1.5">
              {table.status === 'lobby' && (
                <button onClick={() => handleSessionControl('start')} className="text-xs bg-green-700 hover:bg-green-600 px-3 py-1.5 rounded-lg transition">
                  ▶ Iniciar
                </button>
              )}
              {table.status === 'active' && (
                <button onClick={() => handleSessionControl('pause')} className="text-xs bg-yellow-700 hover:bg-yellow-600 px-3 py-1.5 rounded-lg transition">
                  ⏸ Pausar
                </button>
              )}
              {table.status !== 'archived' && (
                <button onClick={() => handleSessionControl('archive')} className="text-xs bg-red-800 hover:bg-red-700 px-3 py-1.5 rounded-lg transition">
                  ⏹ Encerrar
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ─── MAIN LAYOUT: 3 columns ─── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ─── LEFT: Players Panel ─── */}
        <aside className="w-72 bg-gray-900/50 border-r border-gray-800 flex flex-col overflow-y-auto shrink-0">
          <div className="p-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-300">
              Jogadores ({players.length})
            </h2>
          </div>
          <div className="flex-1 p-2 space-y-2">
            {players.map(p => (
              <PlayerCard
                key={p.character_id}
                player={p}
                isGm={is_gm}
                onKick={() => handleKickPlayer(p.character_id)}
                onClick={() => setShowPlayerSheet(p)}
              />
            ))}
            {players.length === 0 && (
              <p className="text-xs text-gray-600 text-center py-8">Nenhum jogador na mesa ainda</p>
            )}
          </div>
        </aside>

        {/* ─── CENTER: Main content area ─── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Quick roll bar */}
          <div className="bg-gray-900/30 border-b border-gray-800 px-4 py-2.5 flex items-center gap-3 shrink-0">
            <span className="text-xs text-gray-500 font-medium">Rolagem Rápida:</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setQuickRollPool(Math.max(1, quickRollPool - 1))} className="w-6 h-6 bg-gray-800 hover:bg-gray-700 rounded text-xs">−</button>
              <span className="w-8 text-center text-sm font-bold text-hero-400">{quickRollPool}</span>
              <button onClick={() => setQuickRollPool(Math.min(20, quickRollPool + 1))} className="w-6 h-6 bg-gray-800 hover:bg-gray-700 rounded text-xs">+</button>
              <span className="text-xs text-gray-500 ml-1">d10</span>
            </div>
            <span className="text-xs text-gray-600">vs</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">DN</span>
              <input
                type="number"
                value={quickRollTN}
                onChange={e => setQuickRollTN(Number(e.target.value))}
                min={1}
                max={30}
                className="w-12 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-sm text-center text-white outline-none"
              />
            </div>
            <button
              onClick={doQuickRoll}
              className="bg-hero-600 hover:bg-hero-700 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition"
            >
              🎲 Rolar
            </button>
            {lastRoll && (
              <QuickRollResult roll={lastRoll} />
            )}
          </div>

          {/* Center area (session info or player sheet) */}
          <div className="flex-1 overflow-y-auto p-6">
            {showPlayerSheet ? (
              <PlayerSheetView
                player={showPlayerSheet}
                isGm={is_gm}
                onClose={() => setShowPlayerSheet(null)}
              />
            ) : (
              <SessionOverview
                table={table}
                gm={gm}
                players={players}
                isGm={is_gm}
              />
            )}
          </div>
        </main>

        {/* ─── RIGHT: Chat / Rolls Panel ─── */}
        <aside className="w-80 bg-gray-900/50 border-l border-gray-800 flex flex-col shrink-0">
          {/* Tab switcher */}
          <div className="flex border-b border-gray-800 shrink-0">
            <button
              onClick={() => { setRightPanel('chat'); loadChat(); }}
              className={`flex-1 py-2.5 text-xs font-semibold transition ${rightPanel === 'chat' ? 'text-hero-400 border-b-2 border-hero-400' : 'text-gray-500 hover:text-gray-300'}`}
            >
              💬 Chat
            </button>
            <button
              onClick={() => { setRightPanel('rolls'); loadRolls(); }}
              className={`flex-1 py-2.5 text-xs font-semibold transition ${rightPanel === 'rolls' ? 'text-hero-400 border-b-2 border-hero-400' : 'text-gray-500 hover:text-gray-300'}`}
            >
              🎲 Rolagens
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {rightPanel === 'chat' ? (
              <>
                {chat.map(m => <ChatBubble key={m.id} msg={m} myUserId={user?.id || 0} />)}
                <div ref={chatEndRef} />
              </>
            ) : (
              <>
                {rolls.map(r => <RollCard key={r.id} roll={r} />)}
                {rolls.length === 0 && <p className="text-xs text-gray-600 text-center py-4">Nenhuma rolagem ainda</p>}
              </>
            )}
          </div>

          {/* Chat input */}
          {rightPanel === 'chat' && (
            <div className="border-t border-gray-800 p-2 shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendChat()}
                  placeholder="Mensagem..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-hero-500"
                />
                <button
                  onClick={sendChat}
                  disabled={!chatInput.trim()}
                  className="bg-hero-600 hover:bg-hero-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm transition"
                >
                  ➤
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════ */

function PlayerCard({
  player,
  isGm,
  onKick,
  onClick,
}: {
  player: SessionPlayer;
  isGm: boolean;
  onKick: () => void;
  onClick: () => void;
}) {
  const hpPct = player.vitalidade_max > 0
    ? Math.round((player.vitalidade_current / player.vitalidade_max) * 100)
    : 100;
  const hpColor = hpPct > 60 ? 'bg-green-500' : hpPct > 30 ? 'bg-yellow-500' : 'bg-red-500';
  const wounds = (player.ferimentos || []).reduce((s: number, v: number) => s + v, 0);

  return (
    <div
      onClick={onClick}
      className="bg-gray-800/60 rounded-lg p-2.5 border border-gray-700/50 hover:border-hero-600/50 cursor-pointer transition group"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{player.character_name}</p>
          <p className="text-[10px] text-gray-500 truncate">{player.display_name}</p>
        </div>
        {isGm && (
          <button
            onClick={e => { e.stopPropagation(); onKick(); }}
            className="opacity-0 group-hover:opacity-100 text-[10px] text-red-500 hover:text-red-400 transition-opacity"
            title="Remover"
          >✕</button>
        )}
      </div>
      {/* HP bar */}
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1">
        <div className={`h-full ${hpColor} transition-all`} style={{ width: `${hpPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span>VIT {player.vitalidade_current}/{player.vitalidade_max}</span>
        <div className="flex gap-1.5">
          {wounds > 0 && <span className="text-red-400">🩸{wounds}</span>}
          {player.active_conditions.length > 0 && (
            <span className="text-yellow-400">⚠ {player.active_conditions.length}</span>
          )}
          <span>🎲 {player.hero_dice}</span>
        </div>
      </div>
    </div>
  );
}


function ChatBubble({ msg, myUserId }: { msg: ChatMsg; myUserId: number }) {
  const isMine = msg.user_id === myUserId;
  const isSystem = msg.message_type === 'system';
  const isRoll = msg.message_type === 'roll';

  if (isSystem) {
    return (
      <div className="text-center text-[10px] text-gray-600 py-0.5 italic">
        {msg.content}
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
      {!isMine && (
        <span className="text-[10px] text-gray-500 ml-1 mb-0.5">{msg.display_name}</span>
      )}
      <div className={`max-w-[85%] px-3 py-1.5 rounded-xl text-sm ${
        isRoll
          ? 'bg-purple-900/40 border border-purple-700/40 text-purple-200'
          : isMine
            ? 'bg-hero-600/30 text-hero-100'
            : 'bg-gray-800 text-gray-200'
      }`}>
        {msg.content}
      </div>
      <span className="text-[9px] text-gray-600 mx-1 mt-0.5">
        {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
      </span>
    </div>
  );
}


function RollCard({ roll }: { roll: RollEntry }) {
  const isSuccess = roll.margin !== null && roll.margin >= 0;
  return (
    <div className={`rounded-lg p-2.5 text-xs border ${
      isSuccess
        ? 'bg-green-900/20 border-green-800/40'
        : 'bg-red-900/20 border-red-800/40'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-white">{roll.character_name || 'Anônimo'}</span>
        <span className="text-gray-500">
          {roll.timestamp ? new Date(roll.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
      </div>
      <p className="text-gray-400 mb-1.5">{roll.description || roll.roll_type}</p>
      <div className="flex gap-1 flex-wrap mb-1.5">
        {(roll.dice_results || []).map((d, i) => (
          <span
            key={i}
            className={`w-6 h-6 flex items-center justify-center rounded font-bold text-[10px] ${
              d.is_success ? 'bg-green-700 text-white' : d.is_complication ? 'bg-red-700 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            {d.value}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 text-gray-400">
        <span>✓ {roll.successes}</span>
        {roll.complications > 0 && <span className="text-red-400">✗ {roll.complications}</span>}
        {roll.tn !== null && <span>DN {roll.tn}</span>}
        {roll.margin !== null && (
          <span className={`font-bold ${isSuccess ? 'text-green-400' : 'text-red-400'}`}>
            {isSuccess ? `+${roll.margin}` : roll.margin}
          </span>
        )}
      </div>
    </div>
  );
}


function QuickRollResult({ roll }: { roll: RollResult }) {
  const isSuccess = roll.margin >= 0;
  return (
    <div className={`flex items-center gap-2 text-xs px-3 py-1 rounded-lg border ${
      isSuccess ? 'bg-green-900/30 border-green-700/40 text-green-300' : 'bg-red-900/30 border-red-700/40 text-red-300'
    }`}>
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


function PlayerSheetView({
  player,
  isGm,
  onClose,
}: {
  player: SessionPlayer;
  isGm: boolean;
  onClose: () => void;
}) {
  const hpPct = player.vitalidade_max > 0
    ? Math.round((player.vitalidade_current / player.vitalidade_max) * 100)
    : 100;
  const hpColor = hpPct > 60 ? 'text-green-400' : hpPct > 30 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-hero-400">{player.character_name}</h2>
          <p className="text-sm text-gray-400">{player.character_concept} — {player.display_name}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-sm px-4 py-2 bg-gray-800 rounded-lg">
          ← Voltar
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox label="Vitalidade" value={`${player.vitalidade_current}/${player.vitalidade_max}`} color={hpColor} />
        <StatBox label="Dados Heróicos" value={String(player.hero_dice)} color="text-purple-400" />
        <StatBox label="NP" value={String(player.power_level)} color="text-blue-400" />
        <StatBox label="PP" value={`${player.pp_spent}/${player.pp_total}`} color="text-gray-300" />
      </div>

      {/* Defenses */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 mb-2">Defesas</h3>
        <div className="grid grid-cols-4 gap-2">
          <DefenseBox label="Esquiva" value={player.dodge} />
          <DefenseBox label="Aparar" value={player.parry} />
          <DefenseBox label="Fortitude" value={player.fortitude} />
          <DefenseBox label="Vontade" value={player.willpower} />
        </div>
      </div>

      {/* Wounds */}
      {player.ferimentos && player.ferimentos.some(f => f > 0) && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Ferimentos</h3>
          <div className="flex gap-2">
            {['Leve', 'Moderado', 'Grave', 'Crítico'].map((label, i) => (
              <div key={i} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                player.ferimentos[i] > 0 ? 'bg-red-900/40 text-red-300 border border-red-700/40' : 'bg-gray-800 text-gray-600'
              }`}>
                {label}: {player.ferimentos[i] || 0}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active conditions */}
      {player.active_conditions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Condições Ativas</h3>
          <div className="flex gap-1.5 flex-wrap">
            {player.active_conditions.map((c, i) => (
              <span key={i} className="px-2.5 py-1 bg-yellow-900/30 text-yellow-300 text-xs rounded-full border border-yellow-700/30">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {isGm && (
        <p className="text-xs text-gray-600 italic">
          Como Mestre, você pode ver todos os dados do personagem. Clique no nome na ficha completa para editar.
        </p>
      )}
    </div>
  );
}


function SessionOverview({
  table,
  gm,
  players,
  isGm,
}: {
  table: SessionDetails['table'];
  gm: SessionDetails['gm'];
  players: SessionPlayer[];
  isGm: boolean;
}) {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Campaign banner */}
      <div className="bg-gradient-to-br from-hero-900/40 to-gray-900 rounded-2xl border border-hero-800/30 p-8 text-center">
        <h2 className="text-3xl font-bold text-hero-400 mb-2">{table.name}</h2>
        {table.description && <p className="text-gray-400 mb-4">{table.description}</p>}
        <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
          <span>NP {table.power_level}</span>
          <span>•</span>
          <span>Mestre: {gm.display_name}</span>
          <span>•</span>
          <span>{players.length} jogador{players.length !== 1 ? 'es' : ''}</span>
        </div>
      </div>

      {/* Optional rules */}
      {table.optional_rules && Object.values(table.optional_rules).some(v => v) && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Regras Opcionais Ativas</h3>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(table.optional_rules).filter(([, v]) => v).map(([key]) => (
              <span key={key} className="px-3 py-1 bg-gray-800 text-gray-300 text-xs rounded-full border border-gray-700">
                {key.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Player summary for GM */}
      {isGm && players.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Resumo dos Jogadores</h3>
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs text-gray-500">
                  <th className="px-4 py-2">Personagem</th>
                  <th className="px-4 py-2">Jogador</th>
                  <th className="px-4 py-2">VIT</th>
                  <th className="px-4 py-2">Defesas</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {players.map(p => {
                  const hpPct = p.vitalidade_max > 0
                    ? Math.round((p.vitalidade_current / p.vitalidade_max) * 100)
                    : 100;
                  return (
                    <tr key={p.character_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-4 py-2 font-medium text-white">{p.character_name}</td>
                      <td className="px-4 py-2 text-gray-400">{p.display_name}</td>
                      <td className="px-4 py-2">
                        <span className={hpPct > 60 ? 'text-green-400' : hpPct > 30 ? 'text-yellow-400' : 'text-red-400'}>
                          {p.vitalidade_current}/{p.vitalidade_max}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-400">
                        E{p.dodge} A{p.parry} F{p.fortitude} V{p.willpower}
                      </td>
                      <td className="px-4 py-2">
                        {p.active_conditions.length > 0 ? (
                          <span className="text-yellow-400 text-xs">⚠ {p.active_conditions.join(', ')}</span>
                        ) : (
                          <span className="text-green-400 text-xs">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GM tips */}
      {isGm && (
        <div className="bg-purple-900/10 border border-purple-800/30 rounded-xl p-4 text-sm text-purple-300">
          <p className="font-semibold mb-1">🎭 Dicas do Mestre</p>
          <ul className="text-xs space-y-1 text-purple-400">
            <li>• Clique num jogador na barra lateral para ver sua ficha</li>
            <li>• Use o chat para narrar eventos e interagir com os jogadores</li>
            <li>• A rolagem rápida permite criar testes instantâneos</li>
            <li>• Controle a sessão pelo botão no topo (Iniciar/Pausar/Encerrar)</li>
          </ul>
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

function DefenseBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 text-center">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}
