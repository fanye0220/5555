import React, { useState, useRef } from 'react';
import { Character, CharacterBook, CharacterBookEntry, Theme } from '../types';
import GlassCard from './ui/GlassCard';
import Button from './ui/Button';
import { parseQrFile, exportCharacterData, exportQrData } from '../services/cardImportService';
import {
  X, User, MessageSquare, BookOpen, Upload, ExternalLink, FileJson, Book,
  Plus, Trash2, Tag, Save, RotateCcw, FileText, QrCode, Layers,
  Image as ImageIcon, Download, Maximize2, Eye, Edit3, ChevronLeft, ChevronRight, Key
} from 'lucide-react';

interface CharacterFormProps {
  initialData?: Character;
  onSave: (char: Character) => void;
  onCancel: () => void;
  theme: Theme;
}

// ─── World Book Editor Modal ──────────────────────────────────────────────────

interface WiEditorProps {
  book: CharacterBook;
  onChange: (book: CharacterBook) => void;
  onClose: () => void;
  theme: Theme;
}

const WorldInfoEditor: React.FC<WiEditorProps> = ({ book, onChange, onClose, theme }) => {
  const [selectedIdx, setSelectedIdx] = useState<number>(book.entries.length > 0 ? 0 : -1);

  const addEntry = () => {
    const newEntry: CharacterBookEntry = {
      keys: [], keysInput: "", content: "", enabled: true,
      insertion_order: 100, case_sensitive: false, selective: false, constant: false,
    };
    const updated = { ...book, entries: [...book.entries, newEntry] };
    onChange(updated);
    setSelectedIdx(updated.entries.length - 1);
  };

  const deleteEntry = (idx: number) => {
    const entries = book.entries.filter((_, i) => i !== idx);
    onChange({ ...book, entries });
    setSelectedIdx(Math.max(0, Math.min(idx, entries.length - 1)));
  };

  const updateEntry = (idx: number, patch: Partial<CharacterBookEntry>) => {
    const entries = book.entries.map((e, i) => {
      if (i !== idx) return e;
      const updated = { ...e, ...patch };
      if ('keysInput' in patch) {
        updated.keys = (patch.keysInput || '').split(',').map(k => k.trim()).filter(Boolean);
      }
      return updated;
    });
    onChange({ ...book, entries });
  };

  const entry = selectedIdx >= 0 ? book.entries[selectedIdx] : null;

  const bg = theme === 'light' ? 'bg-white' : 'bg-[#0f172a]';
  const border = theme === 'light' ? 'border-slate-200' : 'border-white/10';
  const text = theme === 'light' ? 'text-slate-800' : 'text-white';
  const sub = theme === 'light' ? 'text-slate-500' : 'text-gray-400';
  const inputCls = theme === 'light'
    ? 'bg-white border border-slate-200 text-slate-800 focus:border-blue-400'
    : 'bg-black/30 border border-white/10 text-white focus:border-white/30';

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`w-full max-w-7xl h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden ${bg} border ${border}`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b ${border} flex items-center justify-between shrink-0`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Book className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className={`text-lg font-black ${text}`}>世界书 (World Info / Lorebook)</h3>
              <p className={`text-xs ${sub}`}>共 {book.entries.length} 个词条</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={addEntry}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 transition flex items-center gap-2">
              <Plus size={16} /> 新建词条
            </button>
            <button onClick={onClose} className={`p-2 rounded-lg transition hover:bg-white/10`}>
              <X size={20} className={sub} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Left: entry list */}
          <div className={`w-80 border-r ${border} overflow-y-auto shrink-0`} style={{ background: theme === 'light' ? '#f8fafc' : 'rgba(0,0,0,0.2)' }}>
            {book.entries.length === 0 ? (
              <div className="p-12 text-center">
                <Book size={48} className={`mx-auto mb-4 opacity-20 ${sub}`} />
                <p className={`text-sm font-semibold ${sub} mb-1`}>暂无世界书词条</p>
                <p className={`text-xs ${sub} opacity-60`}>点击右上角按钮创建</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {book.entries.map((e, idx) => (
                  <div key={idx} onClick={() => setSelectedIdx(idx)}
                    className={`p-3 cursor-pointer rounded-xl border-2 transition-all ${theme === 'light' ? 'bg-white' : 'bg-white/5'}
                      ${selectedIdx === idx
                        ? 'border-amber-400 shadow-md ring-2 ring-amber-100/30'
                        : `${border} hover:border-amber-300/50`}`}>
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${e.enabled !== false ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <span className={`text-xs font-bold ${sub}`}>#{idx + 1}</span>
                      </div>
                      <span className={`text-[10px] font-mono ${sub} opacity-60`}>Order: {e.insertion_order ?? 100}</span>
                    </div>
                    <div className={`text-sm font-bold truncate ${text}`}>
                      {(e.keys || []).join(', ') || '(未命名)'}
                    </div>
                    <div className={`text-xs ${sub} line-clamp-2 mt-0.5`}>{e.content || '(空内容)'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: entry editor */}
          {entry !== null && selectedIdx >= 0 ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-4xl mx-auto">
                <div className={`flex justify-between items-center mb-5 pb-4 border-b ${border}`}>
                  <h4 className={`font-black text-lg ${text}`}>词条详情</h4>
                  <button onClick={() => deleteEntry(selectedIdx)}
                    className="px-4 py-2 bg-red-500/10 text-red-500 rounded-lg text-sm font-bold hover:bg-red-500/20 transition flex items-center gap-2">
                    <Trash2 size={16} /> 删除
                  </button>
                </div>

                <div className="space-y-5">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className={`block text-xs font-bold mb-2 flex items-center gap-2 ${sub}`}>
                        <Key size={12} /> 触发关键词 (Keys) — 逗号分隔
                      </label>
                      <input
                        value={entry.keysInput ?? entry.keys?.join(', ') ?? ''}
                        onChange={e => updateEntry(selectedIdx, { keysInput: e.target.value })}
                        className={`w-full px-4 py-2.5 rounded-xl outline-none text-sm font-semibold transition ${inputCls}`}
                        placeholder="例如: 艾尔登法环, 褪色者"
                      />
                    </div>
                    <div className="w-32">
                      <label className={`block text-xs font-bold mb-2 ${sub}`}>状态</label>
                      <button
                        onClick={() => updateEntry(selectedIdx, { enabled: entry.enabled === false ? true : false })}
                        className={`w-full py-2.5 rounded-xl text-sm font-bold border-2 transition ${
                          entry.enabled !== false
                            ? 'bg-green-500/10 text-green-600 border-green-400/50'
                            : theme === 'light' ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white/5 text-gray-500 border-white/10'
                        }`}>
                        {entry.enabled !== false ? '✓ 启用' : '✗ 禁用'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className={`block text-xs font-bold mb-2 ${sub}`}>插入顺序 (Order)</label>
                      <input type="number" value={entry.insertion_order ?? 100}
                        onChange={e => updateEntry(selectedIdx, { insertion_order: Number(e.target.value) })}
                        className={`w-full px-4 py-2.5 rounded-xl outline-none text-sm transition ${inputCls}`} />
                    </div>
                    <div>
                      <label className={`block text-xs font-bold mb-2 ${sub}`}>大小写敏感</label>
                      <button onClick={() => updateEntry(selectedIdx, { case_sensitive: !entry.case_sensitive })}
                        className={`w-full py-2.5 rounded-xl text-sm font-bold border-2 transition ${
                          entry.case_sensitive
                            ? 'bg-blue-500/10 text-blue-500 border-blue-400/50'
                            : theme === 'light' ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white/5 text-gray-500 border-white/10'
                        }`}>
                        {entry.case_sensitive ? '✓ 敏感' : '✗ 不敏感'}
                      </button>
                    </div>
                    <div>
                      <label className={`block text-xs font-bold mb-2 ${sub}`}>常驻 (Constant)</label>
                      <button onClick={() => updateEntry(selectedIdx, { constant: !entry.constant })}
                        className={`w-full py-2.5 rounded-xl text-sm font-bold border-2 transition ${
                          entry.constant
                            ? 'bg-purple-500/10 text-purple-500 border-purple-400/50'
                            : theme === 'light' ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white/5 text-gray-500 border-white/10'
                        }`}>
                        {entry.constant ? '✓ 常驻' : '✗ 按需'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={`block text-xs font-bold mb-2 ${sub}`}>备注 (Comment)</label>
                    <input value={entry.comment || ''}
                      onChange={e => updateEntry(selectedIdx, { comment: e.target.value })}
                      className={`w-full px-4 py-2.5 rounded-xl outline-none text-sm transition ${inputCls}`}
                      placeholder="可选备注..." />
                  </div>

                  <div>
                    <label className={`block text-xs font-bold mb-2 ${sub} flex items-center justify-between`}>
                      <span>词条内容 (Content)</span>
                      <span className="opacity-50 font-normal">{(entry.content || '').length} 字符</span>
                    </label>
                    <textarea
                      rows={16}
                      value={entry.content || ''}
                      onChange={e => updateEntry(selectedIdx, { content: e.target.value })}
                      className={`w-full px-4 py-3 rounded-xl outline-none text-sm font-mono leading-relaxed resize-none transition ${inputCls}`}
                      placeholder="词条内容..."
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={`flex-1 flex items-center justify-center ${sub}`}>
              <div className="text-center">
                <Book size={48} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm opacity-60">选择左侧词条或点击「新建词条」</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Fullscreen Viewer Modal (read-only, no render) ───────────────────────────

interface FullscreenViewProps {
  character: Partial<Character>;
  viewingIdx: number; // -1 = main
  onChangeIdx: (idx: number) => void;
  onClose: () => void;
  onOpenEdit: () => void;
  theme: Theme;
}

const FullscreenViewer: React.FC<FullscreenViewProps> = ({ character, viewingIdx, onChangeIdx, onClose, onOpenEdit, theme }) => {
  const alts = character.alternate_greetings || [];
  const current = viewingIdx === -1 ? (character.firstMessage || '') : (alts[viewingIdx] || '');
  const label = viewingIdx === -1 ? '主开场白 (Main)' : `备选开场白 #${viewingIdx + 1}`;

  const bg = theme === 'light' ? 'bg-white' : 'bg-[#0f172a]';
  const border = theme === 'light' ? 'border-slate-200' : 'border-white/10';
  const text = theme === 'light' ? 'text-slate-800' : 'text-white';
  const sub = theme === 'light' ? 'text-slate-500' : 'text-gray-400';

  return (
    <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden ${bg} border ${border}`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b ${border} flex items-center justify-between shrink-0`} style={{ background: theme === 'light' ? '#f8fafc' : 'rgba(0,0,0,0.3)' }}>
          <div className="flex items-center gap-3">
            <Eye size={18} className="text-blue-500" />
            <span className={`font-black text-lg ${text}`}>{label}</span>
            <span className={`text-xs font-mono ${sub}`}>{current.length} 字符</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onOpenEdit}
              className="px-3 py-1.5 bg-amber-500/20 text-amber-600 rounded-lg text-xs font-bold hover:bg-amber-500/30 transition flex items-center gap-1">
              <Edit3 size={12} /> 切换到编辑
            </button>
            <button onClick={onClose} className={`p-2 rounded-lg hover:bg-white/10 transition`}>
              <X size={20} className={sub} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Main content */}
          <div className="flex-1 overflow-y-auto p-8">
            {current
              ? <pre className={`text-sm leading-7 whitespace-pre-wrap font-mono ${text} selection:bg-blue-500/20`}>{current}</pre>
              : <p className={`${sub} italic`}>(空内容)</p>
            }
          </div>

          {/* Right nav */}
          <div className={`w-72 border-l ${border} flex flex-col shrink-0`} style={{ background: theme === 'light' ? '#f8fafc' : 'rgba(0,0,0,0.2)' }}>
            <div className={`px-4 py-3 border-b ${border} text-[10px] font-bold ${sub} uppercase tracking-widest`}>快速切换</div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {/* Main */}
              <div onClick={() => onChangeIdx(-1)}
                className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  viewingIdx === -1
                    ? 'border-blue-400 bg-blue-500/10'
                    : `${border} hover:border-blue-300/50 ${theme === 'light' ? 'bg-white' : 'bg-white/5'}`
                }`}>
                <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${sub}`}>Main Message</div>
                <div className={`text-xs font-mono line-clamp-3 ${text}`}>{character.firstMessage || '(空)'}</div>
              </div>
              {/* Alts */}
              {alts.map((alt, idx) => (
                <div key={idx} onClick={() => onChangeIdx(idx)}
                  className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    viewingIdx === idx
                      ? 'border-blue-400 bg-blue-500/10'
                      : `${border} hover:border-blue-300/50 ${theme === 'light' ? 'bg-white' : 'bg-white/5'}`
                  }`}>
                  <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${sub}`}>Alternate #{idx + 1}</div>
                  <div className={`text-xs font-mono line-clamp-3 ${text}`}>{alt || '(空)'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Fullscreen Editor Modal ──────────────────────────────────────────────────

interface FullscreenEditProps {
  character: Partial<Character>;
  viewingIdx: number;
  onChangeIdx: (idx: number) => void;
  onChangeContent: (val: string) => void;
  onAddAlt: () => void;
  onRemoveAlt: (idx: number) => void;
  onSetAsMain: (idx: number) => void;
  onClose: () => void;
  onOpenView: () => void;
  theme: Theme;
}

const FullscreenEditor: React.FC<FullscreenEditProps> = ({
  character, viewingIdx, onChangeIdx, onChangeContent,
  onAddAlt, onRemoveAlt, onSetAsMain, onClose, onOpenView, theme
}) => {
  const alts = character.alternate_greetings || [];
  const current = viewingIdx === -1 ? (character.firstMessage || '') : (alts[viewingIdx] || '');
  const label = viewingIdx === -1 ? '主开场白 (Main)' : `备选开场白 #${viewingIdx + 1}`;

  const bg = theme === 'light' ? 'bg-white' : 'bg-[#0f172a]';
  const border = theme === 'light' ? 'border-slate-200' : 'border-white/10';
  const text = theme === 'light' ? 'text-slate-800' : 'text-white';
  const sub = theme === 'light' ? 'text-slate-500' : 'text-gray-400';

  return (
    <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden ${bg} border ${border}`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b ${border} flex items-center justify-between shrink-0`} style={{ background: theme === 'light' ? '#f8fafc' : 'rgba(0,0,0,0.3)' }}>
          <div className="flex items-center gap-3">
            <Edit3 size={18} className="text-amber-500" />
            <span className={`font-black text-lg ${text}`}>{label}</span>
            <span className={`text-xs font-mono ${sub}`}>{current.length} 字符</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onOpenView}
              className="px-3 py-1.5 bg-blue-500/20 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-500/30 transition flex items-center gap-1">
              <Eye size={12} /> 切换到查看
            </button>
            <button onClick={onClose} className={`p-2 rounded-lg hover:bg-white/10 transition`}>
              <X size={20} className={sub} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {/* Textarea */}
          <textarea
            className={`flex-1 w-full resize-none p-8 text-sm leading-7 outline-none font-mono ${text} bg-transparent`}
            style={{ background: theme === 'light' ? '#fff' : 'transparent' }}
            value={current}
            onChange={e => onChangeContent(e.target.value)}
            placeholder="暂无内容..."
          />

          {/* Right nav */}
          <div className={`w-72 border-l ${border} flex flex-col shrink-0`} style={{ background: theme === 'light' ? '#f8fafc' : 'rgba(0,0,0,0.2)' }}>
            <div className={`px-4 py-3 border-b ${border} flex items-center justify-between`}>
              <span className={`text-[10px] font-bold ${sub} uppercase tracking-widest`}>快速切换</span>
              <button onClick={onAddAlt}
                className="p-1 text-amber-500 hover:bg-amber-500/10 rounded-lg transition">
                <Plus size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {/* Main */}
              <div onClick={() => onChangeIdx(-1)}
                className={`group p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  viewingIdx === -1
                    ? 'border-amber-400 bg-amber-500/10'
                    : `${border} hover:border-amber-300/50 ${theme === 'light' ? 'bg-white' : 'bg-white/5'}`
                }`}>
                <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${sub}`}>Main Message</div>
                <div className={`text-xs font-mono line-clamp-3 ${text}`}>{character.firstMessage || '(空)'}</div>
              </div>
              {/* Alts */}
              {alts.map((alt, idx) => (
                <div key={idx} onClick={() => onChangeIdx(idx)}
                  className={`group relative p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    viewingIdx === idx
                      ? 'border-amber-400 bg-amber-500/10'
                      : `${border} hover:border-amber-300/50 ${theme === 'light' ? 'bg-white' : 'bg-white/5'}`
                  }`}>
                  <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${sub}`}>Alternate #{idx + 1}</div>
                  <div className={`text-xs font-mono line-clamp-3 ${text}`}>{alt || '(空)'}</div>
                  <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e => { e.stopPropagation(); onSetAsMain(idx); }}
                      className="p-1 text-blue-400 hover:text-blue-500 hover:bg-blue-500/10 rounded transition" title="设为主开场白">
                      <RotateCcw size={11} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); onRemoveAlt(idx); if (viewingIdx === idx) onChangeIdx(-1); }}
                      className="p-1 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded transition" title="删除">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main Form ────────────────────────────────────────────────────────────────

const CharacterForm: React.FC<CharacterFormProps> = ({ initialData, onSave, onCancel, theme }) => {
  const [formData, setFormData] = useState<Partial<Character>>(initialData || {
    name: '',
    description: '',
    personality: '',
    firstMessage: '',
    alternate_greetings: [],
    avatarUrl: `https://picsum.photos/seed/${Math.random()}/400/400`,
    scenario: '',
    character_book: { entries: [] },
    tags: [],
    qrList: [],
    originalFilename: '',
    sourceUrl: '',
    cardUrl: '',
    extra_qr_data: {}
  });

  const [error, setError] = useState<string | null>(null);

  // Fullscreen state
  const [fsMode, setFsMode] = useState<null | 'view' | 'edit'>(null);
  const [fsIdx, setFsIdx] = useState<number>(-1); // -1 = main greeting

  // World book editor
  const [showWiEditor, setShowWiEditor] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const qrFileInputRef = useRef<HTMLInputElement>(null);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFormData(prev => ({
      ...prev,
      avatarUrl: URL.createObjectURL(file),
      originalFilename: file.name,
      cardUrl: file.name,
    }));
  };

  const handleQrFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { list, raw } = await parseQrFile(file);
      setFormData(prev => ({ ...prev, qrList: list, extra_qr_data: raw, qrFileName: file.name }));
      alert(`成功绑定 ${list.length} 个 QR 动作!`);
    } catch (e: any) { alert(e.message); }
    finally { if (qrFileInputRef.current) qrFileInputRef.current.value = ''; }
  };

  const handleQrExport = () => {
    if (!formData.qrList?.length) { alert("没有可导出的 QR 数据"); return; }
    exportQrData(formData.qrList, formData.extra_qr_data);
  };

  const handleClearQr = () => {
    if (confirm("确定要清除当前的 QR 配置吗？"))
      setFormData(prev => ({ ...prev, qrList: [], extra_qr_data: {}, qrFileName: '' }));
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const val = e.currentTarget.value.trim();
    const tags = Array.isArray(formData.tags) ? formData.tags : [];
    if (val && !tags.includes(val)) {
      setFormData(prev => ({ ...prev, tags: [...tags, val] }));
      e.currentTarget.value = '';
    }
  };

  const removeTag = (tag: string) => setFormData(prev => ({
    ...prev, tags: (Array.isArray(prev.tags) ? prev.tags : []).filter(t => t !== tag)
  }));

  const addAltGreeting = () => setFormData(prev => ({
    ...prev, alternate_greetings: [...(prev.alternate_greetings || []), '']
  }));

  const updateAltGreeting = (idx: number, val: string) => {
    const arr = [...(formData.alternate_greetings || [])];
    arr[idx] = val;
    setFormData(prev => ({ ...prev, alternate_greetings: arr }));
  };

  const removeAltGreeting = (idx: number) => setFormData(prev => ({
    ...prev, alternate_greetings: prev.alternate_greetings?.filter((_, i) => i !== idx)
  }));

  const setAsMain = (idx: number) => {
    const alts = [...(formData.alternate_greetings || [])];
    const oldMain = formData.firstMessage || '';
    const newMain = alts[idx];
    alts[idx] = oldMain;
    setFormData(prev => ({ ...prev, firstMessage: newMain, alternate_greetings: alts }));
  };

  // Fullscreen content change
  const handleFsContentChange = (val: string) => {
    if (fsIdx === -1) {
      setFormData(prev => ({ ...prev, firstMessage: val }));
    } else {
      updateAltGreeting(fsIdx, val);
    }
  };

  // ── Build & save ─────────────────────────────────────────────────────────────

  const getFullCharacter = (): Character => ({
    ...initialData,
    id: initialData?.id || crypto.randomUUID(),
    name: formData.name || "Unknown",
    description: formData.description || '',
    personality: formData.personality || '',
    firstMessage: formData.firstMessage || '',
    alternate_greetings: formData.alternate_greetings || [],
    avatarUrl: formData.avatarUrl!,
    scenario: formData.scenario || '',
    character_book: formData.character_book,
    tags: formData.tags || [],
    qrList: formData.qrList || [],
    originalFilename: formData.originalFilename,
    sourceUrl: formData.sourceUrl || '',
    cardUrl: formData.cardUrl || '',
    mes_example: formData.mes_example || '',
    system_prompt: formData.system_prompt || '',
    post_history_instructions: formData.post_history_instructions || '',
    creator_notes: formData.creator_notes || '',
    creator: formData.creator || '',
    character_version: formData.character_version || '',
    extensions: formData.extensions || {},
    // Preserve rawData for lossless export
    rawData: formData.rawData || initialData?.rawData,
    extra_qr_data: formData.extra_qr_data,
    qrFileName: formData.qrFileName,
    updatedAt: Date.now(),
    importDate: initialData?.importDate || Date.now(),
    importFormat: initialData?.importFormat || 'png',
  });

  const handleSubmit = () => {
    if (!formData.name) { setError("名字是必填项。"); return; }
    onSave(getFullCharacter());
  };

  const handleExport = async (exportType: 'png' | 'json' | 'package') => {
    if (!formData.name) { setError("请先填写角色名称"); return; }
    const char = getFullCharacter();

    if (exportType === 'package') {
      if (!char.qrList?.length) { alert("没有绑定 QR 动作，无法打包。"); return; }
      const fmt = char.importFormat === 'json' ? 'json' : 'png';
      try { await exportCharacterData(char, fmt, true); }
      catch (e: any) { setError(e.message); }
      return;
    }

    if (exportType === 'png' && char.importFormat === 'json' && char.avatarUrl?.includes('picsum')) {
      if (!confirm("该角色通过 JSON 导入且使用占位头像，导出 PNG 会将数据写入占位图。确定继续？")) return;
    }

    try { await exportCharacterData(char, exportType, false); }
    catch (e: any) { setError(e.message); }
  };

  // ── Styles ──────────────────────────────────────────────────────────────────

  const labelColor = theme === 'light'
    ? 'text-slate-500 font-bold text-xs uppercase tracking-wider'
    : 'text-blue-200/70 font-bold text-xs uppercase tracking-wider';
  const inputBg = theme === 'light'
    ? 'bg-white/50 border-slate-200 text-slate-800 focus:border-blue-400 focus:bg-white'
    : 'bg-black/20 border-white/10 text-white focus:border-white/30 focus:bg-black/30';
  const sectionTitle = `text-lg font-bold flex items-center gap-2 mb-4 ${theme === 'light' ? 'text-slate-700' : 'text-white'}`;
  const dividerClass = theme === 'light' ? 'border-slate-200' : 'border-white/10';

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-full w-full max-w-4xl mx-auto p-4 md:p-6 animate-fade-in flex flex-col relative">

      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-cover bg-center transition-all duration-700 opacity-80 scale-110"
          style={{ backgroundImage: `url(${formData.avatarUrl})` }} />
        <div className={`absolute inset-0 backdrop-blur-[40px] ${theme === 'light' ? 'bg-white/30' : 'bg-[#0f172a]/30'}`} />
        <div className={`absolute inset-0 ${theme === 'light' ? 'bg-gradient-to-b from-white/20 to-white/60' : 'bg-gradient-to-b from-black/10 to-[#0f172a]/60'}`} />
      </div>

      {/* Fullscreen Viewer */}
      {fsMode === 'view' && (
        <FullscreenViewer
          character={formData}
          viewingIdx={fsIdx}
          onChangeIdx={setFsIdx}
          onClose={() => setFsMode(null)}
          onOpenEdit={() => setFsMode('edit')}
          theme={theme}
        />
      )}

      {/* Fullscreen Editor */}
      {fsMode === 'edit' && (
        <FullscreenEditor
          character={formData}
          viewingIdx={fsIdx}
          onChangeIdx={setFsIdx}
          onChangeContent={handleFsContentChange}
          onAddAlt={addAltGreeting}
          onRemoveAlt={removeAltGreeting}
          onSetAsMain={setAsMain}
          onClose={() => setFsMode(null)}
          onOpenView={() => setFsMode('view')}
          theme={theme}
        />
      )}

      {/* World Book Editor */}
      {showWiEditor && formData.character_book && (
        <WorldInfoEditor
          book={formData.character_book}
          onChange={book => setFormData(prev => ({ ...prev, character_book: book }))}
          onClose={() => setShowWiEditor(false)}
          theme={theme}
        />
      )}

      {/* Main Scroll Container */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-32 relative z-10">

        {/* 1. Identity Card */}
        <GlassCard theme={theme} className="p-6 mb-6 !bg-opacity-80">
          <div className="flex justify-between items-center mb-6">
            <h2 className={`text-xl font-bold ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}>
              {formData.name ? '编辑角色' : '新建角色'}
            </h2>
            <button onClick={onCancel} className={`p-2 rounded-full transition-colors ${theme === 'light' ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-gray-400'}`}>
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-col md:flex-row gap-8">
            {/* Avatar */}
            <div className="shrink-0 flex flex-col items-center md:items-start gap-3 w-full md:w-auto">
              <div className={`w-64 h-64 rounded-2xl overflow-hidden relative group shadow-2xl ${theme === 'light' ? 'bg-slate-200' : 'bg-black/40'}`}>
                <img src={formData.avatarUrl} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                <div onClick={() => avatarInputRef.current?.click()}
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer backdrop-blur-sm">
                  <Upload size={32} className="mb-2 opacity-90" />
                  <span className="font-bold text-sm">更换头像</span>
                </div>
              </div>
              <input type="file" accept="image/*" className="hidden" ref={avatarInputRef} onChange={handleAvatarChange} />
              <input value={formData.originalFilename || ''}
                onChange={e => setFormData({ ...formData, originalFilename: e.target.value })}
                placeholder="文件名"
                className={`w-64 rounded-xl px-3 py-3 text-sm outline-none transition-all text-center border ${inputBg}`} />
            </div>

            {/* Fields */}
            <div className="flex-1 space-y-5 w-full">
              <div>
                <label className={`block mb-2 ${labelColor}`}>角色名称 (NAME)</label>
                <input value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full rounded-xl px-4 py-3 text-lg font-bold outline-none transition-all border ${inputBg}`}
                  placeholder="Unknown" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block mb-2 ${labelColor}`}>导入时间</label>
                  <div className={`w-full rounded-xl px-4 py-3 text-sm font-mono opacity-80 truncate border ${inputBg}`}>
                    {formData.importDate ? new Date(formData.importDate).toLocaleString() : 'Unknown'}
                  </div>
                </div>
                <div>
                  <label className={`block mb-2 ${labelColor}`}>修改时间</label>
                  <div className={`w-full rounded-xl px-4 py-3 text-sm font-mono opacity-80 truncate border ${inputBg}`}>
                    {new Date().toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block mb-2 ${labelColor}`}>标签 (TAGS)</label>
                  <div className={`w-full rounded-xl px-3 py-2 min-h-[46px] flex flex-wrap gap-2 transition-all border ${inputBg}`}>
                    {(Array.isArray(formData.tags) ? formData.tags : []).map(tag => (
                      <span key={tag} className="px-2 py-1 rounded-md bg-white/10 text-xs font-bold flex items-center gap-1 border border-white/10">
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-400"><X size={10} /></button>
                      </span>
                    ))}
                    <input className="bg-transparent focus:outline-none text-sm min-w-[60px] px-1 py-1 flex-1"
                      placeholder="+ Tag" onKeyDown={handleAddTag}
                      onBlur={e => { const v = e.target.value.trim(); const t = Array.isArray(formData.tags) ? formData.tags : []; if (v && !t.includes(v)) { setFormData(p => ({ ...p, tags: [...t, v] })); e.target.value = ''; } }} />
                  </div>
                </div>
                <div>
                  <label className={`block mb-2 ${labelColor}`}>来源链接 (SOURCE)</label>
                  <div className="flex gap-2">
                    <input type="text" value={formData.sourceUrl || ''}
                      onChange={e => setFormData({ ...formData, sourceUrl: e.target.value })}
                      placeholder="https://..." className={`flex-1 rounded-xl px-4 py-3 text-sm outline-none transition-all border ${inputBg}`} />
                    {formData.sourceUrl && (
                      <a href={formData.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className={`p-3 rounded-xl transition-colors flex items-center justify-center ${theme === 'light' ? 'bg-slate-200 hover:bg-slate-300 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                        <ExternalLink size={18} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* 2. Details */}
        <GlassCard theme={theme} className="p-6 mb-6 !bg-opacity-60">
          <div className={sectionTitle}><BookOpen size={20} /> 详细设定</div>
          <div className="space-y-5">
            <div>
              <label className={`block mb-2 ${labelColor}`}>描述 (DESCRIPTION)</label>
              <textarea rows={5} value={formData.description || ''}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className={`w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all border ${inputBg}`}
                placeholder="角色描述..." />
            </div>
            <div>
              <label className={`block mb-2 ${labelColor}`}>性格 (PERSONALITY)</label>
              <textarea rows={3} value={formData.personality || ''}
                onChange={e => setFormData({ ...formData, personality: e.target.value })}
                className={`w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all border ${inputBg}`}
                placeholder="性格特征..." />
            </div>
            <div>
              <label className={`block mb-2 ${labelColor}`}>场景 (SCENARIO)</label>
              <textarea rows={3} value={formData.scenario || ''}
                onChange={e => setFormData({ ...formData, scenario: e.target.value })}
                className={`w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all border ${inputBg}`}
                placeholder="场景设定..." />
            </div>
          </div>
        </GlassCard>

        {/* 3. Greetings */}
        <GlassCard theme={theme} className="p-6 mb-6 !bg-opacity-60">
          {/* First Message Header */}
          <div className="flex justify-between items-center mb-4">
            <label className={`flex items-center gap-2 ${labelColor}`}>
              <MessageSquare size={14} /> 开场白 (FIRST MESSAGE)
            </label>
            <div className="flex items-center gap-2">
              <button onClick={() => { setFsIdx(-1); setFsMode('view'); }}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors ${theme === 'light' ? 'bg-blue-50 text-blue-600 hover:bg-blue-100' : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'}`}>
                <Eye size={12} /> 全屏查看
              </button>
              <button onClick={() => { setFsIdx(-1); setFsMode('edit'); }}
                className={`text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors ${theme === 'light' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'}`}>
                <Edit3 size={12} /> 全屏编辑
              </button>
            </div>
          </div>

          <div className={`w-full rounded-2xl p-6 mb-6 text-sm leading-relaxed relative group ${theme === 'light' ? 'bg-slate-50' : 'bg-white/5'}`}>
            <textarea rows={8} value={formData.firstMessage || ''}
              onChange={e => setFormData({ ...formData, firstMessage: e.target.value })}
              className="w-full bg-transparent outline-none resize-none custom-scrollbar"
              placeholder="角色的第一句话..." />
            <div className="absolute bottom-2 right-4 text-xs opacity-40 pointer-events-none">
              {formData.firstMessage?.length || 0} chars
            </div>
          </div>

          <div className={`border-t mb-6 ${dividerClass}`}></div>

          {/* Alternate Greetings */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <label className={`flex items-center gap-2 ${labelColor}`}>
                <Layers size={14} /> 备选开场白 ({formData.alternate_greetings?.length || 0})
              </label>
              <button onClick={addAltGreeting}
                className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${theme === 'light' ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}>
                <Plus size={14} /> 添加
              </button>
            </div>

            <div className="space-y-4">
              {formData.alternate_greetings?.map((msg, idx) => (
                <div key={idx} className={`relative group p-4 rounded-xl transition-all ${theme === 'light' ? 'bg-white border border-slate-100 shadow-sm' : 'bg-white/5 border border-white/5 hover:bg-white/10'}`}>
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-widest opacity-50 mt-1 ${theme === 'light' ? 'text-slate-400' : 'text-blue-300'}`}>
                      Alternate #{idx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      {/* View fullscreen */}
                      <button onClick={() => { setFsIdx(idx); setFsMode('view'); }}
                        className={`p-1.5 rounded-md transition-colors ${theme === 'light' ? 'text-blue-400 hover:text-blue-500 hover:bg-blue-50' : 'text-blue-400 hover:bg-blue-500/10'}`}
                        title="全屏查看">
                        <Eye size={13} />
                      </button>
                      {/* Edit fullscreen */}
                      <button onClick={() => { setFsIdx(idx); setFsMode('edit'); }}
                        className={`p-1.5 rounded-md transition-colors ${theme === 'light' ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50' : 'text-amber-400 hover:bg-amber-500/10'}`}
                        title="全屏编辑">
                        <Edit3 size={13} />
                      </button>
                      {/* Set as main */}
                      <button onClick={() => setAsMain(idx)}
                        className={`p-1.5 rounded-md transition-colors ${theme === 'light' ? 'text-slate-400 hover:text-blue-500 hover:bg-blue-50' : 'text-gray-400 hover:text-blue-400 hover:bg-blue-500/10'}`}
                        title="设为主开场白">
                        <RotateCcw size={13} />
                      </button>
                      {/* Remove */}
                      <button onClick={() => removeAltGreeting(idx)}
                        className={`p-1.5 rounded-md transition-colors ${theme === 'light' ? 'text-gray-400 hover:text-red-500 hover:bg-red-50' : 'text-gray-400 hover:text-red-500 hover:bg-red-500/10'}`}
                        title="删除">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <textarea rows={3} value={msg}
                    onChange={e => updateAltGreeting(idx, e.target.value)}
                    className="w-full bg-transparent outline-none resize-none custom-scrollbar text-sm mt-1 leading-relaxed"
                    placeholder="输入备选开场白内容..." />
                </div>
              ))}
              {(!formData.alternate_greetings || formData.alternate_greetings.length === 0) && (
                <div className={`text-center py-8 border border-dashed rounded-xl text-xs ${theme === 'light' ? 'border-slate-300 text-slate-400' : 'border-white/10 text-gray-500'}`}>
                  暂无备选开场白
                </div>
              )}
            </div>
          </div>

          <div className={`border-t mt-6 mb-6 ${dividerClass}`}></div>

          {/* QR Section */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className={`flex items-center gap-2 ${labelColor}`}>
                <QrCode size={14} /> 快速回复按钮 (QUICK REPLIES)
              </label>
              <input type="file" accept=".json" className="hidden" ref={qrFileInputRef} onChange={handleQrFileImport} />
            </div>
            <div className={`rounded-2xl border-2 border-dashed transition-all duration-300 ${
              formData.qrList && formData.qrList.length > 0
                ? (theme === 'light' ? 'border-slate-300 bg-slate-50/50' : 'border-white/20 bg-white/5')
                : (theme === 'light' ? 'border-slate-200 bg-slate-50/30' : 'border-white/10 bg-white/5')
            }`}>
              {formData.qrList && formData.qrList.length > 0 ? (
                <div className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                      <span className={`font-bold text-sm ${theme === 'light' ? 'text-slate-700' : 'text-gray-200'}`}>已导入快速回复配置</span>
                    </div>
                    <button onClick={handleClearQr} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-500 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className={`w-full rounded-xl px-4 py-3 mb-4 text-sm font-mono flex items-center border ${theme === 'light' ? 'bg-white border-slate-200 text-slate-600' : 'bg-black/20 border-white/5 text-gray-300'}`}>
                    <span className="opacity-50 mr-2">文件名:</span>
                    <span className="truncate flex-1">{formData.qrFileName || 'imported_config.json'}</span>
                  </div>
                  <button onClick={handleQrExport}
                    className={`w-full py-3 rounded-xl font-bold text-white transition-colors flex items-center justify-center gap-2 shadow-lg ${theme === 'light' ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white/10 hover:bg-white/20 border border-white/10'}`}>
                    <Download size={18} /> 下载 JSON
                  </button>
                </div>
              ) : (
                <div className="p-8 flex flex-col items-center justify-center gap-4 text-center">
                  <div className={`p-4 rounded-full ${theme === 'light' ? 'bg-slate-100 text-slate-500' : 'bg-white/10 text-gray-400'}`}>
                    <Upload size={32} strokeWidth={1.5} />
                  </div>
                  <div className={`text-sm font-medium ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>未导入快速回复配置</div>
                  <button onClick={() => qrFileInputRef.current?.click()}
                    className={`px-8 py-2.5 rounded-xl font-bold text-white transition-colors flex items-center gap-2 shadow-lg ${theme === 'light' ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white/10 hover:bg-white/20 border border-white/10'}`}>
                    <FileJson size={18} /> 导入 JSON
                  </button>
                </div>
              )}
            </div>
          </div>
        </GlassCard>

        {/* 4. World Book */}
        <GlassCard theme={theme} className="p-6 mb-6 !bg-opacity-60">
          <div className="flex justify-between items-center">
            <div className={sectionTitle.replace('mb-4', '')}><Book size={20} /> 世界书 (Lorebook)</div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-mono opacity-60 ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>
                {formData.character_book?.entries?.length || 0} 条词条
              </span>
              <button onClick={() => {
                if (!formData.character_book) setFormData(prev => ({ ...prev, character_book: { entries: [] } }));
                setShowWiEditor(true);
              }}
                className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors ${
                  theme === 'light' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200'
                  : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/20'
                }`}>
                <Edit3 size={14} /> {formData.character_book?.entries?.length ? '编辑世界书' : '创建世界书'}
              </button>
            </div>
          </div>
          {formData.character_book && formData.character_book.entries.length > 0 ? (
            <div className="mt-4 space-y-2">
              {formData.character_book.entries.slice(0, 4).map((e, idx) => (
                <div key={idx} className={`flex items-center gap-3 p-2.5 rounded-lg ${theme === 'light' ? 'bg-slate-50 border border-slate-100' : 'bg-white/5 border border-white/5'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.enabled !== false ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className={`text-xs font-bold flex-1 truncate ${theme === 'light' ? 'text-slate-700' : 'text-gray-200'}`}>
                    {(e.keys || []).join(', ') || '(未命名)'}
                  </span>
                  <span className={`text-[10px] font-mono opacity-50 ${theme === 'light' ? 'text-slate-400' : 'text-gray-500'}`}>
                    {(e.content || '').length} chars
                  </span>
                </div>
              ))}
              {formData.character_book.entries.length > 4 && (
                <div className={`text-xs text-center py-1 opacity-50 ${theme === 'light' ? 'text-slate-400' : 'text-gray-500'}`}>
                  还有 {formData.character_book.entries.length - 4} 条词条...
                </div>
              )}
            </div>
          ) : (
            <div className={`mt-4 text-center py-6 text-xs border border-dashed rounded-xl ${theme === 'light' ? 'border-slate-200 text-slate-400' : 'border-white/10 text-gray-500'}`}>
              暂无世界书词条，点击上方按钮创建
            </div>
          )}
        </GlassCard>

      </div>

      {/* Sticky Bottom Export Button */}
      <div className="absolute bottom-6 left-0 right-0 px-6 z-20 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex w-full max-w-md shadow-2xl rounded-full overflow-hidden transform transition-transform hover:scale-[1.02]">
          <button onClick={() => handleExport('json')}
            className={`flex-1 font-bold text-lg py-4 flex items-center justify-center gap-2 transition-colors border-r border-black/5
              ${theme === 'light' ? 'bg-white/90 text-slate-600 hover:bg-white' : 'bg-white/10 text-white/80 hover:bg-white/20 backdrop-blur-md'}`}>
            <FileJson size={20} /> 导出 JSON
          </button>
          <button onClick={() => handleExport('png')}
            className={`flex-1 font-bold text-lg py-4 flex items-center justify-center gap-2 transition-colors
              ${theme === 'light' ? 'bg-white/90 text-slate-600 hover:bg-white' : 'bg-white/10 text-white/80 hover:bg-white/20 backdrop-blur-md'}`}>
            <ImageIcon size={20} /> 导出 PNG
          </button>
          {formData.qrList && formData.qrList.length > 0 && (
            <button onClick={() => handleExport('package')}
              className={`w-16 font-bold text-lg py-4 flex items-center justify-center transition-colors border-l border-black/5
                ${theme === 'light' ? 'bg-blue-500/90 text-white hover:bg-blue-600' : 'bg-blue-600/80 text-white hover:bg-blue-500 backdrop-blur-md'}`}
              title="打包导出 (QR + 卡片)">
              <Layers size={20} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-6 py-3 rounded-full text-sm shadow-xl z-50 flex items-center gap-2">
          <span className="font-bold">Error:</span> {error}
          <button onClick={() => setError(null)} className="ml-2 hover:bg-white/20 rounded-full p-1"><X size={12} /></button>
        </div>
      )}
    </div>
  );
};

export default CharacterForm;
