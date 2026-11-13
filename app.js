/* ═══════════════════════════════════════════════════════════════
   FOCO v2 — app principal
   ═══════════════════════════════════════════════════════════════ */
import { initStore, isDemo, setDemo } from './store.js';

/* ───────────── Utilitários ───────────── */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const getHoje = () => ymd(new Date());
const mesDe = x => { if (!x) return ''; if (typeof x === 'number') { const d = new Date(x); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; } return String(x).slice(0, 7); };
const mesAtual = () => mesDe(Date.now());
const parseDia = s => new Date(s + 'T12:00:00');
const addDias = (s, n) => { const d = parseDia(s); d.setDate(d.getDate() + n); return ymd(d); };
const addMeses = (s, n) => { const d = parseDia(s); const dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return ymd(d); };
const fmtDate = d => { if (!d) return ''; const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; };
const fmtMoney = v => (Number(v) || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€';
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MOOD_EMOJI = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };
const MOOD_NOME = { 1: 'Mau', 2: 'Fraco', 3: 'Normal', 4: 'Bem', 5: 'Ótimo' };
const DIAS_HOR = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const HORAS_HOR = []; for (let h = 7; h <= 23; h++) { HORAS_HOR.push(`${pad(h)}:00`); if (h < 23) HORAS_HOR.push(`${pad(h)}:30`); }
const plural = (n, s, p) => `${n} ${n === 1 ? s : (p || s + 's')}`;

/* Escapa texto para HTML. Descodifica primeiro entidades antigas (dados guardados com DOMPurify na v1). */
const _dec = document.createElement('textarea');
const esc = s => { _dec.innerHTML = String(s ?? ''); return _dec.value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); };
const plain = s => { _dec.innerHTML = String(s ?? ''); return _dec.value; };
const clean = v => String(v ?? '').trim();
const purify = (html, opts) => window.DOMPurify ? window.DOMPurify.sanitize(html, opts) : esc(html);
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ───────────── Estado ───────────── */
let S = null;          // store
let user = null, uid = null;
const D = {            // dados (nomes das coleções iguais à v1 → dados antigos continuam a funcionar)
  testes: [], objetivos: [], notas: [], financas: [], horario: [], habitos: [], habitos_log: [],
  humor: [], obj_prog: [], flashcards: [], notas_academicas: [], iou: [], subscricoes: [],
  mealheiros: [], xp_log: [], cofre: [], orcamentos: []
};
const COLS = Object.keys(D);
const loaded = new Set();
let unsubs = [];
let viewAtual = 'dashboard', filtroAtivo = 'todas', tagFiltroAtivo = null, fcCatAtiva = null;
let dataCal = new Date();
let financeChart = null, statsChart = null, moodChart = null;
let zenMode = false;
window.diaSelecionado = null;

/* ───────────── Toasts ───────────── */
function toast(msg, type = 'success', action) {
  const root = $('toast-root'); if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { action.fn(); close(); }; el.appendChild(b); }
  root.appendChild(el);
  while (root.children.length > 3) root.firstChild.remove();
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  setTimeout(close, action ? 5500 : 2800);
}
window.toast = toast;

/* ───────────── Som & notificações ───────────── */
let audioCtx = null;
const somDing = () => {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const c = audioCtx, o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination); o.type = 'sine';
    o.frequency.setValueAtTime(880, c.currentTime); o.frequency.setValueAtTime(1320, c.currentTime + .12);
    g.gain.setValueAtTime(0.18, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.45);
    o.start(); o.stop(c.currentTime + 0.45);
  } catch {}
};
function enviarNotificacao(titulo, corpo, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = { body: corpo, icon: 'icon-192.png', badge: 'icon-192.png', tag };
  if (navigator.serviceWorker?.controller) navigator.serviceWorker.ready.then(r => r.showNotification(titulo, opts)).catch(() => {});
  else { try { new Notification(titulo, opts); } catch {} }
}
/* Notifica uma única vez por chave (evita spam a cada render) */
function notificarUmaVez(chave, titulo, corpo) {
  const k = `notif_${uid}_${chave}`;
  try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch {}
  enviarNotificacao(titulo, corpo, chave);
}

/* ───────────── Confirmação ───────────── */
let confirmCallback = null;
function pedirConfirmacao(msg, titulo = 'Tens a certeza?', okLabel = 'Confirmar') {
  return new Promise(resolve => {
    $('confirm-title').textContent = titulo;
    $('confirm-msg').textContent = msg;
    $('confirm-ok').textContent = okLabel;
    $('confirm-overlay').classList.add('open');
    confirmCallback = resolve;
    setTimeout(() => $('confirm-cancel').focus(), 50);
  });
}
const fecharConfirm = v => { $('confirm-overlay').classList.remove('open'); confirmCallback?.(v); confirmCallback = null; };
$('confirm-ok').onclick = () => fecharConfirm(true);
$('confirm-cancel').onclick = () => fecharConfirm(false);
$('confirm-overlay').addEventListener('click', e => { if (e.target.id === 'confirm-overlay') fecharConfirm(false); });

/* ───────────── Modais ───────────── */
const modalStack = [];
window.abrirModal = id => {
  const el = $(id); if (!el) return;
  if (!el.classList.contains('open')) modalStack.push({ id, opener: document.activeElement });
  el.classList.add('open');
  setTimeout(() => { const f = el.querySelector('input:not([type=hidden]):not([type=color]),select,textarea,[contenteditable],.btn-primary'); f?.focus({ preventScroll: true }); }, 60);
};
window.fecharModal = id => {
  const el = $(id); if (!el) return;
  el.classList.remove('open');
  const i = modalStack.findIndex(m => m.id === id);
  if (i >= 0) { const [m] = modalStack.splice(i, 1); if (m.opener?.isConnected) m.opener.focus?.({ preventScroll: true }); }
};
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if ($('confirm-overlay').classList.contains('open')) return fecharConfirm(false);
  const top = modalStack[modalStack.length - 1];
  if (top) { top.id === 'modal-pomo-estudo' ? fecharModoEstudo() : fecharModal(top.id); }
});
document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.id === 'modal-pomo-estudo' ? fecharModoEstudo() : fecharModal(m.id); }));

/* ───────────── Header, tema, zen ───────────── */
const updateHeaderDate = () => { const n = new Date(); $('header-date').textContent = `${DIAS_SEMANA[n.getDay()]}, ${n.getDate()} de ${MESES[n.getMonth()]}`; };
updateHeaderDate(); setInterval(updateHeaderDate, 60000);

$('theme-toggle').onclick = () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch {}
  document.querySelector('meta[name=theme-color]').content = next === 'dark' ? '#111018' : '#2563eb';
  renderizarApp();
};

window.toggleZen = () => {
  zenMode = !zenMode;
  document.body.classList.toggle('zen-mode', zenMode);
  $('btn-zen').textContent = zenMode ? '🌟' : '🧘';
  $('btn-zen').setAttribute('aria-pressed', zenMode);
  if (zenMode) irPara('dashboard');
  toast(zenMode ? 'Modo Zen ativo 🧘' : 'Modo Zen desativado');
};
$('btn-zen').onclick = toggleZen;

/* ───────────── Navegação & FAB ───────────── */
const FAB_CONFIG = { dashboard: ['+', 'Adicionar'], agenda: ['📅', 'Nova tarefa'], habitos: ['🌱', 'Novo hábito'], financas: ['💶', 'Registar'], notas: ['📝', 'Nova nota'], flashcards: ['📚', 'Novo cartão'] };
const FAB_ACTION = {
  dashboard: () => abrirNovoRegisto('tarefa'), agenda: () => abrirNovoRegisto('tarefa'),
  habitos: () => abrirModal('modal-add-habito'),
  financas: () => { $('fin-valor').scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => $('fin-valor').focus(), 300); },
  notas: () => { if (tabNotaAtiva === 'academicas') abrirModal('modal-add-nota-academica'); else if (tabNotaAtiva === 'privadas') { cofreKey ? abrirModalNota(null, true) : pedirPIN(() => abrirModalNota(null, true)); } else abrirModalNota(); },
  flashcards: () => abrirModal('modal-add-fc')
};
function atualizarFAB(v) {
  const fab = $('fab-btn'); const cfg = FAB_CONFIG[v];
  fab.style.display = cfg ? 'flex' : 'none';
  if (cfg) { $('fab-icon').textContent = cfg[0]; $('fab-label').textContent = cfg[1]; }
}
window.irPara = view => {
  const navView = view === 'horario' ? 'agenda' : view;
  document.querySelectorAll('.nav-item').forEach(b => { const on = b.dataset.view === navView; b.classList.toggle('active', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
  document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
  $(`view-${view}`)?.classList.add('active');
  viewAtual = view; atualizarFAB(view); renderizarApp();
  scrollTo({ top: 0 });
};
document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => { if (zenMode && btn.dataset.view !== 'dashboard') return; irPara(btn.dataset.view); }));
$('fab-btn').onclick = () => (FAB_ACTION[viewAtual] || FAB_ACTION.dashboard)();

/* ═════════════ XP (agora sincronizado na conta, não só no dispositivo) ═════════════ */
const calcNivel = xp => Math.floor(Math.max(0, xp) / 100) + 1;
const xpDoMes = () => D.xp_log.filter(x => x.mes === mesAtual()).reduce((a, x) => a + (x.pts || 0), 0);
async function ganharXP(pts, motivo, ref) {
  const antes = xpDoMes();
  await S.add('xp_log', { pts, motivo, ref: ref || null, mes: mesAtual(), uid, ts: Date.now() }).catch(() => {});
  if (pts > 0 && calcNivel(antes + pts) > calcNivel(antes)) {
    window.confetti?.({ particleCount: 180, spread: 90, origin: { y: .55 } });
    toast(`🏆 Subiste para o nível ${calcNivel(antes + pts)}!`);
  }
}
async function removerXP(ref) {
  const alvo = D.xp_log.filter(x => x.ref === ref && x.mes === mesAtual());
  await Promise.all(alvo.map(x => S.remove('xp_log', x.id))).catch(() => {});
}
/* Migra XP que estava só no localStorage (v1) */
function migrarXPLocal() {
  const n = new Date(); const k = `xp_${n.getFullYear()}_${n.getMonth()}`; const flag = `xp_migrado_${uid}_${k}`;
  try {
    if (localStorage.getItem(flag)) return;
    const v = parseInt(localStorage.getItem(k) || '0');
    localStorage.setItem(flag, '1');
    if (v > 0 && !D.xp_log.some(x => x.mes === mesAtual())) S.add('xp_log', { pts: v, motivo: 'XP da versão anterior', ref: 'migracao', mes: mesAtual(), uid, ts: Date.now() });
  } catch {}
}
window.abrirXPLog = () => {
  const lista = D.xp_log.filter(x => x.mes === mesAtual()).sort((a, b) => b.ts - a.ts).slice(0, 60);
  $('xp-log-list').innerHTML = lista.length ? lista.map(x => `<div class="xp-log-row"><span>${esc(x.motivo)}</span><b style="color:${x.pts >= 0 ? 'var(--success)' : 'var(--danger)'};font-family:var(--mono)">${x.pts > 0 ? '+' : ''}${x.pts}</b></div>`).join('') : '<div class="empty-state">Ainda sem XP este mês. Conclui uma tarefa!</div>';
  abrirModal('modal-xp');
};

/* ═════════════ TAREFAS & EVENTOS ═════════════ */
let registoEmEdicao = null; // {tipo,id}
window.mudarFormGlobal = () => {
  const tipo = $('tipo-global').value;
  $('recorrencia-group').style.display = tipo === 'tarefa' ? 'flex' : 'none';
};
window.abrirNovoRegisto = (tipo = 'tarefa', data = null) => {
  registoEmEdicao = null;
  $('modal-global-title').textContent = 'Novo registo';
  $('tipo-global').value = tipo; $('tipo-global').disabled = false;
  $('add-titulo').value = ''; $('add-data').value = data || getHoje(); $('add-hora').value = '';
  $('add-prioridade').value = 'media'; $('add-recorrencia').value = '';
  $('btn-salvar-global').textContent = 'Guardar';
  mudarFormGlobal(); abrirModal('modal-add-global');
};
function abrirEditarRegisto(tipo, id) {
  const o = (tipo === 'tarefa' ? D.objetivos : D.testes).find(x => x.id === id); if (!o) return;
  registoEmEdicao = { tipo, id };
  $('modal-global-title').textContent = tipo === 'tarefa' ? 'Editar tarefa' : 'Editar evento';
  $('tipo-global').value = tipo; $('tipo-global').disabled = true;
  $('add-titulo').value = plain(tipo === 'tarefa' ? o.titulo : o.disciplina);
  $('add-data').value = o.data || getHoje(); $('add-hora').value = o.hora || '';
  $('add-prioridade').value = o.prioridade || 'media'; $('add-recorrencia').value = o.recorrencia || '';
  $('btn-salvar-global').textContent = 'Guardar alterações';
  mudarFormGlobal(); abrirModal('modal-add-global');
}
$('add-titulo').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-salvar-global').click(); });
$('btn-salvar-global').onclick = async () => {
  const tipo = $('tipo-global').value;
  const titulo = clean($('add-titulo').value);
  if (!titulo) { toast('Escreve um título.', 'error'); return $('add-titulo').focus(); }
  const base = { data: $('add-data').value || getHoje(), hora: $('add-hora').value || '', prioridade: $('add-prioridade').value };
  try {
    if (registoEmEdicao) {
      const { id } = registoEmEdicao;
      if (tipo === 'tarefa') await S.update('objetivos', id, { ...base, titulo, recorrencia: $('add-recorrencia').value || null, penalizado: false, notifUrgente: false });
      else await S.update('testes', id, { ...base, disciplina: titulo });
      toast('Alterações guardadas');
    } else {
      if (tipo === 'tarefa') await S.add('objetivos', { ...base, titulo, concluido: false, penalizado: false, recorrencia: $('add-recorrencia').value || null, uid, ts: Date.now() });
      else await S.add('testes', { ...base, disciplina: titulo, uid, ts: Date.now() });
      toast(tipo === 'tarefa' ? 'Tarefa criada' : 'Evento criado');
    }
    fecharModal('modal-add-global');
  } catch (e) { erroGuardar(e); }
};

async function toggleConcluir(id) {
  const t = D.objetivos.find(o => o.id === id); if (!t) return;
  const ref = `task:${id}`;
  if (!t.concluido) {
    t.concluido = true; renderizarApp(); // resposta imediata
    await S.update('objetivos', id, { concluido: true, concluidoEm: Date.now() });
    somDing();
    const comPomo = pomoTarefaSelecionada?.id === id;
    await ganharXP(comPomo ? 20 : 10, `Tarefa: ${plain(t.titulo)}`, ref);
    // Recorrência: cria a próxima ocorrência (na v1 a opção existia mas não fazia nada)
    if (t.recorrencia && !t.proximaGerada) {
      const prox = t.recorrencia === 'semanal' ? addDias(t.data || getHoje(), 7) : addMeses(t.data || getHoje(), 1);
      await S.add('objetivos', { titulo: t.titulo, data: prox, hora: t.hora || '', prioridade: t.prioridade || 'media', recorrencia: t.recorrencia, concluido: false, penalizado: false, uid, ts: Date.now() });
      await S.update('objetivos', id, { proximaGerada: true });
      toast(`✓ Feita! Próxima: ${fmtDate(prox)}`);
    } else toast('✓ Tarefa concluída · +' + (comPomo ? 20 : 10) + ' XP', 'success', { label: 'Anular', fn: () => toggleConcluir(id) });
  } else {
    t.concluido = false; renderizarApp();
    await S.update('objetivos', id, { concluido: false });
    await removerXP(ref); // impede "farmar" XP a marcar/desmarcar
  }
}
window.toggleConcluir = toggleConcluir;

const COL_LABEL = { objetivos: 'Tarefa', testes: 'Evento', notas: 'Nota', financas: 'Movimento', habitos: 'Hábito', obj_prog: 'Objetivo', flashcards: 'Cartão', notas_academicas: 'Avaliação', iou: 'Registo', subscricoes: 'Subscrição', mealheiros: 'Mealheiro', horario: 'Aula', orcamentos: 'Orçamento' };
async function apagarItem(id, colName) {
  const item = D[colName]?.find(x => x.id === id);
  if (!await pedirConfirmacao('Esta ação não pode ser desfeita.', `Apagar ${(COL_LABEL[colName] || 'item').toLowerCase()}?`, 'Apagar')) return;
  try {
    await S.remove(colName, id);
    if (colName === 'habitos') await Promise.all(D.habitos_log.filter(l => l.habitoId === id).map(l => S.remove('habitos_log', l.id)));
    toast(`${COL_LABEL[colName] || 'Item'} apagado`, 'success', item ? { label: 'Desfazer', fn: () => { const { id: _i, ...rest } = item; S.add(colName, rest); } } : null);
  } catch (e) { erroGuardar(e); }
}
window.apagarItem = apagarItem;

/* Penalizações por atraso & avisos de urgência — um único intervalo */
let penalTimer = null;
function verificarPrazos() {
  if (!loaded.has('objetivos') || !loaded.has('xp_log')) return;
  const agora = new Date(), hoje = getHoje();
  D.objetivos.forEach(o => {
    if (o.concluido || !o.data) return;
    const prazo = o.hora ? new Date(`${o.data}T${o.hora}`) : new Date(`${o.data}T23:59:59`);
    const atraso = agora - prazo;
    // só penaliza atrasos recentes (<48h) para não castigar tarefas antigas de uma vez
    if (atraso > 0 && atraso < 48 * 3600e3 && !o.penalizado) {
      o.penalizado = true;
      S.update('objetivos', o.id, { penalizado: true });
      ganharXP(-5, `Atraso: ${plain(o.titulo)}`, `late:${o.id}`);
      toast(`⚠ Tarefa atrasada: −5 XP`, 'warn');
      enviarNotificacao('⚠ Tarefa atrasada', plain(o.titulo), `late-${o.id}`);
    }
    const diffMin = (prazo - agora) / 60000;
    if (o.hora && diffMin > 0 && diffMin <= 30 && !o.notifUrgente) {
      o.notifUrgente = true;
      S.update('objetivos', o.id, { notifUrgente: true });
      enviarNotificacao(o.prioridade === 'urgente' ? '🚨 Urgente daqui a 30 min' : '⏰ Daqui a 30 min', plain(o.titulo), `soon-${o.id}`);
    }
  });
  if (o_hoje_resumo_pendente()) notificarUmaVez(`resumo_${hoje}`, '📅 Bom dia!', `Tens ${plural(D.objetivos.filter(o => !o.concluido && o.data === hoje).length, 'tarefa')} para hoje.`);
}
const o_hoje_resumo_pendente = () => new Date().getHours() >= 8 && D.objetivos.some(o => !o.concluido && o.data === getHoje());

/* Objetivos com progresso */
$('btn-salvar-objetivo').onclick = async () => {
  const titulo = clean($('obj-titulo').value), meta = parseInt($('obj-meta').value), unidade = clean($('obj-unidade').value);
  if (!titulo || !meta || meta < 1) return toast('Preenche o título e a meta.', 'error');
  try {
    await S.add('obj_prog', { titulo, meta, unidade: unidade || 'unid.', progresso: 0, uid, ts: Date.now() });
    fecharModal('modal-add-objetivo'); ['obj-titulo', 'obj-meta', 'obj-unidade'].forEach(i => $(i).value = ''); toast('Objetivo criado');
  } catch (e) { erroGuardar(e); }
};
let objProgEmEdicao = null;
function abrirModalProgresso(id) {
  const obj = D.obj_prog.find(o => o.id === id); if (!obj) return;
  objProgEmEdicao = obj;
  $('modal-obj-prog-title').textContent = plain(obj.titulo);
  $('modal-obj-prog-info').textContent = `${obj.progresso} / ${obj.meta} ${plain(obj.unidade)}`;
  $('modal-obj-bar').style.width = Math.min(100, obj.progresso / obj.meta * 100) + '%';
  $('obj-prog-input').value = obj.progresso; $('obj-prog-input').max = obj.meta;
  abrirModal('modal-obj-prog');
}
$('btn-atualizar-prog').onclick = async () => {
  if (!objProgEmEdicao) return;
  const val = Math.max(0, Math.min(parseInt($('obj-prog-input').value) || 0, objProgEmEdicao.meta));
  await S.update('obj_prog', objProgEmEdicao.id, { progresso: val });
  if (val >= objProgEmEdicao.meta && objProgEmEdicao.progresso < objProgEmEdicao.meta) { window.confetti?.({ particleCount: 200, spread: 90 }); toast('🏆 Objetivo concluído!'); }
  else toast('Progresso atualizado');
  fecharModal('modal-obj-prog');
};

/* ═════════════ HÁBITOS ═════════════ */
$('btn-salvar-habito').onclick = async () => {
  const nome = clean($('hab-nome').value), icon = clean($('hab-icon').value) || '✅', freq = $('hab-freq').value || 'diario';
  if (!nome) return toast('Dá um nome ao hábito.', 'error');
  try {
    await S.add('habitos', { nome, icon, freq, uid, ts: Date.now() });
    fecharModal('modal-add-habito'); $('hab-nome').value = ''; $('hab-icon').value = ''; toast('Hábito criado 🌱');
  } catch (e) { erroGuardar(e); }
};
function habitoAtivoPara(hab, dataStr) {
  const dow = parseDia(dataStr).getDay();
  switch (hab.freq) {
    case 'finsemana': return dow === 0 || dow === 6;
    case 'semanal': return dow === 1;
    case 'semana3': return dow === 1 || dow === 3 || dow === 5;
    default: return true;
  }
}
/* Sequência que respeita a frequência (dias em que o hábito não se aplica não quebram a sequência) */
function streakHabito(h) {
  const dias = new Set(D.habitos_log.filter(l => l.habitoId === h.id).map(l => l.data));
  let s = getHoje(), count = 0, guard = 0;
  if (habitoAtivoPara(h, s) && !dias.has(s)) s = addDias(s, -1); // hoje ainda não conta como falha
  while (guard++ < 400) {
    if (habitoAtivoPara(h, s)) { if (dias.has(s)) count++; else break; }
    s = addDias(s, -1);
  }
  return count;
}
let habLock = new Set();
async function toggleHabito(id) {
  if (habLock.has(id)) return; habLock.add(id);
  const hoje = getHoje(), h = D.habitos.find(x => x.id === id);
  const log = D.habitos_log.find(l => l.habitoId === id && l.data === hoje);
  try {
    if (log) { await S.remove('habitos_log', log.id); await removerXP(`hab:${id}:${hoje}`); }
    else { await S.add('habitos_log', { habitoId: id, data: hoje, uid, ts: Date.now() }); somDing(); await ganharXP(5, `Hábito: ${plain(h?.nome)}`, `hab:${id}:${hoje}`); }
  } finally { habLock.delete(id); }
}
function calcularStreakGlobal() {
  const dias = new Set(D.habitos_log.map(l => l.data));
  let s = getHoje(); if (!dias.has(s)) s = addDias(s, -1);
  let c = 0; while (dias.has(s) && c < 1000) { c++; s = addDias(s, -1); }
  return c;
}

/* ═════════════ HUMOR ═════════════ */
let moodEditar = false;
document.querySelectorAll('.mood-btn').forEach(btn => btn.onclick = async () => {
  const hoje = getHoje(), mood = parseInt(btn.dataset.mood);
  const existing = D.humor.find(m => m.data === hoje);
  try {
    if (existing) await S.update('humor', existing.id, { mood }); else await S.add('humor', { mood, data: hoje, uid, ts: Date.now() });
    moodEditar = false; toast(`Humor registado ${MOOD_EMOJI[mood]}`);
  } catch (e) { erroGuardar(e); }
});
window.mostrarMood = () => { moodEditar = true; renderDashboard(getHoje()); };

/* ═════════════ FLASHCARDS (repetição espaçada) ═════════════ */
$('btn-salvar-fc').onclick = async () => {
  const p = clean($('fc-pergunta').value), r = clean($('fc-resposta').value), c = clean($('fc-categoria').value) || 'Geral';
  if (!p || !r) return toast('Preenche a pergunta e a resposta.', 'error');
  try {
    await S.add('flashcards', { pergunta: p, resposta: r, categoria: c, uid, ts: Date.now(), srNextDate: getHoje(), srEase: 2.5, srInterval: 0 });
    $('fc-pergunta').value = ''; $('fc-resposta').value = ''; $('fc-pergunta').focus();
    toast('Cartão guardado · podes adicionar outro');
  } catch (e) { erroGuardar(e); }
};
$('btn-import-fc').onclick = async () => {
  const cat = clean($('fc-import-cat').value) || 'Geral';
  const linhas = $('fc-import-text').value.split('\n').map(l => l.trim()).filter(Boolean);
  const cards = linhas.map(l => { const sep = l.includes('\t') ? '\t' : ';'; const i = l.indexOf(sep); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null; }).filter(c => c && c[0] && c[1]);
  if (!cards.length) return toast('Não encontrei cartões. Usa "pergunta ; resposta".', 'error');
  try {
    await Promise.all(cards.map(([p, r], i) => S.add('flashcards', { pergunta: p, resposta: r, categoria: cat, uid, ts: Date.now() + i, srNextDate: getHoje(), srEase: 2.5, srInterval: 0 })));
    $('fc-import-text').value = ''; fecharModal('modal-import-fc'); toast(`${plural(cards.length, 'cartão', 'cartões')} importados 📚`);
  } catch (e) { erroGuardar(e); }
};
/* Algoritmo SM-2 simplificado */
function proximoSR(fc, dif) {
  let ease = fc.srEase || 2.5, intv = fc.srInterval || 0;
  if (dif === 'dificil') { intv = 1; ease = Math.max(1.3, ease - 0.2); }
  else if (dif === 'medio') { intv = intv < 1 ? 1 : Math.max(intv + 1, Math.round(intv * 1.2)); ease = Math.max(1.3, ease - 0.05); }
  else { intv = intv < 1 ? 3 : Math.max(intv + 1, Math.round(intv * ease)); ease = Math.min(3, ease + 0.1); }
  return { srInterval: intv, srEase: +ease.toFixed(2), srNextDate: addDias(getHoje(), intv) };
}
const dueHoje = f => !f.srNextDate || f.srNextDate <= getHoje();
const fcFiltrados = () => D.flashcards.filter(f => !fcCatAtiva || (f.categoria || 'Geral') === fcCatAtiva);
let fcFila = [], fcIndex = 0, fcFlipped = false;
function construirFilaFC() {
  const lista = fcFiltrados();
  fcFila = [...lista.filter(dueHoje), ...lista.filter(f => !dueHoje(f)).sort((a, b) => (a.srNextDate || '').localeCompare(b.srNextDate || ''))].map(f => f.id);
  if (fcIndex >= fcFila.length) fcIndex = 0;
}
async function responderSR(dif, fcId, origem) {
  const fc = D.flashcards.find(f => f.id === fcId); if (!fc) return;
  const upd = proximoSR(fc, dif);
  try { await S.update('flashcards', fc.id, upd); } catch (e) { return erroGuardar(e); }
  ganharXP(dif === 'facil' ? 3 : dif === 'medio' ? 2 : 1, 'Revisão de flashcard', `fc:${fc.id}:${getHoje()}`);
  toast(`Próxima revisão ${upd.srInterval === 1 ? 'amanhã' : `daqui a ${upd.srInterval} dias`}`);
  if (origem === 'estudo') { avancarPomoFC(dif); }
  else { fcFlipped = false; fcIndex = (fcIndex + 1) % Math.max(1, fcFila.length); }
}
function renderStudyArea() {
  const area = $('fc-study-area');
  const cats = [...new Set(D.flashcards.map(f => f.categoria || 'Geral'))].sort();
  $('fc-cat-chips').innerHTML = cats.length > 1 ? [`<button class="chip ${!fcCatAtiva ? 'active' : ''}" data-act="fc-cat" data-cat="">Todas</button>`, ...cats.map(c => `<button class="chip ${fcCatAtiva === c ? 'active' : ''}" data-act="fc-cat" data-cat="${esc(c)}">${esc(c)} · ${D.flashcards.filter(f => (f.categoria || 'Geral') === c && dueHoje(f)).length}</button>`)].join('') : '';
  construirFilaFC();
  if (!fcFila.length) { area.innerHTML = '<div class="empty-state-fancy"><div class="es-icon">📚</div><div class="es-msg">Cria cartões com pergunta e resposta.<br>O Foco diz-te quando rever cada um.</div></div>'; return; }
  const fc = D.flashcards.find(f => f.id === fcFila[fcIndex]);
  const due = dueHoje(fc), nDue = fcFiltrados().filter(dueHoje).length;
  area.innerHTML = `
    <div style="display:flex;gap:.4rem;margin-bottom:.4rem;align-items:center;">
      ${due ? '<span class="fc-due-badge">📅 Para rever hoje</span>' : `<span class="fc-next-badge">✅ Próx.: ${fmtDate(fc.srNextDate)}</span>`}
      ${nDue === 0 ? '<span style="font-size:.7rem;color:var(--muted);">Revisões de hoje feitas! Podes rever adiantado.</span>' : ''}
    </div>
    <div class="flashcard-wrap" data-act="fc-flip" role="button" tabindex="0" aria-label="Virar cartão">
      <div class="flashcard ${fcFlipped ? 'flipped' : ''}" id="active-flashcard">
        <div class="flashcard-face flashcard-front">${esc(fc.pergunta)}</div>
        <div class="flashcard-face flashcard-back">${esc(fc.resposta)}</div>
      </div>
    </div>
    <div class="fc-counter">${fcIndex + 1} / ${fcFila.length} · ${esc(fc.categoria || 'Geral')} · ${nDue} para rever</div>
    <div class="sr-btns" style="display:${fcFlipped ? 'flex' : 'none'};">
      <button class="sr-btn sr-hard" data-act="fc-sr" data-dif="dificil" data-id="${fc.id}">😓 Difícil</button>
      <button class="sr-btn sr-medium" data-act="fc-sr" data-dif="medio" data-id="${fc.id}">🤔 Médio</button>
      <button class="sr-btn sr-easy" data-act="fc-sr" data-dif="facil" data-id="${fc.id}">😊 Fácil</button>
    </div>
    <div style="display:${fcFlipped ? 'none' : 'flex'};gap:.6rem;margin-top:.5rem;">
      <button class="btn-secondary" style="flex:1;" data-act="fc-prev">← Anterior</button>
      <button class="btn-primary" style="flex:1;" data-act="fc-flip">Mostrar resposta</button>
      <button class="btn-secondary" style="flex:1;" data-act="fc-next">Saltar →</button>
    </div>`;
}

/* ═════════════ NOTAS (+ cofre encriptado) ═════════════ */
let notaEmEdicao = null, corNota = '#ffffff', notaPrivada = false, tabNotaAtiva = 'normais';
const extrairTags = t => [...new Set((t.match(/#[\p{L}\p{N}_-]+/gu) || []).map(x => x.toLowerCase()))];

window.abrirModalNota = (n = null, privada = false) => {
  if (typeof n === 'string') n = D.notas.find(x => x.id === n);
  notaEmEdicao = n; notaPrivada = privada || !!n?.privada;
  const conteudoPriv = n?.enc ? cofreCache.get(n.id) : null;
  if (n?.enc && !conteudoPriv) return toast('Não foi possível desencriptar esta nota.', 'error');
  const src = conteudoPriv || n || {};
  $('nota-titulo').value = n ? plain(src.titulo) : '';
  $('nota-conteudo').innerHTML = n ? purify(src.conteudo || '', { ADD_ATTR: ['style'] }) : '';
  $('nota-tags-input').value = (src.tags || []).join(' ');
  corNota = n?.cor || '#ffffff';
  document.querySelectorAll('#nota-colors .cp-dot').forEach(d => d.classList.toggle('active', d.dataset.color === corNota));
  $('btn-apagar-nota').style.display = n ? '' : 'none';
  atualizarTamanhoNota();
  abrirModal('modal-nota');
};
document.querySelectorAll('#nota-colors .cp-dot').forEach(dot => {
  const sel = () => { document.querySelectorAll('#nota-colors .cp-dot').forEach(d => d.classList.remove('active')); dot.classList.add('active'); corNota = dot.dataset.color; };
  dot.onclick = sel; dot.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel(); } });
});
const LIMITE_NOTA = 900 * 1024; // Firestore aceita no máximo ~1 MB por documento
function atualizarTamanhoNota() {
  const kb = Math.round(new Blob([$('nota-conteudo').innerHTML]).size / 1024);
  $('nota-size-hint').textContent = kb > 50 ? `${kb} KB de ${Math.round(LIMITE_NOTA / 1024)} KB` : '';
  $('nota-size-hint').style.color = kb * 1024 > LIMITE_NOTA ? 'var(--danger)' : 'var(--muted)';
}
$('nota-conteudo').addEventListener('input', atualizarTamanhoNota);
/* Checklist: ☐ / ☑ — clicar no símbolo alterna */
window.inserirChecklist = () => { $('nota-conteudo').focus(); document.execCommand('insertHTML', false, '<div>☐&nbsp;</div>'); };
$('nota-conteudo').addEventListener('click', e => {
  const el = e.target.closest('div,li'); if (!el || el.id === 'nota-conteudo') return;
  const t = el.firstChild; if (!t || t.nodeType !== 3) return;
  const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 1); const b = r.getBoundingClientRect();
  if (e.clientX <= b.right + 2 && (t.data[0] === '☐' || t.data[0] === '☑')) { t.data = (t.data[0] === '☐' ? '☑' : '☐') + t.data.slice(1); atualizarTamanhoNota(); }
});
function comprimirImagem(src, max = 1000, q = .72) {
  return new Promise(res => { const i = new Image(); i.onload = () => { const s = Math.min(1, max / Math.max(i.width, i.height)); const c = document.createElement('canvas'); c.width = Math.round(i.width * s); c.height = Math.round(i.height * s); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(i, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', q)); }; i.onerror = () => res(null); i.src = src; });
}
window.inserirImagem = e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const r = new FileReader();
  r.onload = async ev => { const data = await comprimirImagem(ev.target.result); if (!data) return toast('Imagem inválida', 'error'); $('nota-conteudo').focus(); document.execCommand('insertImage', false, data); atualizarTamanhoNota(); };
  r.readAsDataURL(f);
};
$('btn-copiar-nota').onclick = async () => {
  const texto = [clean($('nota-titulo').value), $('nota-conteudo').innerText.trim()].filter(Boolean).join('\n\n');
  try { await navigator.clipboard.writeText(texto); toast('📋 Copiado'); } catch { toast('Não foi possível copiar', 'error'); }
};
$('btn-apagar-nota').onclick = async () => { if (!notaEmEdicao) return; const id = notaEmEdicao.id; fecharModal('modal-nota'); await apagarItem(id, 'notas'); };

$('btn-guardar-nota').onclick = async () => {
  const titulo = clean($('nota-titulo').value) || 'Sem título';
  const conteudo = purify($('nota-conteudo').innerHTML, { ADD_ATTR: ['style'] });
  const tags = extrairTags($('nota-tags-input').value + ' ' + titulo);
  if (new Blob([conteudo]).size > LIMITE_NOTA) return toast('Nota demasiado grande (imagens). Remove ou reduz imagens.', 'error');
  let p;
  if (notaPrivada) {
    if (!cofreKey) return pedirPIN(() => $('btn-guardar-nota').click());
    const enc = await encriptar(cofreKey, { titulo, conteudo, tags });
    p = { titulo: '', conteudo: '', tags: [], enc, cor: corNota, privada: true, uid, ts: Date.now() };
  } else p = { titulo, conteudo, tags, cor: corNota, privada: false, enc: null, uid, ts: Date.now() };
  try {
    if (notaEmEdicao) await S.update('notas', notaEmEdicao.id, p); else await S.add('notas', p);
    fecharModal('modal-nota'); toast(notaPrivada ? '🔒 Nota privada guardada (encriptada)' : 'Nota guardada');
  } catch (e) { erroGuardar(e); }
};
window.mudarTabNota = (tab, btn) => {
  tabNotaAtiva = tab;
  document.querySelectorAll('.note-tab').forEach(b => b.classList.toggle('active', b === btn));
  $('notas-normais-panel').style.display = tab === 'normais' ? 'block' : 'none';
  $('notas-privadas-panel').style.display = tab === 'privadas' ? 'block' : 'none';
  $('notas-academicas-panel').style.display = tab === 'academicas' ? 'block' : 'none';
  atualizarFAB(viewAtual); renderizarApp();
};
$('search-notas').addEventListener('input', () => renderNotas());

/* ── Cofre: PBKDF2 (200 000 iterações) + AES-GCM 256 ── */
const te = new TextEncoder(), td = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function derivarChave(pin, saltB64) {
  const base = await crypto.subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(saltB64), iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encriptar(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}
async function desencriptar(key, enc) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(enc.iv) }, key, unb64(enc.ct));
  return JSON.parse(td.decode(pt));
}
let cofreKey = null; const cofreCache = new Map(); let cofreTimer = null;
const PIN_LEGACY = () => `pin_${uid}`;
let pinBuffer = '', pinFase = 'unlock', pinPrimeiro = '', pinResolve = null;
function pedirPIN(cb) {
  if (!crypto?.subtle) return toast('O cofre precisa de HTTPS para funcionar.', 'error');
  pinResolve = cb;
  const temCofre = D.cofre.length > 0, temLegacy = !!localStorage.getItem(PIN_LEGACY());
  pinFase = temCofre || temLegacy ? 'unlock' : 'create1';
  $('pin-subtitle').textContent = pinFase === 'unlock' ? 'Introduz o teu PIN de 4 dígitos' : 'Cria um PIN de 4 dígitos';
  $('pin-error').style.display = 'none'; pinBuffer = ''; renderPinDots(); abrirModal('modal-pin');
}
function renderPinDots() { for (let i = 0; i < 4; i++) $(`pd${i}`).classList.toggle('filled', i < pinBuffer.length); }
function pinErro(msg) { const e = $('pin-error'); e.textContent = msg; e.style.display = 'block'; e.style.animation = 'none'; void e.offsetWidth; e.style.animation = ''; pinBuffer = ''; renderPinDots(); }
function pinTecla(n) {
  if (!$('modal-pin').classList.contains('open')) return;
  if (n === 'del') pinBuffer = pinBuffer.slice(0, -1);
  else if (n === 'ok') { if (pinBuffer.length === 4) confirmarPIN(); }
  else if (pinBuffer.length < 4) pinBuffer += n;
  renderPinDots();
  if (pinBuffer.length === 4 && n !== 'ok') setTimeout(confirmarPIN, 120);
}
document.querySelectorAll('.pin-key').forEach(k => k.onclick = () => pinTecla(k.dataset.n));
document.addEventListener('keydown', e => { if (!$('modal-pin').classList.contains('open')) return; if (/^\d$/.test(e.key)) pinTecla(e.key); else if (e.key === 'Backspace') pinTecla('del'); else if (e.key === 'Enter') pinTecla('ok'); });
let pinOcupado = false;
async function confirmarPIN() {
  if (pinOcupado || pinBuffer.length !== 4) return; pinOcupado = true;
  const pin = pinBuffer;
  try {
    if (pinFase === 'create1') { pinPrimeiro = pin; pinFase = 'create2'; pinBuffer = ''; renderPinDots(); $('pin-subtitle').textContent = 'Confirma o PIN'; return; }
    if (pinFase === 'create2') {
      if (pin !== pinPrimeiro) { pinFase = 'create1'; $('pin-subtitle').textContent = 'Cria um PIN de 4 dígitos'; return pinErro('Os PINs não coincidem. Tenta de novo.'); }
      await criarCofre(pin); return desbloqueado();
    }
    // unlock
    if (D.cofre.length) {
      const c = D.cofre[0]; const key = await derivarChave(pin, c.salt);
      try { const chk = await desencriptar(key, c.check); if (chk !== 'foco-ok') throw 0; } catch { return pinErro('PIN incorreto. Tenta de novo.'); }
      cofreKey = key; return desbloqueado();
    }
    const legacy = localStorage.getItem(PIN_LEGACY());
    if (legacy && pin === legacy) { await criarCofre(pin); localStorage.removeItem(PIN_LEGACY()); return desbloqueado(); }
    pinErro('PIN incorreto. Tenta de novo.');
  } finally { pinOcupado = false; }
}
async function criarCofre(pin) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  cofreKey = await derivarChave(pin, salt);
  const check = await encriptar(cofreKey, 'foco-ok');
  await S.add('cofre', { salt, check, uid, ts: Date.now() });
}
async function desbloqueado() {
  fecharModal('modal-pin');
  await desencriptarNotas();
  // migra notas privadas antigas (v1 guardava em texto simples) para encriptadas
  const antigas = D.notas.filter(n => n.privada && !n.enc);
  for (const n of antigas) { const enc = await encriptar(cofreKey, { titulo: plain(n.titulo), conteudo: n.conteudo || '', tags: n.tags || [] }); await S.update('notas', n.id, { enc, titulo: '', conteudo: '', tags: [] }); }
  if (antigas.length) toast(`🔐 ${plural(antigas.length, 'nota antiga encriptada', 'notas antigas encriptadas')}`);
  else toast('Cofre desbloqueado 🔓');
  agendarTrancar(); renderCofreUI(); renderNotas();
  if (pinResolve) { const f = pinResolve; pinResolve = null; f(); }
}
async function desencriptarNotas() {
  if (!cofreKey) return;
  for (const n of D.notas.filter(n => n.privada && n.enc)) {
    if (cofreCache.has(n.id) && cofreCache.get(n.id)._ct === n.enc.ct) continue;
    try { const v = await desencriptar(cofreKey, n.enc); cofreCache.set(n.id, { ...v, _ct: n.enc.ct }); } catch { cofreCache.delete(n.id); }
  }
}
function trancarCofre(msg = true) { cofreKey = null; cofreCache.clear(); clearTimeout(cofreTimer); renderCofreUI(); renderNotas(); if (msg) toast('Cofre trancado 🔒'); }
function agendarTrancar() { clearTimeout(cofreTimer); cofreTimer = setTimeout(() => trancarCofre(false), 5 * 60e3); }
document.addEventListener('visibilitychange', () => { if (document.hidden && cofreKey) { clearTimeout(cofreTimer); cofreTimer = setTimeout(() => trancarCofre(false), 60e3); } else if (cofreKey) agendarTrancar(); });
function renderCofreUI() {
  $('cofre-status').textContent = cofreKey ? 'Desbloqueado 🔓 (tranca sozinho após 5 min)' : 'Bloqueado: precisas do PIN';
  $('cofre-content').style.display = cofreKey ? 'block' : 'none';
  $('btn-abrir-cofre').style.display = cofreKey ? 'none' : '';
  $('btn-trancar-cofre').style.display = cofreKey ? '' : 'none';
}
$('btn-abrir-cofre').onclick = () => cofreKey ? renderCofreUI() : pedirPIN(null);
$('btn-trancar-cofre').onclick = () => trancarCofre();
$('btn-mudar-pin').onclick = async () => {
  const n = D.notas.filter(x => x.privada).length;
  if (!await pedirConfirmacao(`Vai apagar o PIN e ${plural(n, 'nota privada', 'notas privadas')}. Não dá para desfazer.`, 'Repor cofre?', 'Repor')) return;
  await Promise.all([...D.notas.filter(x => x.privada).map(x => S.remove('notas', x.id)), ...D.cofre.map(c => S.remove('cofre', c.id))]);
  localStorage.removeItem(PIN_LEGACY()); trancarCofre(false); fecharModal('modal-settings'); toast('Cofre reposto');
};

/* ═════════════ AVALIAÇÕES (escala 0–20) ═════════════ */
$('btn-salvar-nota-academica').onclick = async () => {
  const disciplina = clean($('na-disciplina').value), tipo = $('na-tipo').value;
  const nota = parseFloat(String($('na-nota-val').value).replace(',', '.'));
  const peso = parseFloat($('na-peso').value) || 0, ects = parseFloat($('na-ects').value) || null;
  if (!disciplina || isNaN(nota) || nota < 0 || nota > 20) return toast('Indica a disciplina e uma nota entre 0 e 20.', 'error');
  if (peso < 0 || peso > 100) return toast('O peso tem de estar entre 0 e 100%.', 'error');
  const jaPeso = D.notas_academicas.filter(n => n.disciplina.toLowerCase() === disciplina.toLowerCase()).reduce((a, n) => a + (n.peso || 0), 0);
  if (jaPeso + peso > 100) toast(`Atenção: os pesos de ${disciplina} somam ${jaPeso + peso}%.`, 'warn');
  try {
    await S.add('notas_academicas', { disciplina, tipo, nota, peso, ects, data: $('na-data-val').value || getHoje(), obs: clean($('na-obs').value), uid, ts: Date.now() });
    fecharModal('modal-add-nota-academica'); ['na-disciplina', 'na-obs', 'na-nota-val', 'na-peso', 'na-ects'].forEach(i => $(i).value = '');
    toast('Avaliação registada 🎓');
  } catch (e) { erroGuardar(e); }
};
const discAbertas = new Set();

/* ═════════════ HORÁRIO ═════════════ */
const DIA_CORES_KEY = () => `dia_cores_${uid}`;
let diaCores = {};
function carregarDiaCores() { try { diaCores = JSON.parse(localStorage.getItem(DIA_CORES_KEY()) || '{}'); } catch { diaCores = {}; } }
window.setDiaCor = (dia, cor) => { diaCores[dia] = cor; try { localStorage.setItem(DIA_CORES_KEY(), JSON.stringify(diaCores)); } catch {} renderHorario(); };
let aulaEmEdicao = null;
function abrirModalAula(dia, hora) {
  const a = D.horario.find(x => x.dia === dia && x.hora === hora);
  aulaEmEdicao = { dia, hora, id: a?.id || null };
  $('modal-aula-title').textContent = `✏️ ${dia} · ${hora}`;
  $('aula-nome').value = a ? plain(a.materia) : '';
  $('aula-sala').value = a ? plain(a.sala || '') : '';
  $('aula-cor').value = a?.cor || ultimaCorAula($('aula-nome').value) || '#2563eb';
  $('btn-apagar-aula').style.display = a ? '' : 'none';
  // sugestões de disciplinas já existentes
  let dl = $('aula-dl'); if (!dl) { dl = document.createElement('datalist'); dl.id = 'aula-dl'; document.body.appendChild(dl); $('aula-nome').setAttribute('list', 'aula-dl'); }
  dl.innerHTML = [...new Set(D.horario.map(x => plain(x.materia)))].map(m => `<option value="${esc(m)}">`).join('');
  abrirModal('modal-aula');
}
const ultimaCorAula = nome => D.horario.find(x => plain(x.materia).toLowerCase() === nome.toLowerCase())?.cor;
$('aula-nome').addEventListener('change', () => { const c = ultimaCorAula($('aula-nome').value); if (c) $('aula-cor').value = c; });
$('btn-salvar-aula').onclick = async () => {
  if (!aulaEmEdicao) return;
  const nome = clean($('aula-nome').value), sala = clean($('aula-sala').value), cor = $('aula-cor').value;
  if (!nome) return toast('Indica o nome da disciplina.', 'error');
  const { dia, hora, id } = aulaEmEdicao;
  try {
    if (id) await S.update('horario', id, { materia: nome, sala, cor });
    else await S.add('horario', { dia, hora, materia: nome, sala, cor, uid });
    fecharModal('modal-aula'); toast('Aula guardada');
  } catch (e) { erroGuardar(e); }
};
$('btn-apagar-aula').onclick = async () => { const id = aulaEmEdicao?.id; fecharModal('modal-aula'); if (id) await apagarItem(id, 'horario'); };

/* ═════════════ FINANÇAS ═════════════ */
const FIN_ICONS = {
  alimentacao: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
  transportes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  casa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/></svg>`,
  educacao: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></svg>`,
  lazer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  saude: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  rendimentos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`,
  outros: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
};
const CAT_COR = { alimentacao: '#d97706', transportes: '#2563eb', casa: '#0891b2', educacao: '#4338ca', lazer: '#7c3aed', saude: '#059669', rendimentos: '#059669', outros: '#64748b' };
const CAT_NOMES = { alimentacao: 'Alimentação', transportes: 'Transportes', casa: 'Casa & Renda', educacao: 'Educação', lazer: 'Lazer', saude: 'Saúde', rendimentos: 'Rendimentos', outros: 'Outros' };
const finIcon = (cat, size = 36) => { const c = CAT_COR[cat] || CAT_COR.outros; return `<div class="fin-cat-icon" style="background:${c}1f;color:${c};width:${size}px;height:${size}px;" aria-hidden="true">${FIN_ICONS[cat] || FIN_ICONS.outros}</div>`; };
const mesMov = f => f.data ? mesDe(f.data) : mesDe(f.ts);

$('fin-categoria').addEventListener('change', () => { if ($('fin-categoria').value === 'rendimentos') $('fin-tipo').value = 'entrada'; });
$('fin-tipo').addEventListener('change', () => { if ($('fin-tipo').value === 'entrada') $('fin-categoria').value = 'rendimentos'; else if ($('fin-categoria').value === 'rendimentos') $('fin-categoria').value = 'alimentacao'; });
$('btn-guardar-financa').onclick = async () => {
  const v = parseFloat(String($('fin-valor').value).replace(',', '.'));
  const d = clean($('fin-descricao').value) || CAT_NOMES[$('fin-categoria').value];
  const c = $('fin-categoria').value, rec = $('fin-recorrencia').value;
  const tipo = c === 'rendimentos' ? 'entrada' : $('fin-tipo').value;
  if (!v || isNaN(v) || v <= 0) { toast('Indica um valor válido.', 'error'); return $('fin-valor').focus(); }
  try {
    await S.add('financas', { descricao: d, valor: Math.round(v * 100) / 100, categoria: c, tipo, data: getHoje(), uid, ts: Date.now(), recorrencia: rec || null });
    $('fin-valor').value = ''; $('fin-descricao').value = ''; $('fin-recorrencia').value = '';
    toast(`${tipo === 'entrada' ? '+' : '−'}${fmtMoney(v)} registado`);
  } catch (e) { erroGuardar(e); }
};
/* Recorrentes: na v1 cada mês copiava também as cópias (crescimento exponencial) e corria antes de os dados chegarem */
let recorrentesFeitos = false;
async function registarRecorrentes() {
  if (recorrentesFeitos || !loaded.has('financas')) return; recorrentesFeitos = true;
  const mes = mesAtual();
  try { if (localStorage.getItem(`recorrentes_${uid}_${mes}`)) return; } catch {}
  const originais = D.financas.filter(f => f.recorrencia === 'mensal' && !f.autoGerado && mesMov(f) < mes);
  const emFalta = originais.filter(o => !D.financas.some(f => f.origemId === o.id && mesMov(f) === mes));
  for (const o of emFalta) {
    await S.add('financas', { descricao: o.descricao, valor: o.valor, categoria: o.categoria, tipo: o.tipo, data: `${mes}-01`, uid, ts: Date.now(), recorrencia: null, autoGerado: true, origemId: o.id });
  }
  if (emFalta.length) toast(`↻ ${plural(emFalta.length, 'movimento recorrente registado', 'movimentos recorrentes registados')}`);
}
/* Orçamentos — agora guardados na conta (v1: só neste dispositivo) */
$('btn-salvar-budget').onclick = async () => {
  const cat = $('budget-cat').value, val = parseFloat($('budget-val').value);
  if (!val || val <= 0) return toast('Valor inválido', 'error');
  const ex = D.orcamentos.find(b => b.cat === cat);
  try { ex ? await S.update('orcamentos', ex.id, { limite: val }) : await S.add('orcamentos', { cat, limite: val, uid, ts: Date.now() }); fecharModal('modal-add-budget'); $('budget-val').value = ''; toast('Orçamento definido'); }
  catch (e) { erroGuardar(e); }
};
function migrarBudgetsLocais() {
  try {
    const k = `budgets_${uid}`; const s = localStorage.getItem(k); if (!s) return;
    const b = JSON.parse(s); localStorage.removeItem(k);
    Object.entries(b).forEach(([cat, limite]) => { if (!D.orcamentos.some(x => x.cat === cat)) S.add('orcamentos', { cat, limite, uid, ts: Date.now() }); });
  } catch {}
}
/* Subscrições */
$('btn-salvar-subscricao').onclick = async () => {
  const nome = clean($('sub-nome').value), emoji = clean($('sub-emoji').value) || '🔄';
  const valor = parseFloat($('sub-valor').value), dia = Math.min(31, Math.max(1, parseInt($('sub-dia').value) || 1));
  if (!nome || !valor || valor <= 0) return toast('Indica o nome e o valor.', 'error');
  try {
    await S.add('subscricoes', { nome, emoji, valor, dia, periodicidade: $('sub-periodicidade').value, categoria: $('sub-categoria').value, uid, ts: Date.now() });
    fecharModal('modal-add-subscricao'); ['sub-nome', 'sub-emoji', 'sub-valor', 'sub-dia'].forEach(i => $(i).value = ''); toast('Subscrição adicionada');
  } catch (e) { erroGuardar(e); }
};
function proximaCobranca(s) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const diaEm = (y, m) => new Date(y, m, Math.min(s.dia || 1, new Date(y, m + 1, 0).getDate()));
  let d = diaEm(hoje.getFullYear(), hoje.getMonth());
  if (d < hoje) d = diaEm(hoje.getFullYear(), hoje.getMonth() + 1);
  return Math.round((d - hoje) / 864e5);
}
/* Mealheiros */
$('btn-salvar-mealheiro').onclick = async () => {
  const nome = clean($('mealheiro-nome').value), emoji = clean($('mealheiro-emoji').value) || '🐷';
  const meta = parseFloat($('mealheiro-meta').value), atual = parseFloat($('mealheiro-atual').value) || 0;
  if (!nome || !meta || meta <= 0) return toast('Indica o nome e a meta.', 'error');
  try {
    await S.add('mealheiros', { nome, emoji, meta, atual, data: $('mealheiro-data').value || '', uid, ts: Date.now() });
    fecharModal('modal-add-mealheiro'); ['mealheiro-nome', 'mealheiro-emoji', 'mealheiro-meta', 'mealheiro-data'].forEach(i => $(i).value = ''); $('mealheiro-atual').value = '0';
    toast('Mealheiro criado 🐷');
  } catch (e) { erroGuardar(e); }
};
let mealheiroEmDeposito = null;
function abrirDeposito(id) {
  const m = D.mealheiros.find(x => x.id === id); if (!m) return;
  mealheiroEmDeposito = m;
  $('modal-depositar-title').textContent = `💰 ${plain(m.nome)}`;
  $('modal-depositar-emoji').textContent = plain(m.emoji) || '🐷';
  const pct = Math.min(100, Math.round(m.atual / m.meta * 100));
  $('modal-depositar-info').textContent = `${fmtMoney(m.atual)} de ${fmtMoney(m.meta)} (${pct}%)`;
  $('modal-depositar-bar').style.width = pct + '%';
  $('depositar-valor').value = '';
  abrirModal('modal-depositar-mealheiro');
}
$('btn-confirmar-deposito').onclick = async () => {
  const m = mealheiroEmDeposito; if (!m) return;
  const val = parseFloat($('depositar-valor').value);
  if (!val || val <= 0) return toast('Valor inválido', 'error');
  const novo = Math.min(m.meta, m.atual + val);
  try {
    await S.update('mealheiros', m.id, { atual: novo });
    if (novo >= m.meta) { window.confetti?.({ particleCount: 200, spread: 90 }); toast(`🎉 Meta atingida: ${plain(m.nome)}!`); }
    else toast(`+${fmtMoney(val)} no mealheiro`);
    fecharModal('modal-depositar-mealheiro');
  } catch (e) { erroGuardar(e); }
};
/* IOU */
$('btn-salvar-iou').onclick = async () => {
  const descricao = clean($('iou-descricao').value), valor = parseFloat($('iou-valor').value), pessoa = clean($('iou-pessoa').value);
  if (!descricao || !valor || valor <= 0 || !pessoa) return toast('Preenche descrição, valor e pessoa.', 'error');
  try {
    await S.add('iou', { descricao, valor, tipo: $('iou-tipo').value, pessoa, data: $('iou-data').value || getHoje(), notas: clean($('iou-notas').value), liquidado: false, uid, ts: Date.now() });
    fecharModal('modal-add-iou'); ['iou-descricao', 'iou-valor', 'iou-pessoa', 'iou-notas'].forEach(i => $(i).value = ''); toast('Registado 🤝');
  } catch (e) { erroGuardar(e); }
};
async function liquidarIOU(id) {
  if (!await pedirConfirmacao('Marcar como pago?', 'Liquidar?', 'Liquidar')) return;
  await S.update('iou', id, { liquidado: true }); somDing(); toast('✅ Liquidado');
}
/* Calculadora (v1 dizia que 100× o salário chegava para viver de rendimentos — são precisos ~300×) */
window.calcularFinancas = () => {
  const sal = parseFloat($('calc-salario').value) || 0, el = $('calc-resultados');
  if (sal <= 0) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  const gastosMedios = mediaGastosMensais();
  const rows = [
    { icon: '🧾', label: 'Necessidades (50%)', desc: 'Renda, comida, transportes, contas', val: sal * .5, cor: 'var(--accent)' },
    { icon: '🎉', label: 'Desejos (30%)', desc: 'Lazer, saídas, compras', val: sal * .3, cor: 'var(--purple)' },
    { icon: '📈', label: 'Poupar / investir (20%)', desc: 'Regra 50/30/20', val: sal * .2, cor: 'var(--success)' },
    { icon: '🛡️', label: 'Fundo de emergência', desc: gastosMedios ? `6 meses dos teus gastos médios (${fmtMoney(gastosMedios)}/mês)` : '6 meses de despesas (estimado em 70% do rendimento)', val: (gastosMedios || sal * .7) * 6, cor: 'var(--warn)' },
    { icon: '🏠', label: 'Prestação máxima de crédito', desc: 'Taxa de esforço prudente: ≤ 1/3 do rendimento', val: sal / 3, cor: 'var(--danger)' },
    { icon: '🏦', label: 'Capital para viver de rendimentos', desc: 'Regra dos 4%: rendimento anual ÷ 0,04', val: sal * 12 / 0.04, cor: 'var(--muted)' }
  ];
  el.innerHTML = rows.map(r => `<div style="background:var(--surface2);border-radius:var(--r-md);padding:.75rem 1rem;border-left:3px solid ${r.cor};display:flex;justify-content:space-between;align-items:center;gap:.5rem;">
      <div><div style="font-size:.82rem;font-weight:700;">${r.icon} ${r.label}</div><div style="font-size:.7rem;color:var(--muted);margin-top:2px;">${r.desc}</div></div>
      <div style="font-size:1rem;font-weight:800;font-family:var(--mono);color:${r.cor};flex-shrink:0;">${fmtMoney(r.val)}</div></div>`).join('');
};
function mediaGastosMensais() {
  const porMes = {}; D.financas.filter(f => f.tipo === 'saida').forEach(f => { const m = mesMov(f); porMes[m] = (porMes[m] || 0) + f.valor; });
  const meses = Object.keys(porMes).filter(m => m < mesAtual()); if (!meses.length) return 0;
  return meses.reduce((a, m) => a + porMes[m], 0) / meses.length;
}

/* ═════════════ DESENHO ═════════════ */
const cv = $('draw-canvas'), ctx = cv.getContext('2d'); let drawing = false, last = null;
window.abrirCanvas = () => {
  abrirModal('modal-drawing');
  setTimeout(() => { const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1; cv.width = r.width * dpr; cv.height = Math.max(200, r.height) * dpr; ctx.scale(dpr, dpr); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; }, 80);
};
window.limparCanvas = () => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.restore(); };
const getPos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || .5 }; };
cv.addEventListener('pointerdown', e => { drawing = true; cv.setPointerCapture(e.pointerId); last = getPos(e); });
cv.addEventListener('pointermove', e => {
  if (!drawing) return; e.preventDefault(); const p = getPos(e);
  const base = parseInt($('draw-size').value) || 3;
  ctx.lineWidth = e.pointerType === 'pen' ? base * (0.4 + p.p * 1.2) : base;
  ctx.strokeStyle = $('draw-color').value;
  ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p;
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => cv.addEventListener(ev, () => { drawing = false; }));
$('btn-salvar-desenho').onclick = async () => {
  const d = await comprimirImagem(cv.toDataURL('image/png'), 1000, .8);
  fecharModal('modal-drawing');
  setTimeout(() => { $('nota-conteudo').focus(); document.execCommand('insertImage', false, d); atualizarTamanhoNota(); }, 100);
};

/* ═════════════ POMODORO ═════════════ */
let pomoDurSec = 25 * 60, pausaDurSec = 5 * 60, tR = pomoDurSec, isFoco = true, pomoRun = false, pomoTimer = null, pomoEndTs = null;
let pomoTarefaSelecionada = null;
const TITULO = 'Foco — A tua vida organizada';
const fmtMMSS = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
function updPomo() {
  const txt = fmtMMSS(tR);
  $('timer-display').textContent = txt;
  $('pomo-mode-label').textContent = isFoco ? 'Foco' : 'Pausa';
  $('pomo-label').textContent = isFoco ? 'Sessão de foco' : 'Tempo de descanso';
  const total = isFoco ? pomoDurSec : pausaDurSec, pct = (total - tR) / total * 100;
  $('pomo-ring').style.background = `conic-gradient(${isFoco ? 'var(--accent)' : 'var(--success)'} ${pct}%,var(--surface2) 0%)`;
  $('pomo-header-time').textContent = pomoRun ? ' ' + txt : '';
  $('btn-pomodoro').classList.toggle('running', pomoRun);
  document.title = pomoRun ? `${txt} · ${isFoco ? 'Foco' : 'Pausa'}` : (pomoEstudoRun ? document.title : TITULO);
}
window.setPomo = (f, p) => { clearInterval(pomoTimer); pomoRun = false; pomoEndTs = null; pomoDurSec = f * 60; pausaDurSec = p * 60; isFoco = true; tR = pomoDurSec; $('btn-start-timer').textContent = '▶ Iniciar'; updPomo(); };
window.abrirSelTarefa = () => {
  const hoje = getHoje();
  const tarefas = D.objetivos.filter(o => !o.concluido && (o.data <= hoje || o.prioridade === 'urgente' || o.prioridade === 'alta')).slice(0, 30);
  $('lista-tarefas-pomo').innerHTML = tarefas.length ? tarefas.map(o => `<div class="item-card priority-${o.prioridade || 'media'}" style="cursor:pointer;" data-act="sel-task" data-id="${o.id}" role="button" tabindex="0"><div class="item-body"><div class="item-title">${esc(o.titulo)}</div><div class="item-meta">${fmtDate(o.data)} · ${o.prioridade || 'media'}</div></div></div>`).join('') : '<div class="empty-state">Sem tarefas para hoje.</div>';
  abrirModal('modal-sel-tarefa');
};
window.selecionarTarefaPomo = id => {
  const t = id ? D.objetivos.find(o => o.id === id) : null;
  pomoTarefaSelecionada = t ? { id: t.id, titulo: plain(t.titulo) } : null;
  $('pomo-task-sel').className = 'pomo-task-sel' + (t ? ' has-task' : '');
  $('pomo-task-label').textContent = t ? `🎯 ${plain(t.titulo)}` : 'Selecionar tarefa (opcional)';
  fecharModal('modal-sel-tarefa');
};
function fimPomo() {
  clearInterval(pomoTimer); pomoRun = false; pomoEndTs = null; somDing(); setTimeout(somDing, 450);
  if (isFoco) {
    const mins = Math.round(pomoDurSec / 60);
    ganharXP(5, `Sessão de foco (${mins} min)`, `pomo:${Date.now()}`);
    enviarNotificacao('✅ Foco terminado!', 'Boa! Faz uma pausa.', 'pomo');
    const t = pomoTarefaSelecionada && D.objetivos.find(o => o.id === pomoTarefaSelecionada.id);
    if (t && !t.concluido) {
      $('pomo-done-msg').textContent = `Trabalhaste em "${pomoTarefaSelecionada.titulo}". Já está concluída?`;
      $('btn-pomo-concluir-tarefa').style.display = 'block';
      $('btn-pomo-concluir-tarefa').onclick = () => { toggleConcluir(t.id); fecharModal('modal-pomo-done'); };
    } else { $('pomo-done-msg').textContent = `${mins} minutos de foco. +5 XP! Descansa um pouco.`; $('btn-pomo-concluir-tarefa').style.display = 'none'; }
    fecharModal('modal-pomodoro'); abrirModal('modal-pomo-done');
    tR = pausaDurSec; isFoco = false;
  } else {
    enviarNotificacao('⚡ Pausa terminada!', 'De volta ao trabalho.', 'pomo'); toast('⚡ Pausa terminada!');
    tR = pomoDurSec; isFoco = true;
  }
  $('btn-start-timer').textContent = '▶ Iniciar'; updPomo();
}
$('btn-start-timer').onclick = () => {
  if (pomoRun) { clearInterval(pomoTimer); pomoRun = false; pomoEndTs = null; $('btn-start-timer').textContent = '▶ Retomar'; return updPomo(); }
  pomoEndTs = Date.now() + tR * 1000; pomoRun = true; $('btn-start-timer').textContent = '⏸ Pausar';
  pomoTimer = setInterval(() => { tR = Math.max(0, Math.round((pomoEndTs - Date.now()) / 1000)); if (tR <= 0) fimPomo(); else updPomo(); }, 500);
  updPomo();
};
$('btn-reset-timer').onclick = () => { clearInterval(pomoTimer); pomoRun = false; pomoEndTs = null; isFoco = true; tR = pomoDurSec; $('btn-start-timer').textContent = '▶ Iniciar'; updPomo(); };

/* Pomodoro + flashcards */
let pomoEstudoRun = false, pomoEstudoTimer = null, pomoEstudoEndTs = null, pomoEstudoDur = 25 * 60, pomoEstudoTR = pomoEstudoDur;
updPomo();
let pomoFcIndex = 0, pomoFcFlipped = false, pomoFcDueList = [];
function abrirEscolhaPomo() {
  if (pomoRun) return abrirModal('modal-pomodoro');
  const due = D.flashcards.filter(dueHoje);
  $('pomo-fc-due-label').textContent = due.length ? `${plural(due.length, 'cartão', 'cartões')} para rever hoje` : 'Sem cartões pendentes';
  abrirModal('modal-pomo-escolha');
}
$('btn-pomodoro').onclick = abrirEscolhaPomo;
window.iniciarModoEstudo = () => {
  fecharModal('modal-pomo-escolha');
  if (!D.flashcards.length) { toast('Ainda não tens flashcards.', 'warn'); return irPara('flashcards'); }
  pomoFcDueList = D.flashcards.filter(dueHoje).map(f => f.id);
  if (!pomoFcDueList.length) pomoFcDueList = D.flashcards.map(f => f.id);
  pomoFcIndex = 0; pomoFcFlipped = false; pomoEstudoTR = pomoEstudoDur; pomoEstudoRun = false; pomoEstudoEndTs = null;
  $('btn-pomo-estudo-toggle').textContent = '▶ Iniciar';
  renderPomoFC(); updPomoEstudo(); abrirModal('modal-pomo-estudo');
};
window.fecharModoEstudo = () => { clearInterval(pomoEstudoTimer); pomoEstudoRun = false; pomoEstudoEndTs = null; document.title = TITULO; fecharModal('modal-pomo-estudo'); };
window.resetPomoEstudo = () => { clearInterval(pomoEstudoTimer); pomoEstudoRun = false; pomoEstudoEndTs = null; pomoEstudoTR = pomoEstudoDur; $('btn-pomo-estudo-toggle').textContent = '▶ Iniciar'; updPomoEstudo(); };
function updPomoEstudo() {
  const t = fmtMMSS(pomoEstudoTR);
  $('pomo-estudo-time').textContent = t;
  $('pomo-estudo-mode').innerHTML = pomoEstudoRun ? '<span class="pomo-timer-ring"></span>A correr' : 'Pausado';
  document.title = pomoEstudoRun ? `${t} · Estudo` : TITULO;
}
$('btn-pomo-estudo-toggle').onclick = () => {
  if (pomoEstudoRun) { clearInterval(pomoEstudoTimer); pomoEstudoRun = false; pomoEstudoEndTs = null; $('btn-pomo-estudo-toggle').textContent = '▶ Retomar'; return updPomoEstudo(); }
  pomoEstudoEndTs = Date.now() + pomoEstudoTR * 1000; pomoEstudoRun = true; $('btn-pomo-estudo-toggle').textContent = '⏸ Pausar';
  pomoEstudoTimer = setInterval(() => {
    pomoEstudoTR = Math.max(0, Math.round((pomoEstudoEndTs - Date.now()) / 1000)); updPomoEstudo();
    if (pomoEstudoTR <= 0) {
      clearInterval(pomoEstudoTimer); pomoEstudoRun = false; pomoEstudoEndTs = null; somDing(); setTimeout(somDing, 450);
      ganharXP(5, 'Sessão de estudo (25 min)', `pomo:${Date.now()}`);
      enviarNotificacao('📚 Sessão de estudo terminada!', 'Boa sessão! Descansa um pouco.', 'pomo');
      $('btn-pomo-estudo-toggle').textContent = '▶ Iniciar'; pomoEstudoTR = pomoEstudoDur; updPomoEstudo(); toast('📚 Sessão terminada! +5 XP');
    }
  }, 500);
  updPomoEstudo();
};
function renderPomoFC() {
  const area = $('pomo-fc-area'), counter = $('pomo-fc-counter'), srBtns = $('pomo-sr-btns');
  pomoFcDueList = pomoFcDueList.filter(id => D.flashcards.some(f => f.id === id));
  if (!pomoFcDueList.length) { area.innerHTML = '<div class="empty-state-fancy"><div class="es-icon">🎉</div><div class="es-msg">Todos os cartões revistos!</div></div>'; srBtns.style.display = 'none'; counter.textContent = ''; return; }
  const fc = D.flashcards.find(f => f.id === pomoFcDueList[pomoFcIndex % pomoFcDueList.length]);
  counter.textContent = `Cartão ${(pomoFcIndex % pomoFcDueList.length) + 1} de ${pomoFcDueList.length} · ${plain(fc.categoria || 'Geral')}`;
  srBtns.style.display = pomoFcFlipped ? 'flex' : 'none';
  srBtns.querySelectorAll('button').forEach(b => b.dataset.id = fc.id);
  area.innerHTML = `<div class="pomo-fc-card ${pomoFcFlipped ? 'pomo-fc-back' : 'pomo-fc-front'}" data-act="pomo-fc-flip" role="button" tabindex="0">${esc(pomoFcFlipped ? fc.resposta : fc.pergunta)}<span class="pomo-fc-hint">${pomoFcFlipped ? '' : 'Toca para ver a resposta'}</span></div>`;
}
function avancarPomoFC(dif) {
  if (dif !== 'dificil') pomoFcDueList.splice(pomoFcIndex % pomoFcDueList.length, 1); else pomoFcIndex++;
  pomoFcFlipped = false;
  if (!pomoFcDueList.length) { toast('🎉 Todos revistos! +10 XP bónus'); ganharXP(10, 'Bónus: revisão completa', `fcall:${getHoje()}`); }
  renderPomoFC();
}
window.responderSREstudo = dif => { const id = $('pomo-sr-btns').querySelector('button')?.dataset.id; if (id) responderSR(dif, id, 'estudo'); };

/* ═════════════ CALENDÁRIO & FERIADOS ═════════════ */
const feriadosCache = {};
function getFeriados(ano) {
  if (feriadosCache[ano]) return feriadosCache[ano];
  const f = {};
  const add = (k, nome, cidade = '') => { (f[k] ||= []).push({ nome, cidade }); };
  const dm = (m, d) => `${ano}-${pad(m)}-${pad(d)}`;
  [[1, 1, 'Ano Novo'], [4, 25, 'Dia da Liberdade'], [5, 1, 'Dia do Trabalhador'], [6, 10, 'Dia de Portugal'], [8, 15, 'Assunção de Nossa Senhora'], [10, 5, 'Implantação da República'], [11, 1, 'Todos os Santos'], [12, 1, 'Restauração da Independência'], [12, 8, 'Imaculada Conceição'], [12, 25, 'Natal']].forEach(([m, d, n]) => add(dm(m, d), n));
  // Páscoa (algoritmo de Meeus/Jones/Butcher)
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, g = Math.floor((8 * b + 13) / 25), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = `${ano}-${pad(mes)}-${pad(dia)}`;
  add(addDias(pascoa, -47), 'Carnaval (tolerância)', 'Facultativo');
  add(addDias(pascoa, -2), 'Sexta-Feira Santa'); add(pascoa, 'Páscoa'); add(addDias(pascoa, 60), 'Corpo de Deus');
  [[6, 13, 'Santo António', 'Lisboa'], [6, 24, 'S. João', 'Porto e Braga'], [7, 4, 'Rainha Santa Isabel', 'Coimbra'], [9, 7, 'Dia da Cidade', 'Faro'], [6, 29, 'S. Pedro', 'Évora'], [8, 20, 'Nossa Sra. d\'Agonia', 'Viana do Castelo']].forEach(([mm, dd, n, cid]) => add(dm(mm, dd), n, cid));
  return (feriadosCache[ano] = f);
}
const feriadoNacional = (f, k) => (f[k] || []).some(x => !x.cidade);
function calDayClick(d) {
  window.diaSelecionado = d;
  const fer = getFeriados(+d.slice(0, 4))[d] || [];
  const tarefas = D.objetivos.filter(o => o.data === d), eventos = D.testes.filter(e => e.data === d);
  const dow = parseDia(d).getDay(); const diaHor = DIAS_HOR[(dow + 6) % 7];
  const aulas = D.horario.filter(a => a.dia === diaHor).sort((a, b) => a.hora.localeCompare(b.hora));
  const [ano, mes, dia] = d.split('-');
  $('modal-dia-title').textContent = `📅 ${DIAS_SEMANA[dow]}, ${parseInt(dia)} de ${MESES[parseInt(mes) - 1]} ${ano}`;
  let html = fer.map(f => `<div class="cal-day-event feriado-item"><div class="cal-event-icon">🇵🇹</div><div class="cal-event-body"><div class="cal-event-title">${esc(f.nome)}</div><div class="cal-event-meta">${f.cidade ? 'Municipal / ' + esc(f.cidade) : 'Feriado nacional'}</div></div></div>`).join('');
  html += eventos.map(e => `<div class="cal-day-event evento"><div class="cal-event-icon">📋</div><div class="cal-event-body"><div class="cal-event-title">${esc(e.disciplina)}</div><div class="cal-event-meta">${e.hora || 'Sem hora'}</div></div></div>`).join('');
  html += tarefas.map(t => `<div class="cal-day-event tarefa" style="${t.concluido ? 'opacity:.55' : ''}"><div class="cal-event-icon">${t.concluido ? '✅' : '🎯'}</div><div class="cal-event-body"><div class="cal-event-title">${esc(t.titulo)}</div><div class="cal-event-meta">${t.hora || 'Sem hora'} · ${t.prioridade || 'media'}</div></div></div>`).join('');
  if (aulas.length) html += `<div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;margin:.6rem 0 .3rem;">Aulas</div>` + aulas.map(a => `<div class="cal-day-event" style="border-left-color:${esc(a.cor || '#2563eb')}"><div class="cal-event-icon">🏫</div><div class="cal-event-body"><div class="cal-event-title">${esc(a.materia)}</div><div class="cal-event-meta">${a.hora}${a.sala ? ' · ' + esc(a.sala) : ''}</div></div></div>`).join('');
  $('modal-dia-content').innerHTML = html || '<div class="empty-state">Nada marcado neste dia.</div>';
  abrirModal('modal-dia');
}
$('prev-month').onclick = () => { dataCal.setDate(1); dataCal.setMonth(dataCal.getMonth() - 1); renderAgenda(); };
$('next-month').onclick = () => { dataCal.setDate(1); dataCal.setMonth(dataCal.getMonth() + 1); renderAgenda(); };
window.irParaHoje = () => { dataCal = new Date(); renderAgenda(); };
$('search-input').addEventListener('input', () => renderAgenda());
document.querySelectorAll('#filter-chips .chip').forEach(chip => chip.onclick = () => { document.querySelectorAll('#filter-chips .chip').forEach(c => c.classList.toggle('active', c === chip)); filtroAtivo = chip.dataset.filter; renderAgenda(); });
$('fin-hist-filtro').addEventListener('change', () => renderFinancas());

/* ═════════════ DELEGAÇÃO DE EVENTOS (sem onclick com strings → sem injeção) ═════════════ */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const { act, id, col } = el.dataset;
  switch (act) {
    case 'toggle-task': e.stopPropagation(); return toggleConcluir(id);
    case 'edit-task': return abrirEditarRegisto('tarefa', id);
    case 'edit-event': return abrirEditarRegisto('evento', id);
    case 'del': e.stopPropagation(); return apagarItem(id, col);
    case 'pomo-task': e.stopPropagation(); selecionarTarefaPomo(id); return abrirModal('modal-pomodoro');
    case 'sel-task': return selecionarTarefaPomo(id);
    case 'toggle-hab': return toggleHabito(id);
    case 'open-prog': return abrirModalProgresso(id);
    case 'deposit': return abrirDeposito(id);
    case 'liquidar': return liquidarIOU(id);
    case 'cal-day': return calDayClick(el.dataset.d);
    case 'aula': return abrirModalAula(el.dataset.dia, el.dataset.hora);
    case 'tag': tagFiltroAtivo = el.dataset.tag || null; return renderNotas();
    case 'note-open': return abrirModalNota(id);
    case 'disc-toggle': { const k = el.dataset.disc; discAbertas.has(k) ? discAbertas.delete(k) : discAbertas.add(k); return renderNotasAcademicas(); }
    case 'fc-flip': fcFlipped = !fcFlipped; return renderStudyArea();
    case 'fc-next': fcFlipped = false; fcIndex = (fcIndex + 1) % Math.max(1, fcFila.length); return renderStudyArea();
    case 'fc-prev': fcFlipped = false; fcIndex = (fcIndex - 1 + fcFila.length) % Math.max(1, fcFila.length); return renderStudyArea();
    case 'fc-sr': return responderSR(el.dataset.dif, id, 'lista');
    case 'fc-cat': fcCatAtiva = el.dataset.cat || null; fcIndex = 0; fcFlipped = false; return renderStudyArea();
    case 'pomo-fc-flip': pomoFcFlipped = !pomoFcFlipped; return renderPomoFC();
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest('[data-act][role=checkbox],[data-act][role=button]'); if (!el || el.tagName === 'BUTTON') return;
  e.preventDefault(); el.click();
});
/* Flashcards: atalhos de teclado (espaço vira, 1/2/3 responde) */
document.addEventListener('keydown', e => {
  if (viewAtual !== 'flashcards' || modalStack.length || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.key === ' ' && !e.target.closest('[data-act]')) { e.preventDefault(); fcFlipped = !fcFlipped; renderStudyArea(); }
  if (fcFlipped && ['1', '2', '3'].includes(e.key)) { const id = fcFila[fcIndex]; responderSR({ 1: 'dificil', 2: 'medio', 3: 'facil' }[e.key], id, 'lista'); }
});

/* ═════════════ BUILDERS ═════════════ */
const PRI_LABEL = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };
function buildTask(o) {
  const hoje = getHoje(), atrasada = !o.concluido && o.data && o.data < hoje;
  return `<div class="item-card ${o.concluido ? 'concluido' : ''} priority-${o.prioridade || 'media'}">
  <div class="checkbox" data-act="toggle-task" data-id="${o.id}" role="checkbox" aria-checked="${!!o.concluido}" aria-label="Concluir ${esc(o.titulo)}" tabindex="0"></div>
  <div class="item-body" data-act="edit-task" data-id="${o.id}">
    <div class="item-title">${esc(o.titulo)}${o.recorrencia ? ` <span class="recorrente-badge">${o.recorrencia === 'semanal' ? '↻ Semanal' : '↻ Mensal'}</span>` : ''}</div>
    <div class="item-meta">${o.data === hoje ? 'Hoje' : fmtDate(o.data)}${o.hora ? ' · ' + o.hora : ''}${atrasada ? ' · <span style="color:var(--danger);font-weight:700">Atrasada</span>' : o.prioridade === 'urgente' ? ' · <span style="color:var(--danger);font-weight:700">Urgente</span>' : o.prioridade === 'alta' ? ' · <span style="color:var(--warn);font-weight:700">Alta</span>' : ''}</div>
  </div>
  ${!o.concluido ? `<button class="pomo-task-btn" data-act="pomo-task" data-id="${o.id}" title="Pomodoro nesta tarefa" aria-label="Pomodoro nesta tarefa">⏱</button>` : ''}
  <button class="del-btn" data-act="del" data-col="objetivos" data-id="${o.id}" aria-label="Apagar tarefa">✕</button>
</div>`;
}
function buildEvent(e) {
  const dias = Math.round((parseDia(e.data) - parseDia(getHoje())) / 864e5);
  const quando = dias === 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : dias > 1 ? `Daqui a ${dias} dias` : fmtDate(e.data);
  return `<div class="item-card priority-${e.prioridade || 'media'}" style="${dias < 0 ? 'opacity:.55' : ''}">
  <div style="font-size:1.2rem;" aria-hidden="true">📋</div>
  <div class="item-body" data-act="edit-event" data-id="${e.id}">
    <div class="item-title">${esc(e.disciplina)}</div>
    <div class="item-meta">${quando}${dias > 1 ? ' · ' + fmtDate(e.data) : ''}${e.hora ? ' · ' + e.hora : ''}</div>
  </div>
  <button class="del-btn" data-act="del" data-col="testes" data-id="${e.id}" aria-label="Apagar evento">✕</button>
</div>`;
}
const ordenarTarefas = arr => [...arr].sort((a, b) => (a.concluido - b.concluido) || (a.data || '').localeCompare(b.data || '') || (a.hora || '99').localeCompare(b.hora || '99'));

/* ═════════════ RENDER ═════════════ */
function renderHeaderMetrics() {
  const xp = xpDoMes(), nivel = calcNivel(xp);
  $('dash-xp').textContent = xp;
  $('xp-bar').style.width = (Math.max(0, xp) % 100) + '%';
  $('level-badge').textContent = `Nível ${nivel}`;
  $('xp-next-level').textContent = `${100 - (Math.max(0, xp) % 100)} XP para o nível ${nivel + 1}`;
  let saldo = 0, inMes = 0, outMes = 0; const m = mesAtual();
  D.financas.forEach(f => { const v = Number(f.valor) || 0; if (f.tipo === 'entrada') saldo += v; else saldo -= v; if (mesMov(f) === m) f.tipo === 'entrada' ? inMes += v : outMes += v; });
  $('dash-saldo').textContent = fmtMoney(saldo);
  $('dash-saldo').className = `metric-value ${saldo >= 0 ? 'green' : 'red'}`;
  $('dash-saldo-sub').textContent = D.financas.length ? `Este mês: +${fmtMoney(inMes)} / −${fmtMoney(outMes)}` : 'Regista movimentos em Finanças';
  const c = calcularStreakGlobal(), banner = $('streak-banner');
  if (c >= 2) { banner.style.display = 'flex'; $('streak-num').textContent = c; $('streak-sub').textContent = c >= 30 ? 'Mês perfeito! 🏆' : c >= 7 ? 'Semana perfeita! 🏆' : c >= 3 ? 'Vai a isso!' : 'Continua assim!'; }
  else banner.style.display = 'none';
}
function renderDashboard(hoje) {
  const moodHoje = D.humor.find(m => m.data === hoje);
  const mostrar = !moodHoje || moodEditar;
  $('mood-checkin-card').style.display = mostrar ? 'block' : 'none';
  $('mood-done-card').style.display = mostrar ? 'none' : 'block';
  if (moodHoje) { $('mood-done-text').textContent = `Hoje sentes-te: ${MOOD_EMOJI[moodHoje.mood]} ${MOOD_NOME[moodHoje.mood]}`; document.querySelectorAll('.mood-btn').forEach(b => b.classList.toggle('selected', +b.dataset.mood === moodHoje.mood)); }

  const habCard = $('dash-habitos-card');
  const ativos = D.habitos.filter(h => habitoAtivoPara(h, hoje));
  if (ativos.length) {
    habCard.style.display = 'block';
    const feitos = ativos.filter(h => D.habitos_log.some(l => l.habitoId === h.id && l.data === hoje)).length;
    $('badge-habitos-hoje').textContent = `${feitos}/${ativos.length}`;
    $('lista-habitos-dash').innerHTML = ativos.map(h => { const done = D.habitos_log.some(l => l.habitoId === h.id && l.data === hoje); return `<div class="dash-habit-row"><div class="habit-icon" aria-hidden="true">${esc(h.icon || '✅')}</div><div class="habit-name">${esc(h.nome)}</div><div class="habit-check-sm ${done ? 'done' : ''}" data-act="toggle-hab" data-id="${h.id}" role="checkbox" aria-checked="${done}" aria-label="${esc(h.nome)}" tabindex="0">${done ? '✓' : ''}</div></div>`; }).join('');
  } else habCard.style.display = 'none';

  const urg = [], hj = [];
  D.objetivos.forEach(o => { if (o.concluido) return; if ((o.data && o.data < hoje) || o.prioridade === 'urgente') urg.push(o); else if (o.data === hoje) hj.push(o); });
  $('lista-urgentes').innerHTML = urg.length ? ordenarTarefas(urg).map(buildTask).join('') : '<div class="empty-state">Nenhuma urgência 🎉</div>';
  $('badge-urgentes').textContent = urg.length;
  $('lista-hoje-dash').innerHTML = hj.length ? ordenarTarefas(hj).map(buildTask).join('') : `<div class="empty-state-fancy"><div class="es-icon">🌟</div><div class="es-msg">${D.objetivos.length ? 'Nada pendente para hoje.' : 'Começa por adicionar uma tarefa com o botão <b>+ Adicionar</b>.'}</div></div>`;
  $('badge-hoje').textContent = hj.length;

  const prox = D.testes.filter(e => e.data >= hoje && e.data <= addDias(hoje, 14)).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 4);
  $('dash-proximos-card').style.display = prox.length ? 'block' : 'none';
  $('lista-proximos-dash').innerHTML = prox.map(buildEvent).join('');
}
function renderAgenda() {
  const hoje = getHoje(), search = $('search-input').value.toLowerCase().trim(), fimSemana = addDias(hoje, 7);
  const match = t => !search || plain(t).toLowerCase().includes(search);
  const objArr = D.objetivos.filter(o => {
    if (!match(o.titulo)) return false;
    switch (filtroAtivo) {
      case 'hoje': return o.data === hoje;
      case 'semana': return o.data >= hoje && o.data <= fimSemana;
      case 'pendentes': return !o.concluido;
      case 'concluidas': return o.concluido;
      case 'urgentes': return o.prioridade === 'urgente' && !o.concluido;
      case 'recorrentes': return !!o.recorrencia;
      default: return true;
    }
  });
  $('badge-tarefas').textContent = objArr.filter(o => !o.concluido).length;
  $('lista-objetivos').innerHTML = objArr.length ? ordenarTarefas(objArr).map(buildTask).join('') : '<div class="empty-state">Sem tarefas aqui.</div>';
  const evArr = D.testes.filter(e => match(e.disciplina)).sort((a, b) => (a.data < hoje) - (b.data < hoje) || (a.data || '').localeCompare(b.data || ''));
  $('lista-eventos').innerHTML = evArr.length ? evArr.map(buildEvent).join('') : '<div class="empty-state">Sem eventos. Regista testes e exames para teres contagem decrescente.</div>';
  $('lista-objetivos-prog').innerHTML = D.obj_prog.length ? D.obj_prog.map(o => { const pct = Math.min(100, Math.round(o.progresso / o.meta * 100)); return `<div class="obj-prog-card" data-act="open-prog" data-id="${o.id}" role="button" tabindex="0"><div class="obj-prog-body"><div class="obj-prog-title">${esc(o.titulo)}</div><div class="progress-bar-track"><div class="progress-bar-fill ${pct >= 100 ? 'green' : 'blue'}" style="width:${pct}%"></div></div><div class="obj-prog-meta">${o.progresso} / ${o.meta} ${esc(o.unidade)}</div></div><div class="obj-prog-count">${pct}%</div><button class="del-btn" data-act="del" data-col="obj_prog" data-id="${o.id}" aria-label="Apagar objetivo">✕</button></div>`; }).join('') : '<div class="empty-state">Ex: "Ler 10 capítulos", "Correr 50 km".</div>';

  const m = dataCal.getMonth(), y = dataCal.getFullYear();
  $('mes-ano').textContent = `${MESES[m]} ${y}`;
  const fer = getFeriados(y);
  const cont = {}; [...D.testes, ...D.objetivos.filter(o => !o.concluido)].forEach(x => { if (x.data) cont[x.data] = (cont[x.data] || 0) + 1; });
  let html = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => `<div class="cal-day-name">${d}</div>`).join('');
  const firstDay = (new Date(y, m, 1).getDay() + 6) % 7; // semana começa à segunda
  for (let i = 0; i < firstDay; i++) html += '<div></div>';
  for (let i = 1; i <= new Date(y, m + 1, 0).getDate(); i++) {
    const d = `${y}-${pad(m + 1)}-${pad(i)}`, eF = feriadoNacional(fer, d);
    const cls = ['cal-day', d === hoje && 'today', eF && 'feriado', cont[d] && 'has-event'].filter(Boolean).join(' ');
    const tit = [(fer[d] || []).map(f => f.nome + (f.cidade ? ` (${f.cidade})` : '')).join(', '), cont[d] ? plural(cont[d], 'item', 'itens') : ''].filter(Boolean).join(' · ');
    html += `<div class="${cls}" data-act="cal-day" data-d="${d}" role="button" tabindex="0" title="${esc(tit)}" aria-label="${i} de ${MESES[m]}${tit ? ': ' + esc(tit) : ''}">${i}</div>`;
  }
  $('calendar-days').innerHTML = html;
}
function renderHorario() {
  $('dia-cor-pickers').innerHTML = DIAS_HOR.map(dia => `<label style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:.65rem;color:var(--muted);font-weight:700;">${dia}<input type="color" value="${diaCores[dia] || '#f5f4f0'}" style="width:28px;height:28px;border-radius:6px;padding:1px;" onchange="setDiaCor('${dia}',this.value)"></label>`).join('');
  const legend = {}, hojeDia = DIAS_HOR[(new Date().getDay() + 6) % 7];
  const temFds = D.horario.some(a => a.dia === 'Sáb' || a.dia === 'Dom');
  const dias = temFds ? DIAS_HOR : DIAS_HOR.slice(0, 5);
  // mostrar só o intervalo de horas útil (mais compacto)
  const horasUsadas = D.horario.map(a => a.hora).sort();
  const ini = horasUsadas.length ? Math.min(HORAS_HOR.indexOf('08:00'), Math.max(0, HORAS_HOR.indexOf(horasUsadas[0]))) : HORAS_HOR.indexOf('08:00');
  const fim = horasUsadas.length ? Math.max(HORAS_HOR.indexOf('19:30'), HORAS_HOR.indexOf(horasUsadas[horasUsadas.length - 1])) : HORAS_HOR.indexOf('19:30');
  const horas = HORAS_HOR.slice(Math.max(0, ini), fim + 1);
  let html = `<thead><tr><th style="width:52px;">Hora</th>${dias.map(d => `<th style="${d === hojeDia ? 'color:var(--accent);' : ''}">${d}${d === hojeDia ? ' •' : ''}</th>`).join('')}</tr></thead><tbody>`;
  horas.forEach(h => {
    html += `<tr><td class="hora-label">${h}</td>`;
    dias.forEach(dia => {
      const a = D.horario.find(x => x.dia === dia && x.hora === h);
      if (a) { const cor = a.cor || '#2563eb'; legend[plain(a.materia)] = cor; html += `<td class="horario-cell-aula" style="background:${esc(cor)};" data-act="aula" data-dia="${dia}" data-hora="${h}" role="button" tabindex="0"><div class="aula-nome">${esc(a.materia)}</div>${a.sala ? `<div class="aula-sala">${esc(a.sala)}</div>` : ''}</td>`; }
      else html += `<td class="horario-cell-empty" style="${diaCores[dia] ? `background:${diaCores[dia]}22;` : ''}" data-act="aula" data-dia="${dia}" data-hora="${h}" role="button" tabindex="0" aria-label="Adicionar aula ${dia} ${h}">+</td>`;
    });
    html += '</tr>';
  });
  $('horario-container').innerHTML = html + '</tbody>';
  $('horario-legend').innerHTML = Object.entries(legend).map(([n, c]) => `<div class="legend-item"><div class="legend-dot" style="background:${esc(c)}"></div>${esc(n)}</div>`).join('') + (temFds ? '' : '<div class="legend-item" style="margin-left:auto;">Fim de semana aparece quando tiveres aulas lá.</div>');
}
function chartTheme() { if (window.Chart) Chart.defaults.font.family = "Sora, -apple-system, 'Segoe UI', Roboto, sans-serif"; return { muted: cssVar('--muted') || '#7a7269', border: cssVar('--border') || '#e2ddd6', accent: cssVar('--accent') || '#2563eb', accentBg: cssVar('--accent-bg') || '#eff4ff', font: "Sora, -apple-system, 'Segoe UI', Roboto, sans-serif" }; }
function renderFinancas() {
  const m = mesAtual(), [yy, mm] = m.split('-');
  const label = `${MESES[+mm - 1].toLowerCase()}`;
  $('fin-mes-label').textContent = label; document.querySelectorAll('.fin-mes-label2').forEach(e => e.textContent = label);
  let ganhos = 0, gastos = 0; const porCat = {};
  D.financas.filter(f => mesMov(f) === m).forEach(f => { const v = Number(f.valor) || 0; if (f.tipo === 'entrada') ganhos += v; else { gastos += v; const c = CAT_NOMES[f.categoria] ? f.categoria : 'outros'; porCat[c] = (porCat[c] || 0) + v; } });
  $('dash-ganhos').textContent = fmtMoney(ganhos); $('dash-gastos').textContent = fmtMoney(gastos);

  const canvas = $('finance-chart'), cats = Object.keys(porCat), T = chartTheme();
  $('finance-chart-empty').style.display = cats.length ? 'none' : 'block';
  canvas.parentElement.style.display = cats.length ? 'block' : 'none';
  if (financeChart) { financeChart.destroy(); financeChart = null; }
  if (cats.length && window.Chart) financeChart = new Chart(canvas, { type: 'doughnut', data: { labels: cats.map(c => CAT_NOMES[c]), datasets: [{ data: cats.map(c => +porCat[c].toFixed(2)), backgroundColor: cats.map(c => CAT_COR[c]), borderWidth: 0, borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '66%', plugins: { legend: { position: 'right', labels: { color: T.muted, font: { family: T.font, size: 11 }, padding: 10, boxWidth: 12 } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmtMoney(c.raw)}` } } } } });

  $('lista-budgets').innerHTML = D.orcamentos.length ? D.orcamentos.map(b => {
    const gasto = porCat[b.cat] || 0, pct = Math.round(gasto / b.limite * 100), cor = pct >= 100 ? 'red' : pct >= 80 ? 'orange' : 'green';
    if (pct >= 80) notificarUmaVez(`budget_${b.cat}_${m}_${pct >= 100 ? 100 : 80}`, `⚠ Orçamento de ${CAT_NOMES[b.cat]}`, pct >= 100 ? 'Ultrapassaste o limite deste mês.' : `Já usaste ${pct}% do limite.`);
    return `<div class="budget-row"><div class="budget-header"><div class="budget-label">${finIcon(b.cat, 28)}${CAT_NOMES[b.cat] || esc(b.cat)}</div><div style="display:flex;align-items:center;gap:.4rem;"><div class="budget-vals">${fmtMoney(gasto)} / ${fmtMoney(b.limite)}</div><button class="del-btn" data-act="del" data-col="orcamentos" data-id="${b.id}" aria-label="Remover orçamento">✕</button></div></div><div class="progress-bar-track" style="height:6px;margin-top:.4rem;"><div class="progress-bar-fill ${cor}" style="width:${Math.min(100, pct)}%"></div></div><div style="font-size:.68rem;color:var(--muted);margin-top:.25rem;display:flex;justify-content:space-between;"><span>${gasto <= b.limite ? `Restam ${fmtMoney(b.limite - gasto)}` : `Excedeste ${fmtMoney(gasto - b.limite)}`}</span>${pct >= 80 ? `<span class="budget-alert">${pct >= 100 ? '⚠ Excedido' : '⚠ ' + pct + '% usado'}</span>` : ''}</div></div>`;
  }).join('') : '<div class="empty-state">Define limites por categoria e recebe alertas aos 80%.</div>';

  // Subscrições
  const totalMensal = D.subscricoes.reduce((a, s) => a + (s.periodicidade === 'anual' ? s.valor / 12 : s.periodicidade === 'semanal' ? s.valor * 52 / 12 : s.valor), 0);
  $('custo-fixo-total').style.display = D.subscricoes.length ? 'flex' : 'none';
  $('custo-fixo-val').textContent = fmtMoney(totalMensal);
  const PER = { mensal: 'Mensal', anual: 'Anual', semanal: 'Semanal' }, CATL = { entretenimento: 'Entretenimento', saude: 'Saúde & Ginásio', educacao: 'Educação', tecnologia: 'Tecnologia', outros: 'Outros' };
  $('lista-subscricoes').innerHTML = D.subscricoes.length ? [...D.subscricoes].sort((a, b) => proximaCobranca(a) - proximaCobranca(b)).map(s => {
    const dias = s.periodicidade === 'mensal' ? proximaCobranca(s) : null;
    if (dias !== null && dias <= 2) notificarUmaVez(`sub_${s.id}_${m}`, dias === 0 ? `💸 ${plain(s.nome)} é cobrado hoje` : `🔄 ${plain(s.nome)} cobrado em ${dias} dia(s)`, `Valor: ${fmtMoney(s.valor)}`);
    const alerta = dias === 0 ? '<span class="sub-alerta urgente">💸 Cobrado hoje</span>' : dias !== null && dias <= 3 ? `<span class="sub-alerta">⚠️ Daqui a ${plural(dias, 'dia')}</span>` : '';
    return `<div class="sub-card"><div class="sub-emoji" aria-hidden="true">${esc(s.emoji || '🔄')}</div><div class="sub-info"><div class="sub-nome">${esc(s.nome)}</div><div class="sub-detalhe">${PER[s.periodicidade] || 'Mensal'} · ${CATL[s.categoria] || 'Outros'}${s.dia ? ' · dia ' + s.dia : ''}</div>${alerta}</div><div style="display:flex;align-items:center;gap:.4rem;"><div class="sub-valor">−${fmtMoney(s.valor)}</div><button class="del-btn" data-act="del" data-col="subscricoes" data-id="${s.id}" aria-label="Apagar subscrição">✕</button></div></div>`;
  }).join('') : '<div class="empty-state">Netflix, ginásio, propinas… vê quanto pagas por mês sem dar por isso.</div>';

  // Mealheiros
  const hoje = new Date();
  $('lista-mealheiros').innerHTML = D.mealheiros.length ? D.mealheiros.map(mh => {
    const pct = Math.min(100, Math.round(mh.atual / mh.meta * 100)), concl = mh.atual >= mh.meta;
    let extra = '';
    if (mh.data && !concl) {
      const meses = Math.max(1, Math.ceil((parseDia(mh.data) - hoje) / (864e5 * 30.44)));
      const passou = parseDia(mh.data) < hoje;
      extra = passou ? '<div class="mealheiro-prazo urgente">⌛ Prazo ultrapassado</div>' : `<div class="mealheiro-mensal">💡 ${fmtMoney((mh.meta - mh.atual) / meses)}/mês durante ${plural(meses, 'mês', 'meses')}</div>`;
    }
    return `<div class="mealheiro-card"><div class="mealheiro-header"><div class="mealheiro-emoji" aria-hidden="true">${esc(mh.emoji || '🐷')}</div><div class="mealheiro-info"><div class="mealheiro-nome">${esc(mh.nome)}${concl ? ' ✅' : ''}</div><div class="mealheiro-vals">${fmtMoney(mh.atual)} / <span class="mealheiro-meta-val">${fmtMoney(mh.meta)}</span></div></div><div style="display:flex;gap:.4rem;">${!concl ? `<button class="btn-secondary" style="padding:.4rem .7rem;font-size:.78rem;" data-act="deposit" data-id="${mh.id}">+ Depositar</button>` : ''}<button class="del-btn" data-act="del" data-col="mealheiros" data-id="${mh.id}" aria-label="Apagar mealheiro">✕</button></div></div><div class="progress-bar-track" style="height:8px;"><div class="progress-bar-fill ${pct >= 100 ? 'green' : pct >= 60 ? 'blue' : 'orange'}" style="width:${pct}%"></div></div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:.35rem;gap:.5rem;flex-wrap:wrap;"><div style="font-size:.72rem;color:var(--muted);">${pct}%${mh.data ? ' · até ' + fmtDate(mh.data) : ''}</div>${extra}</div></div>`;
  }).join('') : '<div class="empty-state">Poupa para algo concreto: viagem, portátil, Erasmus…</div>';

  // IOU
  const pend = D.iou.filter(i => !i.liquidado);
  const aRec = pend.filter(i => i.tipo === 'dei').reduce((a, i) => a + i.valor, 0), aPag = pend.filter(i => i.tipo === 'recebi').reduce((a, i) => a + i.valor, 0);
  $('iou-resumo').style.display = pend.length ? 'block' : 'none';
  $('iou-resumo').innerHTML = (aRec ? `<div class="iou-resumo-row positivo"><span class="iou-resumo-label">💚 A receber</span><span class="iou-resumo-val">+${fmtMoney(aRec)}</span></div>` : '') + (aPag ? `<div class="iou-resumo-row negativo"><span class="iou-resumo-label">❤️ A pagar</span><span class="iou-resumo-val">−${fmtMoney(aPag)}</span></div>` : '');
  $('lista-iou').innerHTML = D.iou.length ? [...D.iou].sort((a, b) => (a.liquidado - b.liquidado) || b.ts - a.ts).map(i => {
    const rec = i.tipo === 'dei', cls = i.liquidado ? 'liquidado' : rec ? 'a-receber' : 'a-pagar';
    return `<div class="iou-card ${cls}"><div style="font-size:1.3rem;" aria-hidden="true">${rec ? '💚' : '❤️'}</div><div class="iou-info"><div class="iou-desc">${esc(i.descricao)}</div><div class="iou-detalhe">${rec ? `${esc(i.pessoa)} deve-te` : `Deves a ${esc(i.pessoa)}`} · ${fmtDate(i.data)}${i.notas ? ' · ' + esc(i.notas) : ''}</div></div><div style="display:flex;flex-direction:column;align-items:flex-end;gap:.35rem;"><div class="iou-valor ${i.liquidado ? '' : cls}">${rec ? '+' : '−'}${fmtMoney(i.valor)}</div><div style="display:flex;gap:.3rem;">${!i.liquidado ? `<button class="liquidar-btn" data-act="liquidar" data-id="${i.id}">✓ Pago</button>` : ''}<button class="del-btn" data-act="del" data-col="iou" data-id="${i.id}" aria-label="Apagar">✕</button></div></div></div>`;
  }).join('') : '<div class="empty-state">Sem dívidas. Tudo limpo! 🎉</div>';

  // Histórico
  const todos = $('fin-hist-filtro').value === 'tudo';
  const hist = [...D.financas].filter(f => todos || mesMov(f) === m).sort((a, b) => (b.data || mesDe(b.ts)).localeCompare(a.data || mesDe(a.ts)) || b.ts - a.ts).slice(0, todos ? 300 : 200);
  $('lista-financas').innerHTML = hist.length ? hist.map(f => { const cat = CAT_NOMES[f.categoria] ? f.categoria : 'outros'; return `<div class="fin-item">${finIcon(cat)}<div class="fin-body"><div class="fin-desc">${esc(f.descricao)}${f.recorrencia === 'mensal' && !f.autoGerado ? ' <span class="recorrente-badge">↻ mensal</span>' : f.autoGerado ? ' <span class="recorrente-badge">auto</span>' : ''}</div><div class="fin-cat" style="color:${CAT_COR[cat]};">${CAT_NOMES[cat]} · <span style="color:var(--muted);font-weight:500;">${fmtDate(f.data) || new Date(f.ts).toLocaleDateString('pt-PT')}</span></div></div><div class="fin-amount ${f.tipo}">${f.tipo === 'entrada' ? '+' : '−'}${fmtMoney(f.valor)}</div><button class="del-btn" data-act="del" data-col="financas" data-id="${f.id}" aria-label="Apagar movimento">✕</button></div>`; }).join('') : '<div class="empty-state">Sem movimentos neste período.</div>';
}
function renderHabitos(hoje) {
  const FREQ = { diario: 'Diário', semana3: '3×/sem', finsemana: 'Fim de semana', semanal: 'Semanal' };
  $('lista-habitos').innerHTML = D.habitos.length ? D.habitos.map(h => {
    const done = D.habitos_log.some(l => l.habitoId === h.id && l.data === hoje), ativo = habitoAtivoPara(h, hoje), st = streakHabito(h);
    const total = D.habitos_log.filter(l => l.habitoId === h.id).length;
    return `<div class="habit-row" style="${!ativo ? 'opacity:.55' : ''}"><div class="habit-icon" aria-hidden="true">${esc(h.icon || '✅')}</div><div class="habit-info"><div class="habit-name">${esc(h.nome)}<span class="habit-freq-badge">${FREQ[h.freq] || 'Diário'}</span></div><div class="habit-streak">${st > 0 ? `🔥 ${plural(st, 'seguido', 'seguidos')} · ` : ''}${plural(total, 'check-in')}${!ativo ? ' · hoje não se aplica' : ''}</div></div>${ativo ? `<div class="habit-check ${done ? 'done' : ''}" data-act="toggle-hab" data-id="${h.id}" role="checkbox" aria-checked="${done}" aria-label="${esc(h.nome)}" tabindex="0">${done ? '✓' : ''}</div>` : '<div class="habit-check" style="opacity:.4;cursor:default;" aria-hidden="true">–</div>'}<button class="habit-del" data-act="del" data-col="habitos" data-id="${h.id}" aria-label="Apagar hábito">✕</button></div>`;
  }).join('') : '<div class="empty-state-fancy"><div class="es-icon">🌱</div><div class="es-msg">Cria um hábito pequeno: "beber água", "ler 10 páginas"…</div></div>';
  if (!window.Chart) return;
  const T = chartTheme(), labels = [], data = [], ml = [], md = [];
  for (let i = 6; i >= 0; i--) { const s = addDias(hoje, -i), dw = DIAS_SEMANA[parseDia(s).getDay()]; labels.push(dw); data.push(D.habitos_log.filter(l => l.data === s).length); ml.push(dw); md.push(D.humor.find(x => x.data === s)?.mood ?? null); }
  statsChart?.destroy(); moodChart?.destroy();
  const scales = (y) => ({ y: { ...y, ticks: { ...(y.ticks || {}), color: T.muted }, grid: { color: T.border } }, x: { ticks: { color: T.muted }, grid: { display: false } } });
  statsChart = new Chart($('stats-chart'), { type: 'bar', data: { labels, datasets: [{ data, backgroundColor: T.accent, borderRadius: 6, maxBarThickness: 32 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: scales({ beginAtZero: true, ticks: { stepSize: 1, precision: 0 } }) } });
  moodChart = new Chart($('mood-chart'), { type: 'line', data: { labels: ml, datasets: [{ data: md, borderColor: T.accent, backgroundColor: T.accentBg, fill: true, borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: T.accent, tension: .3, spanGaps: true }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${MOOD_EMOJI[c.raw]} ${MOOD_NOME[c.raw]}` } } }, scales: scales({ min: 1, max: 5, ticks: { stepSize: 1, callback: v => MOOD_EMOJI[v] || '' } }) } });
}
function noteCard(n, priv) {
  const v = priv && n.enc ? cofreCache.get(n.id) : n;
  if (!v) return `<div class="note-card locked-card" style="background:${esc(n.cor || '#fff')}"><div class="note-title">🔒 Ilegível</div><div class="note-preview">Não foi possível desencriptar.</div><button class="note-del" data-act="del" data-col="notas" data-id="${n.id}" aria-label="Apagar nota">✕</button></div>`;
  const txt = purify(v.conteudo || '', { ALLOWED_TAGS: [] }).replace(/\s+/g, ' ').slice(0, 220);
  const temImg = /<img/i.test(v.conteudo || '');
  const tags = (v.tags || []).length ? `<div class="note-tags">${v.tags.slice(0, 3).map(t => `<span class="note-tag">${esc(t)}</span>`).join('')}</div>` : '';
  return `<div class="note-card ${priv ? 'locked-card' : ''}" style="background:${esc(n.cor || '#ffffff')};border:1px solid rgba(0,0,0,.08);" data-act="note-open" data-id="${n.id}" role="button" tabindex="0"><div class="note-title">${esc(v.titulo) || 'Sem título'}</div><div class="note-preview">${temImg ? '🖼 ' : ''}${txt}</div>${tags}${priv ? '<span class="note-locked" aria-hidden="true">🔒</span>' : ''}<button class="note-del" data-act="del" data-col="notas" data-id="${n.id}" aria-label="Apagar nota">✕</button></div>`;
}
function renderNotas() {
  const search = $('search-notas').value.toLowerCase().trim();
  const normais = D.notas.filter(n => !n.privada);
  const todasTags = [...new Set(normais.flatMap(n => n.tags || []))].sort();
  if (tagFiltroAtivo && !todasTags.includes(tagFiltroAtivo)) tagFiltroAtivo = null;
  $('tag-filter-bar').innerHTML = todasTags.length ? todasTags.map(t => `<button class="tag-chip ${tagFiltroAtivo === t ? 'active' : ''}" data-act="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('') + (tagFiltroAtivo ? '<button class="tag-chip" data-act="tag" data-tag="">✕ Limpar</button>' : '') : '';
  const filt = normais.filter(n => (!search || plain(n.titulo).toLowerCase().includes(search) || purify(n.conteudo || '', { ALLOWED_TAGS: [] }).toLowerCase().includes(search)) && (!tagFiltroAtivo || (n.tags || []).includes(tagFiltroAtivo)));
  $('lista-notas').innerHTML = filt.length ? filt.map(n => noteCard(n, false)).join('') : `<div class="empty-state" style="grid-column:1/-1;">${normais.length ? 'Nenhuma nota encontrada.' : 'Sem notas. Usa #tags no texto para organizar.'}</div>`;
  if (!cofreKey) { $('lista-notas-privadas').innerHTML = ''; return; }
  const priv = D.notas.filter(n => n.privada);
  $('lista-notas-privadas').innerHTML = priv.length ? priv.map(n => noteCard(n, true)).join('') : '<div class="empty-state" style="grid-column:1/-1;">Sem notas privadas.</div>';
}
function renderNotasAcademicas() {
  const el = $('lista-disciplinas');
  $('na-disc-list').innerHTML = [...new Set(D.notas_academicas.map(n => plain(n.disciplina)))].map(d => `<option value="${esc(d)}">`).join('');
  if (!D.notas_academicas.length) { el.innerHTML = '<div class="empty-state-fancy"><div class="es-icon">🎓</div><div class="es-msg">Regista testes e trabalhos com o peso de cada um.<br>O Foco calcula a média e diz-te quanto precisas no resto.</div></div>'; $('na-media-card').style.display = 'none'; return; }
  const grupos = {};
  D.notas_academicas.forEach(n => { const k = plain(n.disciplina).trim(); (grupos[k] ||= []).push(n); });
  const resumo = Object.entries(grupos).map(([disc, notas]) => {
    const cp = notas.filter(n => n.peso > 0), totalP = cp.reduce((a, n) => a + n.peso, 0), somaP = cp.reduce((a, n) => a + n.nota * n.peso, 0);
    const media = cp.length ? somaP / totalP : notas.reduce((a, n) => a + n.nota, 0) / notas.length;
    const ects = Math.max(0, ...notas.map(n => n.ects || 0)) || null;
    return { disc, notas, media, totalP, somaP, ects };
  }).sort((a, b) => a.disc.localeCompare(b.disc));
  // Média geral: ponderada por ECTS se todas tiverem ECTS; senão média simples das disciplinas (v1 misturava pesos de disciplinas diferentes)
  const todasEcts = resumo.every(r => r.ects);
  const mg = todasEcts ? resumo.reduce((a, r) => a + r.media * r.ects, 0) / resumo.reduce((a, r) => a + r.ects, 0) : resumo.reduce((a, r) => a + r.media, 0) / resumo.length;
  $('na-media-card').style.display = 'flex';
  $('na-media-val').textContent = mg.toFixed(2);
  $('na-media-sub').textContent = `${plural(resumo.length, 'disciplina')} · ${todasEcts ? 'ponderada por ECTS' : 'média simples (indica ECTS para ponderar)'}`;
  el.innerHTML = resumo.map((r, idx) => {
    const cls = r.media >= 9.5 ? 'aprovado' : r.media >= 7 ? 'limite' : 'reprovado', aberto = discAbertas.has(r.disc);
    let previsao = '';
    if (r.totalP > 0 && r.totalP < 100) {
      const resto = 100 - r.totalP, precisa = (9.5 * 100 - r.somaP) / resto;
      previsao = precisa <= 0 ? `✅ Já tens nota para passar, mesmo com 0 nos restantes ${resto}%.` : precisa > 20 ? `😬 Mesmo com 20 nos restantes ${resto}% não chegas a 9,5. Vê a época de recurso.` : `🎯 Precisas de <b>${precisa.toFixed(1)}</b> em média nos restantes ${resto}% para passar.`;
    }
    return `<div class="disc-group"><div class="disc-header" data-act="disc-toggle" data-disc="${esc(r.disc)}" role="button" tabindex="0" aria-expanded="${aberto}"><div class="disc-color" style="background:${DISC_PALETTE[idx % DISC_PALETTE.length]}"></div><div class="disc-nome">${esc(r.disc)}${r.ects ? ` <span style="font-size:.68rem;color:var(--muted);font-weight:600;">${r.ects} ECTS</span>` : ''}</div><div style="display:flex;align-items:center;gap:.5rem;"><span style="font-size:.72rem;color:var(--muted);">${r.notas.length} aval.</span><div class="disc-media ${cls}">${r.media.toFixed(1)}</div></div><span class="disc-chevron ${aberto ? 'open' : ''}">▾</span></div>
      <div class="disc-body ${aberto ? 'open' : ''}">${[...r.notas].sort((a, b) => (a.data || '').localeCompare(b.data || '')).map(n => { const c = n.nota >= 9.5 ? 'aprovado' : n.nota >= 7 ? 'limite' : 'reprovado'; return `<div class="disc-nota-row"><span class="disc-nota-tipo">${esc(n.tipo)}</span><div class="disc-nota-info"><div class="disc-nota-pct">${n.peso ? `Peso ${n.peso}%` : 'Sem peso'} · ${fmtDate(n.data)}</div>${n.obs ? `<div class="disc-nota-obs">${esc(n.obs)}</div>` : ''}</div><div class="disc-nota-val ${c}">${n.nota.toFixed(1)}</div><button class="del-btn" data-act="del" data-col="notas_academicas" data-id="${n.id}" aria-label="Apagar avaliação">✕</button></div>`; }).join('')}
      ${r.totalP > 0 ? `<div class="disc-soma"><span>Avaliado: ${r.totalP}% do total</span><strong>${r.media.toFixed(2)}/20</strong></div>` : ''}${previsao ? `<div class="disc-soma" style="display:block;background:var(--accent-bg);color:var(--text);line-height:1.45;">${previsao}</div>` : ''}</div></div>`;
  }).join('');
}
const DISC_PALETTE = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#be185d', '#15803d', '#b45309', '#4338ca'];
function renderFlashcards() {
  const due = D.flashcards.filter(dueHoje).length;
  $('fc-due-count').textContent = due ? `${due} para rever hoje` : '';
  $('lista-flashcards').innerHTML = D.flashcards.length ? [...D.flashcards].sort((a, b) => (a.srNextDate || '').localeCompare(b.srNextDate || '')).map(f => `<div class="item-card"><div class="item-body"><div class="item-title">${esc(f.pergunta)}</div><div class="item-meta">${esc(f.categoria || 'Geral')} · ${dueHoje(f) ? '<span style="color:var(--danger);font-weight:700">Para rever</span>' : `Próx.: ${fmtDate(f.srNextDate)}`}</div></div><button class="del-btn" data-act="del" data-col="flashcards" data-id="${f.id}" aria-label="Apagar cartão">✕</button></div>`).join('') : '<div class="empty-state">Sem cartões.</div>';
  renderStudyArea();
}

let renderTimer = null;
function agendarRender() { clearTimeout(renderTimer); renderTimer = setTimeout(renderizarApp, 60); }
function renderizarApp() {
  if (!uid) return;
  const hoje = getHoje();
  const safe = (f, ...a) => { try { f(...a); } catch (err) { console.error(f.name, err); } };
  safe(renderHeaderMetrics);
  switch (viewAtual) {
    case 'dashboard': safe(renderDashboard, hoje); break;
    case 'agenda': safe(renderAgenda); break;
    case 'horario': safe(renderHorario); break;
    case 'financas': safe(renderFinancas); break;
    case 'habitos': safe(renderHabitos, hoje); break;
    case 'notas': safe(renderNotas); if (tabNotaAtiva === 'academicas') safe(renderNotasAcademicas); renderCofreUI(); break;
    case 'flashcards': safe(renderFlashcards); break;
  }
  if ($('modal-pomo-estudo').classList.contains('open')) safe(renderPomoFC);
}

/* ═════════════ ERROS ═════════════ */
let avisouPermissao = false;
function erroGuardar(e) {
  console.error(e);
  if (e?.code === 'permission-denied') { if (!avisouPermissao) { avisouPermissao = true; toast('Sem permissão para guardar. Verifica as regras do Firestore.', 'error'); } }
  else if (e?.code === 'unavailable') toast('Sem ligação: vai sincronizar quando voltares a ter rede.', 'warn');
  else toast(e?.message?.includes('cheio') ? e.message : 'Não foi possível guardar.', 'error');
}

/* ═════════════ BACKUP ═════════════ */
const EXPORT_COLS = COLS;
$('btn-exportar').onclick = () => {
  const data = { app: 'foco', versao: 2, exportado: new Date().toISOString() };
  EXPORT_COLS.forEach(c => data[c] = D[c].map(({ uid: _u, ...r }) => r));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `Foco_Backup_${getHoje()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup exportado ⬇️');
};
$('btn-backup-import').onclick = () => $('import-input').click();
/* v1 exportava "objetivos/eventos/objProg/notasAcademicas" → mapeia para os nomes das coleções */
const ALIAS = { eventos: 'testes', objProg: 'obj_prog', notasAcademicas: 'notas_academicas', habitosLog: 'habitos_log', iouList: 'iou' };
async function importarDados(data, { silencioso = false } = {}) {
  let total = 0; const idMap = {};
  const entradas = Object.entries(data).map(([k, v]) => [ALIAS[k] || k, v]).filter(([k, v]) => COLS.includes(k) && Array.isArray(v));
  // primeiro hábitos/originais para manter ligações (habitos_log.habitoId, financas.origemId)
  entradas.sort(([a], [b]) => (a === 'habitos' ? -1 : b === 'habitos' ? 1 : 0));
  for (const [col, arr] of entradas) {
    if (col === 'cofre' && D.cofre.length) continue;
    for (const item of arr) {
      const { id, uid: _u, ...rest } = item;
      if (col === 'habitos_log' && idMap[rest.habitoId]) rest.habitoId = idMap[rest.habitoId];
      const r = await S.add(col, { ...rest, uid }); if (id) idMap[id] = r.id; total++;
    }
  }
  if (!silencioso) toast(`${plural(total, 'registo importado', 'registos importados')} ⬆️`);
  return total;
}
$('import-input').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!await pedirConfirmacao('Os dados do ficheiro vão ser ADICIONADOS aos que já tens.', 'Importar backup?', 'Importar')) return;
    fecharModal('modal-settings'); toast('A importar…', 'warn'); await importarDados(data);
  } catch (err) { console.error(err); toast('Ficheiro inválido', 'error'); }
};

/* ═════════════ DEFINIÇÕES, NOTIFICAÇÕES, INSTALAÇÃO ═════════════ */
function renderPerfil() {
  const nome = user?.displayName || 'Convidado', ini = nome.trim()[0]?.toUpperCase() || 'F';
  const pic = user?.photoURL ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<div class="avatar-fallback">${esc(ini)}</div>`;
  $('user-pic').innerHTML = user?.photoURL ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;">` : `<div class="avatar-btn" style="border:none;box-shadow:none;width:100%;height:100%;">${esc(ini)}</div>`;
  $('settings-profile').innerHTML = `${pic}<div><div style="font-weight:800;">${esc(nome)}</div><div style="font-size:.75rem;color:var(--muted);">${S.mode === 'local' ? 'Modo sem conta · dados neste dispositivo' : esc(user?.email || '')}</div></div>`;
  $('logout-label').textContent = S.mode === 'local' ? 'Sair do modo sem conta' : 'Sair da conta';
  atualizarNotifUI();
}
function atualizarNotifUI() {
  const p = 'Notification' in window ? Notification.permission : 'unsupported';
  $('notif-sub').textContent = p === 'granted' ? 'Ativas ✓' : p === 'denied' ? 'Bloqueadas nas definições do browser' : p === 'unsupported' ? 'Este browser não suporta' : 'Toca para ativar lembretes';
}
$('user-pic').onclick = () => { renderPerfil(); abrirModal('modal-settings'); };
$('btn-notif').onclick = async () => {
  if (!('Notification' in window)) return toast('Este browser não suporta notificações', 'error');
  const p = await Notification.requestPermission(); atualizarNotifUI();
  p === 'granted' ? toast('Notificações ativadas 🔔') : toast('Permissão negada', 'error');
};
$('btn-logout').onclick = async () => {
  if (S.mode === 'local') return sairDemo();
  if (!await pedirConfirmacao('Os teus dados ficam guardados na conta.', 'Sair da conta?', 'Sair')) return;
  fecharModal('modal-settings'); await S.logout();
};
let installPrompt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; $('btn-install').style.display = ''; });
$('btn-install').onclick = async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $('btn-install').style.display = 'none'; };

/* ═════════════ MODO SEM CONTA ═════════════ */
$('btn-demo').onclick = () => { setDemo(true); location.reload(); };
window.sairDemo = async () => {
  if (!await pedirConfirmacao('Vais para o ecrã de login. Os dados deste modo ficam guardados neste dispositivo e podes importá-los para a tua conta quando entrares.', 'Criar conta / entrar?', 'Continuar')) return;
  setDemo(false); location.reload();
};
async function oferecerMigracaoLocal() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('foco_local_'));
  const data = {}; let n = 0;
  keys.forEach(k => { try { const arr = JSON.parse(localStorage.getItem(k)); if (arr.length) { data[k.slice(11)] = arr; n += arr.length; } } catch {} });
  if (!n) return;
  if (await pedirConfirmacao(`Tens ${plural(n, 'registo')} do modo sem conta neste dispositivo. Queres passá-los para a tua conta?`, 'Importar dados locais?', 'Importar')) {
    toast('A importar…', 'warn'); await importarDados(data);
    keys.forEach(k => localStorage.removeItem(k));
  }
}

/* ═════════════ ARRANQUE ═════════════ */
function onLoaded(col) {
  if (col === 'xp_log') migrarXPLocal();
  if (col === 'orcamentos') migrarBudgetsLocais();
  if (col === 'financas') registarRecorrentes();
  if (col === 'objetivos' || col === 'xp_log') verificarPrazos();
  if (col === 'notas' && cofreKey) desencriptarNotas().then(renderNotas);
}
function initDB() {
  unsubs.forEach(u => u()); unsubs = []; loaded.clear();
  COLS.forEach(c => unsubs.push(S.watch(c, uid, lista => {
    D[c] = lista.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const primeira = !loaded.has(c); loaded.add(c);
    if (primeira) onLoaded(c); else if (c === 'notas' && cofreKey) desencriptarNotas().then(renderNotas);
    agendarRender();
  }, err => { if (err.code === 'permission-denied') erroGuardar(err); })));
  clearInterval(penalTimer); penalTimer = setInterval(verificarPrazos, 60000);
}

(async function main() {
  try { S = await initStore(); }
  catch (e) {
    console.error(e);
    $('login-screen').querySelector('.login-sub').textContent = 'Não foi possível ligar ao servidor. Verifica a ligação ou experimenta sem conta.';
    $('btn-login').disabled = true; S = null;
    return;
  }
  $('btn-login').onclick = async () => {
    $('btn-login').disabled = true;
    try { await S.login(); } catch (e) { console.error(e); toast(e.code === 'auth/unauthorized-domain' ? 'Este domínio não está autorizado no Firebase.' : 'Não foi possível entrar. Tenta de novo.', 'error'); }
    finally { $('btn-login').disabled = false; }
  };
  S.onAuth(async u => {
    if (u) {
      user = u; uid = u.uid;
      $('user-greeting').textContent = `Olá, ${(u.displayName || 'Convidado').split(' ')[0]} 👋`;
      $('login-screen').style.display = 'none'; $('app-screen').style.display = 'block';
      $('demo-banner').style.display = S.mode === 'local' ? 'flex' : 'none';
      ['na-data-val', 'iou-data'].forEach(i => $(i).value = getHoje());
      carregarDiaCores(); renderPerfil(); initDB(); atualizarFAB(viewAtual);
      if (S.mode === 'firebase') setTimeout(oferecerMigracaoLocal, 1500);
      const acao = new URLSearchParams(location.search).get('acao');
      if (acao) { history.replaceState(null, '', location.pathname); setTimeout(() => acao === 'pomodoro' ? abrirEscolhaPomo() : abrirNovoRegisto('tarefa'), 400); }
    } else {
      user = null; uid = null; trancarCofre(false);
      unsubs.forEach(f => f()); unsubs = []; COLS.forEach(c => D[c] = []);
      $('login-screen').style.display = 'flex'; $('app-screen').style.display = 'none';
    }
  });
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
