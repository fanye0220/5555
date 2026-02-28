import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Character, Theme } from '../types';
import Button from './ui/Button';
import Modal from './ui/Modal';
import { Edit2, Trash2, Upload, AlertCircle, Download, FileText, AlertTriangle, QrCode, CheckSquare, Square, Filter, ChevronLeft, ChevronRight, ChevronDown, FolderInput, Book, MessageSquare, MoreVertical, FileJson, Image as ImageIcon, Check, Heart, Star, List, Tag, Menu, X, Plus, Copy, Folder, FolderPlus, GitCompare } from 'lucide-react';
import { parseCharacterCard, parseCharacterJson, exportCharacterData, exportBulkCharacters } from '../services/cardImportService';

// Removed invalid module augmentation. We will cast props if needed or ignore the error for now as it's just for directory upload.
// If needed, we can use a custom input component or just ignore the TS error on the input element locally.

interface CharacterListProps {
  characters: Character[];
  onSelect: (char: Character) => void;
  onDelete: (id: string) => void;
  onDeleteBatch?: (ids: string[]) => void;
  onImport: (char: Character) => void;
  onUpdate?: (char: Character) => void; // Add onUpdate prop
  theme: Theme;
  folders?: string[]; // Optional for now as it seems unused in this version
  onCreateFolder?: (name: string) => void;
  onDeleteFolder?: (name: string) => void;
  onRenameFolder?: (oldName: string, newName: string) => void;
}

interface ImportResults {
  success: number;
  failed: number;
  failedFiles: string[];
}

const CharacterList: React.FC<CharacterListProps> = ({ 
  characters, 
  onSelect, 
  onDelete,
  onDeleteBatch,
  onImport,
  onUpdate,
  theme
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [importingCount, setImportingCount] = useState(0);
  
  // Import Error Modal State
  const [importErrorModalOpen, setImportErrorModalOpen] = useState(false);
  const [importResults, setImportResults] = useState<ImportResults | null>(null);
  
  // Sidebar State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTagsExpanded, setIsTagsExpanded] = useState(true);
  const [isCollectionsExpanded, setIsCollectionsExpanded] = useState(true);
  const [activeFilter, setActiveFilter] = useState<{ type: 'all' | 'favorite' | 'tag' | 'duplicate' | 'collection', value?: string }>({ type: 'all' });

  // Resizable Sidebar State
  const [collectionsHeight, setCollectionsHeight] = useState(180);
  const [tagsHeight, setTagsHeight] = useState(180);
  const [resizingTarget, setResizingTarget] = useState<'collections' | 'tags' | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingTarget) return;
      
      if (resizingTarget === 'collections') {
          setCollectionsHeight(prev => {
              const newHeight = prev + e.movementY;
              return Math.max(50, Math.min(600, newHeight));
          });
      } else if (resizingTarget === 'tags') {
          setTagsHeight(prev => {
              const newHeight = prev + e.movementY;
              return Math.max(50, Math.min(600, newHeight));
          });
      }
    };

    const handleMouseUp = () => {
      setResizingTarget(null);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (resizingTarget) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingTarget]);

  // States
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportMenuCharId, setExportMenuCharId] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<'updated-desc' | 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc'>('updated-desc');
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [dragOverFavorite, setDragOverFavorite] = useState(false);
  const [draggingCharId, setDraggingCharId] = useState<string | null>(null);

  const toggleFavorite = (char: Character, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate?.({ ...char, isFavorite: !char.isFavorite, updatedAt: Date.now() });
  };
  
  // Tag & Collection Management
  const [customTags, setCustomTags] = useState<string[]>([]); // "Card Tags"
  const [collections, setCollections] = useState<string[]>(() => {
      try {
          const saved = localStorage.getItem('collections');
          return saved ? JSON.parse(saved) : [];
      } catch {
          return [];
      }
  });
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isAddingCollection, setIsAddingCollection] = useState(false);
  const [newTagInputValue, setNewTagInputValue] = useState('');
  const [newCollectionInputValue, setNewCollectionInputValue] = useState('');

  useEffect(() => {
      localStorage.setItem('collections', JSON.stringify(collections));
  }, [collections]);

  // Renaming State
  const [editingCollection, setEditingCollection] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleStartRenameCollection = (name: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingCollection(name);
      setRenameValue(name);
  };

  const handleFinishRenameCollection = () => {
      if (!editingCollection || !renameValue.trim()) {
          setEditingCollection(null);
          return;
      }
      const newName = renameValue.trim();
      if (newName !== editingCollection && !collections.includes(newName)) {
          setCollections(prev => prev.map(c => c === editingCollection ? newName : c));
          // Update characters
          characters.forEach(char => {
              const currentTags = Array.isArray(char.tags) ? char.tags : [];
              if (currentTags.includes(editingCollection)) {
                  const newTags = currentTags.map(t => t === editingCollection ? newName : t);
                  onUpdate?.({ ...char, tags: newTags });
              }
          });
          if (activeFilter.type === 'collection' && activeFilter.value === editingCollection) {
              setActiveFilter({ ...activeFilter, value: newName });
          }
      }
      setEditingCollection(null);
  };

  const handleStartRenameTag = (tag: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingTag(tag);
      setRenameValue(tag);
  };

  const handleFinishRenameTag = () => {
      if (!editingTag || !renameValue.trim()) {
          setEditingTag(null);
          return;
      }
      const newName = renameValue.trim();
      if (newName !== editingTag && !allTags.includes(newName)) {
          // Update custom tags list if it's there
          setCustomTags(prev => prev.map(t => t === editingTag ? newName : t));
          
          // Update characters
          characters.forEach(char => {
              const currentTags = Array.isArray(char.tags) ? char.tags : [];
              if (currentTags.includes(editingTag)) {
                  const newTags = currentTags.map(t => t === editingTag ? newName : t);
                  onUpdate?.({ ...char, tags: newTags });
              }
          });
          
          if (activeFilter.type === 'tag' && activeFilter.value === editingTag) {
              setActiveFilter({ ...activeFilter, value: newName });
          }
      }
      setEditingTag(null);
  };
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [jumpPage, setJumpPage] = useState('');

  useEffect(() => {
    setCurrentPage(1);
  }, [characters.length, itemsPerPage, sortOption, activeFilter]);

  // Compute unique tags (excluding collections)
  const allTags = useMemo(() => {
    const tags = new Set<string>(customTags);
    characters.forEach(c => {
      const currentTags = Array.isArray(c.tags) ? c.tags : [];
      currentTags.forEach(t => {
          if (!collections.includes(t)) {
              tags.add(t);
          }
      });
    });
    return Array.from(tags).sort();
  }, [characters, customTags, collections]);

  const duplicateIds = useMemo(() => {
    const seenNames = new Map<string, string[]>();
    const ids = new Set<string>();
    
    characters.forEach(c => {
        const existing = seenNames.get(c.name) || [];
        seenNames.set(c.name, [...existing, c.id]);
    });

    seenNames.forEach((idsList) => {
        if (idsList.length > 1) {
            idsList.forEach(id => ids.add(id));
        }
    });
    return ids;
  }, [characters]);

  const filteredCharacters = useMemo(() => {
    let result = characters;
    
    // Apply Active Filter
    if (activeFilter.type === 'favorite') {
        result = result.filter(c => c.isFavorite);
    } else if (activeFilter.type === 'tag' && activeFilter.value) {
        result = result.filter(c => (Array.isArray(c.tags) ? c.tags : []).includes(activeFilter.value!));
    } else if (activeFilter.type === 'collection' && activeFilter.value) {
        result = result.filter(c => (Array.isArray(c.tags) ? c.tags : []).includes(activeFilter.value!));
    } else if (activeFilter.type === 'duplicate') {
        result = result.filter(c => duplicateIds.has(c.id));
    }
    
    // Sorting
    return [...result].sort((a, b) => {
        if (sortOption === 'updated-desc') {
            return (b.updatedAt || b.importDate || 0) - (a.updatedAt || a.importDate || 0);
        } else if (sortOption === 'date-desc') {
            return (b.importDate || 0) - (a.importDate || 0);
        } else if (sortOption === 'date-asc') {
            return (a.importDate || 0) - (b.importDate || 0);
        } else if (sortOption === 'name-asc') {
            return a.name.localeCompare(b.name);
        } else if (sortOption === 'name-desc') {
            return b.name.localeCompare(a.name);
        }
        return 0;
    });
  }, [characters, duplicateIds, sortOption, activeFilter]);

  const groupedCharacters = useMemo<Record<string, Character[]> | null>(() => {
    if (activeFilter.type !== 'duplicate') return null;
    const groups: Record<string, Character[]> = {};
    filteredCharacters.forEach(c => {
      if (!groups[c.name]) groups[c.name] = [];
      groups[c.name].push(c);
    });
    return groups;
  }, [filteredCharacters, activeFilter]);

  const displayCharacters = useMemo(() => {
    if (activeFilter.type === 'duplicate') return []; // Not used in grouped mode
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredCharacters.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredCharacters, currentPage, itemsPerPage, activeFilter]);

  const totalPages = Math.ceil(filteredCharacters.length / itemsPerPage);

  const renderCharacterCard = (char: Character) => {
    const isDuplicate = duplicateIds.has(char.id);
    const hasQr = char.qrList && char.qrList.length > 0;
    const hasWorldInfo = !!(char.scenario || (char.character_book && char.character_book.entries.length > 0));
    const isSelected = selectedIds.has(char.id);
    const showExportMenu = exportMenuCharId === char.id;

    return (
        <div 
            key={char.id} 
            draggable={!isSelectionMode}
            onDragStart={() => setDraggingCharId(char.id)}
            onDragEnd={() => setDraggingCharId(null)}
            onClick={() => {
                if (isSelectionMode) toggleSelection(char.id);
                else onSelect(char);
            }}
            className={`
                flex flex-col h-[500px] rounded-[24px] overflow-hidden relative group transition-all duration-300
                ${theme === 'light' 
                    ? 'bg-white shadow-lg hover:shadow-xl border border-slate-200' 
                    : 'bg-[#1a1b1e] shadow-xl hover:shadow-2xl border border-white/10'
                }
                ${isSelected ? 'transform scale-[0.98] border-blue-500/50' : 'hover:-translate-y-1'}
                cursor-pointer
                ${isDuplicate && activeFilter.type !== 'duplicate' && theme === 'dark' ? 'border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.1)]' : ''} 
                ${isDuplicate && activeFilter.type !== 'duplicate' && theme === 'light' ? 'border-yellow-400 shadow-md' : ''}
            `}
        >
        
        {/* Image Section (Top 65%) */}
        <div className="h-[65%] w-full relative overflow-hidden bg-gray-900">
             <img 
                src={char.avatarUrl} 
                alt={char.name} 
                className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
                loading="lazy" 
            />
            {/* Dark gradient overlay */}
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
        </div>

        {/* Content Section */}
        <div className="flex-1 p-4 flex flex-col relative">
            <div className="flex gap-1 mb-1">
                 {isDuplicate && activeFilter.type !== 'duplicate' && <AlertTriangle size={12} className="text-yellow-500"/>}
            </div>

            <div className="mb-2">
                <div className="flex items-center gap-2 mb-1">
                    <h3 className={`text-lg font-bold truncate leading-tight ${theme === 'light' ? 'text-gray-900' : 'text-gray-100'}`} title={char.name}>
                        {char.name}
                    </h3>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        {hasQr && <QrCode size={14} className="text-green-500" title="包含二维码配置" />}
                        {hasWorldInfo && <Book size={14} className="text-yellow-500" title="包含世界书" />}
                    </div>
                </div>
                <div className={`flex items-center gap-1.5 text-[11px] font-medium truncate ${theme === 'light' ? 'text-gray-400' : 'text-gray-500'}`} title={char.originalFilename || "Local"}>
                    <FileText size={10} />
                    {char.originalFilename || "local_card.png"}
                </div>
            </div>

            <div className={`h-[90px] shrink-0 rounded-xl p-3 flex flex-col gap-1.5 ${theme === 'light' ? 'bg-gray-50' : 'bg-white/5'}`}>
                 <div className="flex justify-between items-center">
                     <span className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'light' ? 'text-gray-400' : 'text-gray-500'}`}>
                         FIRST MESSAGE
                     </span>
                     <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 ${theme === 'light' ? 'bg-white text-gray-400 shadow-sm' : 'bg-black/20 text-gray-500'}`}>
                         <MessageSquare size={8} /> 
                         <span>{char.firstMessage?.length || 0}</span>
                     </div>
                 </div>
                 <p className={`text-[11px] line-clamp-4 leading-relaxed ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
                     {char.firstMessage || "..."}
                 </p>
            </div>
        </div>

        {/* Selection Overlay (Ring Only) */}
        {isSelected && (
            <div className="absolute inset-0 border-[3px] border-blue-500 rounded-[24px] pointer-events-none z-30"></div>
        )}
        </div>
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setWarning(null);
    setImportingCount(files.length);

    let successCount = 0;
    let failCount = 0;
    const failedFiles: string[] = [];
    const fileArray = Array.from(files) as File[];

    for (const file of fileArray) {
      const isPng = file.name.toLowerCase().endsWith('.png');
      const isJson = file.name.toLowerCase().endsWith('.json');
      
      if (!isPng && !isJson) {
          continue; 
      }
      try {
        let char: Character;
        if (isPng) {
            char = await parseCharacterCard(file);
        } else {
            char = await parseCharacterJson(file);
        }

        if (files.length === 1) {
             const isDuplicateName = characters.some(c => c.name === char.name);
             if (isDuplicateName) {
                setWarning(`注意：检测到可能重复的角色 "${char.name}"`);
             }
        }
        onImport(char);
        successCount++;
      } catch (err: any) {
        console.error(`Failed to import ${file.name}:`, err);
        failCount++;
        failedFiles.push(`${file.name}: ${err.message}`);
      }
    }

    setImportingCount(0);
    if (failCount > 0) {
        setImportResults({ success: successCount, failed: failCount, failedFiles });
        setImportErrorModalOpen(true);
    } else if (files.length > 1) {
        // Optional: show success toast for bulk import
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCharacters.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredCharacters.map(c => c.id)));
  };

  const toggleSelectAllPage = () => {
    const currentList = activeFilter.type === 'duplicate' ? filteredCharacters : displayCharacters;
    const newSet = new Set(selectedIds);
    const allPageSelected = currentList.length > 0 && currentList.every(c => newSet.has(c.id));
    if (allPageSelected) {
        currentList.forEach(c => newSet.delete(c.id));
    } else {
        currentList.forEach(c => newSet.add(c.id));
    }
    setSelectedIds(newSet);
  };

  const handleBulkExport = async () => {
    const selectedChars = characters.filter(c => selectedIds.has(c.id));
    if (selectedChars.length === 0) return;
    try {
        await exportBulkCharacters(selectedChars, collections);
        setIsSelectionMode(false);
        setSelectedIds(new Set());
    } catch (e: any) {
        setError("批量导出失败: " + e.message);
    }
  };

  const handleSingleExport = async (char: Character, format: 'json' | 'png') => {
    setExportMenuCharId(null);
    
    // Check if trying to export PNG from a JSON-imported character (or one without a proper avatar)
    if (format === 'png' && char.importFormat === 'json') {
        // We can check if the avatar is a blob URL (which means they uploaded one) or a picsum URL (placeholder)
        // If it's a placeholder, we should definitely warn.
        if (char.avatarUrl.includes('picsum.photos')) {
             if (!window.confirm("该角色是通过 JSON 导入的，且似乎没有上传自定义头像（当前是随机占位图）。\n导出 PNG 会将数据嵌入到这张占位图中。\n\n确定要继续吗？建议先在编辑页面上传一张图片。")) {
                 return;
             }
        }
    }

    try {
      await exportCharacterData(char, format);
    } catch (err) {
      console.error("Export failed", err);
      setError("导出失败");
    }
  };

  const handleAddTag = () => {
    const tag = newTagInputValue.trim();
    if (tag && !allTags.includes(tag) && !collections.includes(tag)) {
        setCustomTags(prev => [...prev, tag]);
        setNewTagInputValue('');
        setIsAddingTag(false);
    }
  };

  const handleAddCollection = () => {
      const name = newCollectionInputValue.trim();
      if (name && !collections.includes(name) && !allTags.includes(name)) {
          setCollections(prev => [...prev, name]);
          setNewCollectionInputValue('');
          setIsAddingCollection(false);
      }
  };

  const handleDeleteCollection = (name: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm(`确定要删除收藏夹 "${name}" 吗? 这将从所有角色中移除此标签。`)) return;
      
      setCollections(prev => prev.filter(c => c !== name));
      
      // Remove tag from characters
      characters.forEach(char => {
          const currentTags = Array.isArray(char.tags) ? char.tags : [];
          if (currentTags.includes(name)) {
              const newTags = currentTags.filter(t => t !== name);
              onUpdate?.({ ...char, tags: newTags });
          }
      });

      if (activeFilter.type === 'collection' && activeFilter.value === name) {
          setActiveFilter({ type: 'all' });
      }
  };

  const handleDeleteTag = (tagToDelete: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm(`确定要删除标签 "${tagToDelete}" 吗? 这将从所有角色中移除此标签。`)) return;
      
      // Remove from custom tags
      setCustomTags(prev => prev.filter(t => t !== tagToDelete));
      
      // Remove from all characters
      characters.forEach(char => {
          const currentTags = Array.isArray(char.tags) ? char.tags : [];
          if (currentTags.includes(tagToDelete)) {
              const newTags = currentTags.filter(t => t !== tagToDelete);
              onUpdate?.({ ...char, tags: newTags });
          }
      });
      
      if (activeFilter.type === 'tag' && activeFilter.value === tagToDelete) {
          setActiveFilter({ type: 'all' });
      }
  };

  const textColor = theme === 'light' ? 'text-slate-800' : 'text-white';
  const subTextColor = theme === 'light' ? 'text-slate-500' : 'text-blue-200/70';
  const buttonBase = theme === 'light' 
    ? 'bg-white/50 hover:bg-white/80 border-slate-200 text-slate-700 shadow-sm' 
    : 'bg-white/10 hover:bg-white/20 border-white/20 text-white shadow-lg';
  const activeFilterClass = theme === 'light' 
    ? 'bg-blue-100 border-blue-300 text-blue-700' 
    : 'bg-blue-500/30 border-blue-400 text-white';

  return (
    <div className="w-full max-w-[1600px] mx-auto animate-fade-in relative flex h-full gap-6">
      
      {/* Sidebar */}
      <div className={`transition-all duration-300 flex flex-col shrink-0 ${isSidebarOpen ? 'w-64 opacity-100' : 'w-0 opacity-0 overflow-hidden'}`}>
          <div className={`flex-1 rounded-2xl p-4 flex flex-col gap-2 ${theme === 'light' ? 'bg-white/50 border border-slate-200' : 'bg-black/20 border border-white/10'}`}>
              
              {/* All Characters */}
              <button 
                  onClick={() => setActiveFilter({ type: 'all' })}
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold flex items-center gap-3 transition-all duration-300 group ${
                      activeFilter.type === 'all' 
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.02]' 
                          : (theme === 'light' ? 'hover:bg-white/60 text-slate-600 hover:shadow-sm' : 'hover:bg-white/10 text-gray-400')
                  }`}
              >
                  <List size={18} className={activeFilter.type === 'all' ? 'text-white' : ''} />
                  <span>全部角色</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                      activeFilter.type === 'all' 
                          ? 'bg-white/20 text-white' 
                          : 'bg-black/5 text-slate-400 group-hover:bg-black/10'
                  }`}>
                      {characters.length}
                  </span>
              </button>

              {/* Favorites - with drag-to-favorite drop zone */}
              <div
                  onDragOver={e => { e.preventDefault(); setDragOverFavorite(true); }}
                  onDragLeave={() => setDragOverFavorite(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOverFavorite(false);
                    if (draggingCharId) {
                      const char = characters.find(c => c.id === draggingCharId);
                      if (char && !char.isFavorite) onUpdate?.({ ...char, isFavorite: true, updatedAt: Date.now() });
                      setDraggingCharId(null);
                    }
                  }}
                  className={`rounded-xl transition-all duration-200 ${dragOverFavorite ? 'ring-2 ring-pink-400 scale-[1.02]' : ''}`}
              >
              <button 
                  onClick={() => setActiveFilter({ type: 'favorite' })}
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold flex items-center gap-3 transition-all duration-300 group ${
                      activeFilter.type === 'favorite' 
                          ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/30 scale-[1.02]' 
                          : dragOverFavorite
                            ? (theme === 'light' ? 'bg-pink-50 text-pink-600' : 'bg-pink-500/20 text-pink-300')
                            : (theme === 'light' ? 'hover:bg-white/60 text-slate-600 hover:shadow-sm' : 'hover:bg-white/10 text-gray-400')
                  }`}
              >
                  <Heart size={18} className={activeFilter.type === 'favorite' ? 'text-white fill-white' : dragOverFavorite ? 'text-pink-500' : ''} />
                  <span>{dragOverFavorite ? '拖放至收藏' : '收藏'}</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                      activeFilter.type === 'favorite' 
                          ? 'bg-white/20 text-white' 
                          : 'bg-black/5 text-slate-400 group-hover:bg-black/10'
                  }`}>
                      {characters.filter(c => c.isFavorite).length}
                  </span>
              </button>
              </div>

              {/* Duplicates */}
              <button 
                  onClick={() => setActiveFilter({ type: 'duplicate' })}
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold flex items-center gap-3 transition-all duration-300 group ${
                      activeFilter.type === 'duplicate' 
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.02]' 
                          : (theme === 'light' ? 'hover:bg-white/60 text-slate-600 hover:shadow-sm' : 'hover:bg-white/10 text-gray-400')
                  }`}
              >
                  <Copy size={18} className={activeFilter.type === 'duplicate' ? 'text-white' : ''} />
                  <span>重复角色</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                      activeFilter.type === 'duplicate' 
                          ? 'bg-white/20 text-white' 
                          : 'bg-black/5 text-slate-400 group-hover:bg-black/10'
                  }`}>
                      {duplicateIds.size}
                  </span>
              </button>

              <div className={`h-px my-3 mx-2 ${theme === 'light' ? 'bg-slate-200/60' : 'bg-white/5'}`}></div>

              {/* Collections Header */}
              <div className={`w-full px-2 py-2 flex items-center justify-between`}>
                  <button 
                      onClick={() => setIsCollectionsExpanded(!isCollectionsExpanded)}
                      className={`flex-1 text-left font-bold text-xs uppercase tracking-wider flex items-center gap-2 ${theme === 'light' ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                      <Folder size={14} />
                      <span>收藏夹 ({collections.length})</span>
                      {isCollectionsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <button 
                      onClick={() => setIsAddingCollection(!isAddingCollection)}
                      className={`p-1 rounded-md transition-colors ${theme === 'light' ? 'hover:bg-slate-200 text-slate-400 hover:text-slate-600' : 'hover:bg-white/10 text-gray-500 hover:text-gray-300'}`}
                      title="新建收藏夹"
                  >
                      <FolderPlus size={14} />
                  </button>
              </div>

              {/* Collections List */}
              <div 
                  className={`overflow-y-auto custom-scrollbar space-y-1 transition-all duration-300 mb-2 shrink-0 ${isCollectionsExpanded ? 'opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}
                  style={isCollectionsExpanded ? { maxHeight: `${collectionsHeight}px` } : {}}
              >
                  {isAddingCollection && (
                      <div className="px-2 mb-2">
                          <input
                              autoFocus
                              type="text"
                              value={newCollectionInputValue}
                              onChange={(e) => setNewCollectionInputValue(e.target.value)}
                              onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddCollection();
                                  if (e.key === 'Escape') setIsAddingCollection(false);
                              }}
                              onBlur={() => {
                                  if (newCollectionInputValue.trim()) handleAddCollection();
                                  else setIsAddingCollection(false);
                              }}
                              placeholder="收藏夹名称..."
                              className={`w-full px-3 py-2 rounded-xl text-sm outline-none border ${theme === 'light' ? 'bg-white border-blue-500 text-slate-800' : 'bg-black/40 border-blue-500 text-white'}`}
                          />
                      </div>
                  )}
                  {collections.map(name => (
                      <div key={name} className="relative group">
                          {editingCollection === name ? (
                              <input
                                  autoFocus
                                  type="text"
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleFinishRenameCollection();
                                      if (e.key === 'Escape') setEditingCollection(null);
                                  }}
                                  onBlur={handleFinishRenameCollection}
                                  className={`w-full px-3 py-2 rounded-xl text-sm outline-none border ${theme === 'light' ? 'bg-white border-blue-500 text-slate-800' : 'bg-black/40 border-blue-500 text-white'}`}
                              />
                          ) : (
                              <button
                                  onClick={() => setActiveFilter({ type: 'collection', value: name })}
                                  onDoubleClick={(e) => handleStartRenameCollection(name, e)}
                                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all group relative ${activeFilter.type === 'collection' && activeFilter.value === name ? (theme === 'light' ? 'bg-slate-200 text-slate-900' : 'bg-white/20 text-white') : (theme === 'light' ? 'hover:bg-white/50 text-slate-500' : 'hover:bg-white/5 text-gray-400')}`}
                              >
                                  <Folder size={14} className="opacity-70" />
                                  <span className="truncate flex-1">{name}</span>
                                  <span className="text-[10px] opacity-50 group-hover:opacity-0 transition-opacity">{characters.filter(c => (Array.isArray(c.tags) ? c.tags : []).includes(name)).length}</span>
                                  
                                  {/* Actions */}
                                  <div className={`absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all`}>
                                      <div 
                                          onClick={(e) => handleStartRenameCollection(name, e)}
                                          className={`p-1.5 rounded-lg ${theme === 'light' ? 'hover:bg-blue-100 text-blue-400' : 'hover:bg-blue-500/20 text-blue-400'}`}
                                          title="重命名"
                                      >
                                          <Edit2 size={12} />
                                      </div>
                                      <div 
                                          onClick={(e) => handleDeleteCollection(name, e)}
                                          className={`p-1.5 rounded-lg ${theme === 'light' ? 'hover:bg-red-100 text-red-400' : 'hover:bg-red-500/20 text-red-400'}`}
                                          title="删除"
                                      >
                                          <Trash2 size={12} />
                                      </div>
                                  </div>
                              </button>
                          )}
                      </div>
                  ))}
                  {collections.length === 0 && !isAddingCollection && (
                      <div className={`text-center py-4 text-xs ${theme === 'light' ? 'text-slate-400' : 'text-gray-600'}`}>
                          暂无收藏夹
                      </div>
                  )}
              </div>

              {/* Resize Handle for Collections */}
              <div 
                  className={`h-1.5 my-1 mx-2 shrink-0 cursor-row-resize flex items-center justify-center group transition-colors rounded-full ${resizingTarget === 'collections' ? 'bg-blue-500/50' : (theme === 'light' ? 'hover:bg-slate-200' : 'hover:bg-white/10')}`}
                  onMouseDown={(e) => {
                      e.preventDefault();
                      setResizingTarget('collections');
                  }}
              >
                  <div className={`w-8 h-1 rounded-full transition-colors ${resizingTarget === 'collections' ? 'bg-blue-500' : (theme === 'light' ? 'bg-slate-300 group-hover:bg-slate-400' : 'bg-white/20 group-hover:bg-white/40')}`}></div>
              </div>

              {/* Tags Header */}
              <div className={`w-full px-2 py-2 flex items-center justify-between shrink-0`}>
                  <button 
                      onClick={() => setIsTagsExpanded(!isTagsExpanded)}
                      className={`flex-1 text-left font-bold text-xs uppercase tracking-wider flex items-center gap-2 ${theme === 'light' ? 'text-slate-400 hover:text-slate-600' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                      <Tag size={14} />
                      <span>标签 ({allTags.length})</span>
                      {isTagsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <button 
                      onClick={() => setIsAddingTag(!isAddingTag)}
                      className={`p-1 rounded-md transition-colors ${theme === 'light' ? 'hover:bg-slate-200 text-slate-400 hover:text-slate-600' : 'hover:bg-white/10 text-gray-500 hover:text-gray-300'}`}
                      title="Add Tag"
                  >
                      <Plus size={14} />
                  </button>
              </div>

              {/* Tags List */}
              <div 
                  className={`min-h-0 overflow-y-auto custom-scrollbar space-y-1 transition-all duration-300 shrink-0 ${isTagsExpanded ? 'opacity-100' : 'h-0 opacity-0 overflow-hidden'}`}
                  style={isTagsExpanded ? { height: `${tagsHeight}px` } : {}}
              >
                  {isAddingTag && (
                      <div className="px-2 mb-2">
                          <input
                              autoFocus
                              type="text"
                              value={newTagInputValue}
                              onChange={(e) => setNewTagInputValue(e.target.value)}
                              onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddTag();
                                  if (e.key === 'Escape') setIsAddingTag(false);
                              }}
                              onBlur={() => {
                                  if (newTagInputValue.trim()) handleAddTag();
                                  else setIsAddingTag(false);
                              }}
                              placeholder="New tag..."
                              className={`w-full px-3 py-2 rounded-xl text-sm outline-none border ${theme === 'light' ? 'bg-white border-blue-500 text-slate-800' : 'bg-black/40 border-blue-500 text-white'}`}
                          />
                      </div>
                  )}
                  {allTags.map(tag => (
                      <div key={tag} className="relative group">
                          {editingTag === tag ? (
                              <input
                                  autoFocus
                                  type="text"
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleFinishRenameTag();
                                      if (e.key === 'Escape') setEditingTag(null);
                                  }}
                                  onBlur={handleFinishRenameTag}
                                  className={`w-full px-3 py-2 rounded-xl text-sm outline-none border ${theme === 'light' ? 'bg-white border-blue-500 text-slate-800' : 'bg-black/40 border-blue-500 text-white'}`}
                              />
                          ) : (
                              <button
                                  onClick={() => setActiveFilter({ type: 'tag', value: tag })}
                                  onDoubleClick={(e) => handleStartRenameTag(tag, e)}
                                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all group relative ${activeFilter.type === 'tag' && activeFilter.value === tag ? (theme === 'light' ? 'bg-slate-200 text-slate-900' : 'bg-white/20 text-white') : (theme === 'light' ? 'hover:bg-white/50 text-slate-500' : 'hover:bg-white/5 text-gray-400')}`}
                              >
                                  <span className="truncate flex-1"># {tag}</span>
                                  <span className="text-[10px] opacity-50 group-hover:opacity-0 transition-opacity">{characters.filter(c => (Array.isArray(c.tags) ? c.tags : []).includes(tag)).length}</span>
                                  
                                  {/* Actions */}
                                  <div className={`absolute right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all`}>
                                      <div 
                                          onClick={(e) => handleStartRenameTag(tag, e)}
                                          className={`p-1.5 rounded-lg ${theme === 'light' ? 'hover:bg-blue-100 text-blue-400' : 'hover:bg-blue-500/20 text-blue-400'}`}
                                          title="重命名"
                                      >
                                          <Edit2 size={12} />
                                      </div>
                                      <div 
                                          onClick={(e) => handleDeleteTag(tag, e)}
                                          className={`p-1.5 rounded-lg ${theme === 'light' ? 'hover:bg-red-100 text-red-400' : 'hover:bg-red-500/20 text-red-400'}`}
                                          title="删除"
                                      >
                                          <Trash2 size={12} />
                                      </div>
                                  </div>
                              </button>
                          )}
                      </div>
                  ))}
                  {allTags.length === 0 && !isAddingTag && (
                      <div className={`text-center py-4 text-xs ${theme === 'light' ? 'text-slate-400' : 'text-gray-600'}`}>
                          暂无标签
                      </div>
                  )}
              </div>

              {/* Resize Handle for Tags */}
              <div 
                  className={`h-1.5 my-1 mx-2 shrink-0 cursor-row-resize flex items-center justify-center group transition-colors rounded-full ${resizingTarget === 'tags' ? 'bg-blue-500/50' : (theme === 'light' ? 'hover:bg-slate-200' : 'hover:bg-white/10')}`}
                  onMouseDown={(e) => {
                      e.preventDefault();
                      setResizingTarget('tags');
                  }}
              >
                  <div className={`w-8 h-1 rounded-full transition-colors ${resizingTarget === 'tags' ? 'bg-blue-500' : (theme === 'light' ? 'bg-slate-300 group-hover:bg-slate-400' : 'bg-white/20 group-hover:bg-white/40')}`}></div>
              </div>

              {/* Spacer to fill remaining space */}
              <div className="flex-1 min-h-0"></div>
          </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full min-w-0">
      {/* Header Controls */}
      <div className="flex flex-col xl:flex-row justify-between items-end mb-4 px-2 gap-4 shrink-0">
        <div className="flex items-center gap-4">
           <button 
               onClick={() => setIsSidebarOpen(!isSidebarOpen)}
               className={`p-2 rounded-xl transition-colors ${theme === 'light' ? 'bg-white/50 hover:bg-white text-slate-600' : 'bg-white/5 hover:bg-white/10 text-gray-300'}`}
           >
               {isSidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
           </button>
           <div>
               <h1 className={`text-2xl font-bold mb-1 tracking-tight drop-shadow-sm ${textColor}`}>
                   {activeFilter.type === 'all' && '全部角色'}
                   {activeFilter.type === 'tag' && `# ${activeFilter.value}`}
                   {activeFilter.type === 'collection' && `${activeFilter.value}`}
                   {activeFilter.type === 'duplicate' && '重复角色'}
               </h1>
               <p className={`text-xs ${subTextColor}`}>
                   {activeFilter.type === 'all' && `共 ${characters.length} 张卡片`}
                   {activeFilter.type === 'tag' && `标签 "${activeFilter.value}" 下共 ${characters.filter(c => (Array.isArray(c.tags) ? c.tags : []).includes(activeFilter.value!)).length} 张卡片`}
                   {activeFilter.type === 'collection' && `收藏夹 "${activeFilter.value}" 下共 ${characters.filter(c => (Array.isArray(c.tags) ? c.tags : []).includes(activeFilter.value!)).length} 张卡片`}
                   {activeFilter.type === 'duplicate' && `共 ${duplicateIds.size} 张重复卡片`}
               </p>
           </div>
        </div>
        
        <div className="flex flex-wrap gap-2 items-center justify-end">
            <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-full text-xs font-medium backdrop-blur-sm ${buttonBase}`}>
                <span className="opacity-70">排序:</span>
                <select 
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as any)}
                    className="bg-transparent border-none outline-none cursor-pointer font-bold appearance-none"
                    style={{ textAlignLast: 'center' }}
                >
                    <option value="updated-desc" className="text-black">最近修改</option>
                    <option value="date-desc" className="text-black">最新导入</option>
                    <option value="date-asc" className="text-black">最早导入</option>
                    <option value="name-asc" className="text-black">名称 A-Z</option>
                    <option value="name-desc" className="text-black">名称 Z-A</option>
                </select>
                <ChevronDown size={10} className="opacity-50"/>
            </div>

            <button
                onClick={() => {
                    setIsSelectionMode(!isSelectionMode);
                    setSelectedIds(new Set());
                }}
                className={`flex items-center gap-2 px-3 py-1.5 border rounded-full text-xs font-medium backdrop-blur-sm transition-all ${isSelectionMode ? activeFilterClass : buttonBase}`}
            >
                <CheckSquare size={12} />
                {isSelectionMode ? '取消' : '多选'}
            </button>

            <input type="file" accept="image/png,application/json" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            {/* @ts-ignore */}
            <input type="file" webkitdirectory="" directory="" multiple className="hidden" ref={folderInputRef} onChange={handleFileChange} />

            <div className="flex gap-1">
                <button 
                    onClick={() => folderInputRef.current?.click()}
                    disabled={importingCount > 0}
                    className={`flex items-center gap-2 px-4 py-1.5 border rounded-l-full font-medium backdrop-blur-sm transition-all hover:brightness-110 text-xs ${buttonBase}`}
                    title="导入整个文件夹"
                >
                    <FolderInput size={14} /> 文件夹
                </button>
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importingCount > 0}
                    className={`flex items-center gap-2 px-4 py-1.5 border rounded-r-full font-medium backdrop-blur-sm transition-all hover:brightness-110 text-xs border-l-0 ${buttonBase}`}
                    title="导入文件"
                >
                    <Upload size={14} /> 文件
                </button>
            </div>
             {importingCount > 0 && (
                <div className="flex items-center gap-2 text-xs text-blue-400 animate-pulse">
                    <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
        </div>
      </div>
      
      {/* Bulk Action Bar */}
      {isSelectionMode && (
          <div className={`mb-4 mx-2 p-3 rounded-2xl flex items-center justify-between backdrop-blur-xl shadow-lg border animate-slide-down z-20 ${
              theme === 'light' 
                  ? 'bg-blue-50/90 border-blue-100 text-blue-900' 
                  : 'bg-blue-900/20 border-blue-500/20 text-blue-100'
          }`}>
             <div className="flex items-center gap-4 px-2">
                 <div className="flex items-center gap-3">
                     {activeFilter.type !== 'duplicate' && (
                         <button onClick={toggleSelectAllPage} className="flex items-center gap-2 text-sm font-bold hover:opacity-80 transition-opacity">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                                displayCharacters.length > 0 && displayCharacters.every(c => selectedIds.has(c.id))
                                    ? 'bg-blue-500 border-blue-500 text-white'
                                    : 'bg-transparent border-current'
                            }`}>
                                {displayCharacters.length > 0 && displayCharacters.every(c => selectedIds.has(c.id)) && <Check size={14} strokeWidth={3} />}
                            </div>
                            全选本页
                         </button>
                     )}
                     <button onClick={toggleSelectAll} className="flex items-center gap-2 text-sm font-bold hover:opacity-80 transition-opacity">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                            selectedIds.size === filteredCharacters.length && filteredCharacters.length > 0
                                ? 'bg-blue-500 border-blue-500 text-white'
                                : 'bg-transparent border-current'
                        }`}>
                            {selectedIds.size === filteredCharacters.length && filteredCharacters.length > 0 && <Check size={14} strokeWidth={3} />}
                        </div>
                        全选全部
                     </button>
                     {selectedIds.size > 0 && (
                         <button onClick={() => setSelectedIds(new Set())} className="text-sm font-bold opacity-70 hover:opacity-100 transition-opacity ml-2">
                            取消选择
                         </button>
                     )}
                 </div>
                 <span className="text-sm font-bold opacity-80 border-l border-current pl-4">已选 {selectedIds.size} 项</span>
             </div>
             <div className="flex gap-3">
                 {selectedIds.size === 2 && (
                     <Button 
                         variant="secondary" 
                         onClick={() => setCompareModalOpen(true)} 
                         className="!py-1.5 !px-4 !text-xs !h-9 !rounded-lg shadow-sm hover:shadow-md transition-all bg-indigo-500 hover:bg-indigo-600 text-white border-none"
                     >
                        <GitCompare size={14} className="mr-1.5" /> 对比选中 (2)
                     </Button>
                 )}
                 <Button 
                     variant="primary" 
                     disabled={selectedIds.size === 0} 
                     onClick={handleBulkExport} 
                     className="!py-1.5 !px-4 !text-xs !h-9 !rounded-lg shadow-sm hover:shadow-md transition-all bg-blue-500 hover:bg-blue-600 border-none"
                 >
                    <Download size={14} className="mr-1.5" /> 导出 (ZIP)
                 </Button>
                 <Button 
                     variant="danger" 
                     disabled={selectedIds.size === 0} 
                     onClick={() => {if(window.confirm(`确定删除这 ${selectedIds.size} 张卡片吗?`)) { onDeleteBatch?.(Array.from(selectedIds)); setSelectedIds(new Set()); }}} 
                     className="!py-1.5 !px-4 !text-xs !h-9 !rounded-lg shadow-sm hover:shadow-md transition-all bg-red-500 hover:bg-red-600 border-none"
                 >
                    <Trash2 size={14} className="mr-1.5" /> 删除
                 </Button>
             </div>
          </div>
      )}

      {error && <div className="mb-4 mx-2 p-3 bg-red-500/20 border border-red-500/40 rounded-xl flex items-center gap-3 text-red-100 backdrop-blur-md text-sm"><AlertCircle className="text-red-400" size={16} />{error}</div>}
      {warning && <div className="mb-4 mx-2 p-3 bg-yellow-500/20 border border-yellow-500/40 rounded-xl flex items-center gap-3 text-yellow-100 backdrop-blur-md text-sm"><AlertTriangle className="text-yellow-400" size={16} />{warning}</div>}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-20 custom-scrollbar">
        {activeFilter.type === 'duplicate' && groupedCharacters ? (
            <div className="px-2 space-y-8">
                {Object.entries(groupedCharacters).map(([name, chars]: [string, Character[]]) => (
                    <div key={name} className="animate-fade-in">
                        {/* Group Header */}
                        <div className="flex items-center justify-between mb-4 pl-2 pr-4">
                            <div className="flex items-center">
                                <div className="w-1 h-6 bg-red-500 rounded-full mr-3 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                                <h2 className={`text-lg font-bold ${textColor}`}>{name}</h2>
                                <span className="px-2 py-0.5 bg-red-500/10 text-red-500 text-xs font-bold rounded-full ml-3 border border-red-500/20">
                                    {chars.length} 张
                                </span>
                            </div>
                            <Button 
                                variant="secondary" 
                                disabled={chars.filter(c => selectedIds.has(c.id)).length !== 2}
                                onClick={() => setCompareModalOpen(true)} 
                                className="!py-1 !px-3 !text-xs !h-8 !rounded-lg shadow-sm hover:shadow-md transition-all bg-indigo-500 hover:bg-indigo-600 text-white border-none disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <GitCompare size={12} className="mr-1.5" /> 对比选中 (2)
                            </Button>
                        </div>
                        {/* Group Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
                            {chars.map(char => renderCharacterCard(char))}
                        </div>
                    </div>
                ))}
                {Object.keys(groupedCharacters).length === 0 && (
                    <div className={`text-center py-20 opacity-50 ${textColor}`}>没有发现重复角色</div>
                )}
            </div>
        ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 px-2">
                {displayCharacters.map((char) => renderCharacterCard(char))}
            </div>
        )}

        {/* Pagination (Only for non-grouped view) */}
        {activeFilter.type !== 'duplicate' && totalPages > 1 && (
            <div className={`flex justify-between items-center gap-4 mt-6 mb-8 px-4 py-3 rounded-2xl ${theme === 'light' ? 'bg-white shadow-sm border border-slate-200' : 'bg-black/20 border border-white/10'}`}>
                {/* Left: Items Per Page */}
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>每页显示</span>
                    <div className="relative">
                        <select 
                            value={itemsPerPage}
                            onChange={(e) => setItemsPerPage(Number(e.target.value))}
                            className={`appearance-none pl-3 pr-8 py-1.5 rounded-lg text-xs font-bold outline-none cursor-pointer transition-colors ${theme === 'light' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                        >
                            {[20, 30, 50, 100, 250, 500, 1000].map(size => (
                                <option key={size} value={size} className="text-black">{size}</option>
                            ))}
                        </select>
                        <ChevronDown size={12} className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${theme === 'light' ? 'text-slate-500' : 'text-white/50'}`} />
                    </div>
                </div>

                {/* Center: Navigation */}
                <div className={`flex items-center gap-4 px-4 py-1.5 rounded-xl ${theme === 'light' ? 'bg-slate-50' : 'bg-white/5'}`}>
                    <button 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                        disabled={currentPage === 1} 
                        className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${theme === 'light' ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-gray-300'}`}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className={`text-xs font-bold font-mono ${theme === 'light' ? 'text-slate-700' : 'text-gray-200'}`}>
                        {currentPage} / {totalPages}
                    </span>
                    <button 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                        disabled={currentPage === totalPages} 
                        className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${theme === 'light' ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-gray-300'}`}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>

                {/* Right: Jump To */}
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>跳转至</span>
                    <input 
                        type="number" 
                        min={1} 
                        max={totalPages}
                        value={jumpPage}
                        onChange={(e) => setJumpPage(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                const page = parseInt(jumpPage);
                                if (page >= 1 && page <= totalPages) {
                                    setCurrentPage(page);
                                    setJumpPage('');
                                }
                            }
                        }}
                        className={`w-12 px-2 py-1.5 text-center text-xs font-bold rounded-lg outline-none transition-all ${theme === 'light' ? 'bg-white border border-slate-200 focus:border-blue-500 text-slate-700' : 'bg-black/20 border border-white/10 focus:border-blue-500/50 text-white'}`}
                    />
                    <button 
                        onClick={() => {
                            const page = parseInt(jumpPage);
                            if (page >= 1 && page <= totalPages) {
                                setCurrentPage(page);
                                setJumpPage('');
                            }
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-colors ${theme === 'light' ? 'bg-slate-800 hover:bg-slate-900' : 'bg-white/10 hover:bg-white/20'}`}
                    >
                        Go
                    </button>
                </div>
            </div>
        )}
      </div>
      </div>
      {/* Import Error Modal */}
      <Modal
        isOpen={importErrorModalOpen}
        onClose={() => setImportErrorModalOpen(false)}
        title="导入结果"
        theme={theme}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
             <div className="text-green-500 font-bold">成功: {importResults?.success}</div>
             <div className="text-red-500 font-bold">失败: {importResults?.failed}</div>
          </div>
          
          {importResults && (importResults as ImportResults).failedFiles.length > 0 && (
            <div className="mt-4">
              <h4 className="font-semibold mb-2 text-sm uppercase tracking-wider opacity-70">失败文件详情</h4>
              <div className={`rounded-lg p-3 text-sm font-mono overflow-x-auto ${theme === 'light' ? 'bg-red-50 text-red-800' : 'bg-red-900/20 text-red-200'}`}>
                <ul className="list-disc list-inside space-y-1">
                  {(importResults as ImportResults).failedFiles.map((msg, idx) => (
                    <li key={idx} className="break-all">{msg}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          
          <div className="flex justify-end mt-6">
            <Button onClick={() => setImportErrorModalOpen(false)} variant="primary">
              关闭
            </Button>
          </div>
        </div>
      </Modal>

      {/* Compare Modal */}
      {compareModalOpen && selectedIds.size === 2 && (() => {
        const [idA, idB] = Array.from(selectedIds);
        const charA = characters.find(c => c.id === idA);
        const charB = characters.find(c => c.id === idB);
        if (!charA || !charB) return null;

        const diffClass = (a: number, b: number) =>
          a !== b ? (theme === 'light' ? 'ring-2 ring-rose-300 bg-rose-50/60' : 'ring-2 ring-rose-500/40 bg-rose-500/10') : '';
        const biggerClass = (a: number, b: number) =>
          a > b ? 'text-green-600 font-black' : a < b ? 'text-rose-500 font-black' : (theme === 'light' ? 'text-slate-700' : 'text-gray-200');
        const cardBg = theme === 'light' ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10';
        const textColor = theme === 'light' ? 'text-slate-800' : 'text-white';
        const subColor = theme === 'light' ? 'text-slate-500' : 'text-gray-400';

        const Section = ({ label, charX, charY, field }: { label: string, charX: Character, charY: Character, field: keyof Character }) => {
          const valX = String(charX[field] || '');
          const valY = String(charY[field] || '');
          return (
            <div className={`p-4 rounded-2xl border ${cardBg} ${diffClass(valX.length, valY.length)}`}>
              <div className={`text-[10px] font-black uppercase tracking-widest mb-2 ${subColor}`}>{label}</div>
              <div className={`text-2xl font-black mb-2 ${biggerClass(valX.length, valY.length)}`}>{valX.length.toLocaleString()} <span className={`text-xs font-normal ${subColor}`}>字符</span></div>
              <div className={`text-xs font-mono leading-relaxed h-28 overflow-y-auto whitespace-pre-wrap ${subColor} bg-black/5 rounded-lg p-2`}>{valX || '(空)'}</div>
            </div>
          );
        };
        
        return (
          <Modal isOpen={compareModalOpen} onClose={() => setCompareModalOpen(false)} title="档案深度对比 (Diff Check)" theme={theme} maxWidth="max-w-6xl">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 mb-6">
              {/* Card A */}
              <div className={`p-5 rounded-2xl border ${cardBg}`}>
                <div className="flex items-center gap-4 mb-4">
                  <img src={charA.avatarUrl} className="w-16 h-16 rounded-xl object-cover border border-white/10" />
                  <div>
                    <h3 className={`text-lg font-black ${textColor}`}>{charA.name}</h3>
                    <div className={`text-xs font-mono truncate ${subColor}`}>{charA.originalFilename || '—'}</div>
                    {charA.qrList && charA.qrList.length > 0 && (
                      <div className="mt-1 text-[10px] text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-full w-fit">QR ×{charA.qrList.length}</div>
                    )}
                  </div>
                </div>
                <button onClick={() => { if (window.confirm(`删除另一个版本，保留 "${charA.name}"?`)) { onDelete(charB.id); setCompareModalOpen(false); setSelectedIds(new Set()); } }}
                  className="w-full py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-rose-500 transition">保留此版本</button>
              </div>
              {/* VS */}
              <div className={`flex items-center justify-center px-4 text-2xl font-black ${subColor} opacity-30 self-center`}>VS</div>
              {/* Card B */}
              <div className={`p-5 rounded-2xl border ${cardBg}`}>
                <div className="flex items-center gap-4 mb-4">
                  <img src={charB.avatarUrl} className="w-16 h-16 rounded-xl object-cover border border-white/10" />
                  <div>
                    <h3 className={`text-lg font-black ${textColor}`}>{charB.name}</h3>
                    <div className={`text-xs font-mono truncate ${subColor}`}>{charB.originalFilename || '—'}</div>
                    {charB.qrList && charB.qrList.length > 0 && (
                      <div className="mt-1 text-[10px] text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-full w-fit">QR ×{charB.qrList.length}</div>
                    )}
                  </div>
                </div>
                <button onClick={() => { if (window.confirm(`删除另一个版本，保留 "${charB.name}"?`)) { onDelete(charA.id); setCompareModalOpen(false); setSelectedIds(new Set()); } }}
                  className="w-full py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-rose-500 transition">保留此版本</button>
              </div>
            </div>

            {/* Diff Stats */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* World Book comparison */}
              <div className={`p-4 rounded-2xl border ${cardBg} ${diffClass(charA.character_book?.entries?.length||0, charB.character_book?.entries?.length||0)}`}>
                <div className={`text-[10px] font-black uppercase tracking-widest mb-2 ${subColor}`}>世界书 (World Info)</div>
                <div className="flex gap-4">
                  <div>
                    <div className={`text-2xl font-black ${biggerClass(charA.character_book?.entries?.length||0, charB.character_book?.entries?.length||0)}`}>{charA.character_book?.entries?.length || 0} <span className={`text-xs font-normal ${subColor}`}>条</span></div>
                    <div className={`text-xs ${subColor}`}>{charA.name}</div>
                  </div>
                  <div className={`text-2xl ${subColor} opacity-20 self-center`}>vs</div>
                  <div>
                    <div className={`text-2xl font-black ${biggerClass(charB.character_book?.entries?.length||0, charA.character_book?.entries?.length||0)}`}>{charB.character_book?.entries?.length || 0} <span className={`text-xs font-normal ${subColor}`}>条</span></div>
                    <div className={`text-xs ${subColor}`}>{charB.name}</div>
                  </div>
                </div>
              </div>
              {/* Alt Greetings */}
              <div className={`p-4 rounded-2xl border ${cardBg} ${diffClass(charA.alternate_greetings?.length||0, charB.alternate_greetings?.length||0)}`}>
                <div className={`text-[10px] font-black uppercase tracking-widest mb-2 ${subColor}`}>备选开场白数量</div>
                <div className="flex gap-4">
                  <div>
                    <div className={`text-2xl font-black ${biggerClass(charA.alternate_greetings?.length||0, charB.alternate_greetings?.length||0)}`}>{charA.alternate_greetings?.length || 0}</div>
                    <div className={`text-xs ${subColor}`}>{charA.name}</div>
                  </div>
                  <div className={`text-2xl ${subColor} opacity-20 self-center`}>vs</div>
                  <div>
                    <div className={`text-2xl font-black ${biggerClass(charB.alternate_greetings?.length||0, charA.alternate_greetings?.length||0)}`}>{charB.alternate_greetings?.length || 0}</div>
                    <div className={`text-xs ${subColor}`}>{charB.name}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Field diffs side by side */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <Section label="描述 (Description)" charX={charA} charY={charB} field="description" />
                <Section label="开场白 (First Message)" charX={charA} charY={charB} field="firstMessage" />
                <Section label="性格 (Personality)" charX={charA} charY={charB} field="personality" />
              </div>
              <div className="space-y-4">
                <Section label="描述 (Description)" charX={charB} charY={charA} field="description" />
                <Section label="开场白 (First Message)" charX={charB} charY={charA} field="firstMessage" />
                <Section label="性格 (Personality)" charX={charB} charY={charA} field="personality" />
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <Button onClick={() => setCompareModalOpen(false)} variant="primary">关闭</Button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
};

export default CharacterList;
