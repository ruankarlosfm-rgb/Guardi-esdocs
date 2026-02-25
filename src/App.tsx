/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Shield, 
  Lock, 
  Unlock, 
  Plus, 
  Copy, 
  Trash2, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  LogOut,
  CheckCircle2,
  Search,
  KeyRound,
  Wifi,
  FileText,
  Briefcase,
  User,
  Share2,
  Printer,
  Download,
  Upload,
  Image as ImageIcon,
  X,
  Folder,
  ChevronRight,
  MoreVertical,
  Edit2,
  ArrowLeft,
  FolderPlus,
  GripVertical,
  Save,
  FileUp
} from "lucide-react";
import { cn, generatePassword, calculateStrength } from "./lib/utils";
import { db, type PasswordEntry, type DocumentEntry, type FolderEntry } from "./db";
import { deriveKey, encrypt, decrypt } from "./crypto";

// For local master password verification
async function hashPassword(password: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function App() {
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  const [passwords, setPasswords] = useState<(PasswordEntry & { decryptedPassword?: string })[]>([]);
  const [documents, setDocuments] = useState<(DocumentEntry & { decryptedImage?: string })[]>([]);
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [trashPasswords, setTrashPasswords] = useState<(PasswordEntry & { decryptedPassword?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<'all' | 'site' | 'email' | 'wifi' | 'docs' | 'trash'>('all');
  
  // Session key stored in memory
  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);
  
  // Doc/Folder Explorer State
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Generator State
  const [newSite, setNewSite] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newCategory, setNewCategory] = useState<'site' | 'email' | 'wifi'>('site');
  const [newPhone, setNewPhone] = useState("");
  const [passLength, setPassLength] = useState(16);
  const [showGenerator, setShowGenerator] = useState(false);
  
  // Doc Modal State
  const [showDocModal, setShowDocModal] = useState(false);
  const [newDocName, setNewDocName] = useState("");
  const [newDocImage, setNewDocImage] = useState<string | null>(null);

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  const [copiedId, setCopiedId] = useState<number | string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [deleteType, setDeleteType] = useState<'password' | 'document' | 'folder'>('password');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    checkStatus();
    
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    });

    window.addEventListener('appinstalled', () => {
      setShowInstallBtn(false);
      setDeferredPrompt(null);
    });
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBtn(false);
    }
    setDeferredPrompt(null);
  };

  const checkStatus = async () => {
    try {
      const setup = await db.config.get('master_hash');
      setIsSetup(!!setup);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const fetchPasswords = async (key: CryptoKey) => {
    try {
      const allPasswords = await db.passwords.where('deleted_at').equals(0).toArray();
      const decryptedPasswords = await Promise.all(allPasswords.map(async p => ({
        ...p,
        decryptedPassword: await decrypt(p.encrypted_password, key, p.iv, p.tag)
      })));
      setPasswords(decryptedPasswords);

      const allTrash = await db.passwords.where('deleted_at').above(0).toArray();
      const decryptedTrash = await Promise.all(allTrash.map(async p => ({
        ...p,
        decryptedPassword: await decrypt(p.encrypted_password, key, p.iv, p.tag)
      })));
      setTrashPasswords(decryptedTrash);

      const allDocs = await db.documents.where('deleted_at').equals(0).toArray();
      const decryptedDocs = await Promise.all(allDocs.map(async d => ({
        ...d,
        decryptedImage: await decrypt(d.encrypted_image, key, d.iv, d.tag)
      })));
      setDocuments(decryptedDocs);

      const allFolders = await db.folders.where('deleted_at').equals(0).toArray();
      setFolders(allFolders);
    } catch (e) {
      console.error("Error fetching/decrypting data:", e);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const hash = await hashPassword(masterPassword);
      const salt = crypto.getRandomValues(new Uint8Array(16)).join("");
      
      await db.config.put({ key: 'master_hash', value: hash });
      await db.config.put({ key: 'master_salt', value: salt });
      
      const key = await deriveKey(masterPassword, salt);
      setSessionKey(key);
      setIsSetup(true);
      setIsUnlocked(true);
      fetchPasswords(key);
    } catch (e) {
      setError("Erro ao configurar o cofre.");
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const hashRow = await db.config.get('master_hash');
      const saltRow = await db.config.get('master_salt');
      
      const inputHash = await hashPassword(masterPassword);
      
      if (hashRow?.value === inputHash) {
        const key = await deriveKey(masterPassword, saltRow!.value);
        setSessionKey(key);
        setIsUnlocked(true);
        fetchPasswords(key);
      } else {
        setError("Senha mestra incorreta");
      }
    } catch (e) {
      setError("Erro ao desbloquear.");
    }
  };

  const handleLock = () => {
    setSessionKey(null);
    setIsUnlocked(false);
    setMasterPassword("");
    setPasswords([]);
    setDocuments([]);
    setFolders([]);
  };

  const handleSavePassword = async () => {
    if (!newSite || !newPass || !sessionKey) return;
    try {
      const { encrypted, iv, tag } = await encrypt(newPass, sessionKey);
      await db.passwords.add({
        site: newSite,
        username: newUsername,
        encrypted_password: encrypted,
        iv,
        tag,
        category: newCategory,
        phone_number: newPhone,
        created_at: Date.now(),
        deleted_at: 0
      });
      fetchPasswords(sessionKey);
      setNewSite("");
      setNewUsername("");
      setNewPass("");
      setNewPhone("");
      setShowGenerator(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: number) => {
    if (!sessionKey) return;
    try {
      await db.passwords.update(id, { deleted_at: Date.now() });
      fetchPasswords(sessionKey);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePermanentDelete = async (id: number) => {
    if (!confirm("Excluir permanentemente? Esta ação não pode ser desfeita.") || !sessionKey) return;
    try {
      await db.passwords.delete(id);
      fetchPasswords(sessionKey);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestore = async (id: number) => {
    if (!sessionKey) return;
    try {
      await db.passwords.update(id, { deleted_at: 0 });
      fetchPasswords(sessionKey);
    } catch (e) {
      console.error(e);
    }
  };

  const copyToClipboard = (text: string, id: number | string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveDoc = async () => {
    if (!newDocName || !newDocImage || !sessionKey) {
      alert("Por favor, insira um nome e selecione uma imagem.");
      return;
    }
    setIsSaving(true);
    try {
      const { encrypted, iv, tag } = await encrypt(newDocImage, sessionKey);
      await db.documents.add({
        name: newDocName,
        folder_id: currentFolderId,
        encrypted_image: encrypted,
        iv,
        tag,
        created_at: Date.now(),
        deleted_at: 0
      });
      await fetchPasswords(sessionKey);
      setNewDocName("");
      setNewDocImage(null);
      setShowDocModal(false);
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar documento. Verifique se a imagem não é muito grande.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName || !sessionKey) return;
    try {
      await db.folders.add({
        name: newFolderName,
        parent_id: currentFolderId,
        created_at: Date.now(),
        deleted_at: 0
      });
      fetchPasswords(sessionKey);
      setNewFolderName("");
      setShowFolderModal(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRenameFolder = async (id: number) => {
    if (!sessionKey) return;
    try {
      await db.folders.update(id, { name: renameValue });
      fetchPasswords(sessionKey);
      setEditingFolderId(null);
      setRenameValue("");
    } catch (e) {
      console.error(e);
    }
  };

  const handleRenameDoc = async (id: number) => {
    if (!sessionKey) return;
    try {
      await db.documents.update(id, { name: renameValue });
      fetchPasswords(sessionKey);
      setEditingDocId(null);
      setRenameValue("");
    } catch (e) {
      console.error(e);
    }
  };

  const handleMoveDoc = async (docId: number, targetFolderId: number | null) => {
    if (!sessionKey) return;
    try {
      await db.documents.update(docId, { folder_id: targetFolderId });
      fetchPasswords(sessionKey);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteFolder = async (id: number) => {
    if (!sessionKey) return;
    try {
      await db.folders.update(id, { deleted_at: Date.now() });
      fetchPasswords(sessionKey);
    } catch (e) {
      console.error(e);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewDocImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteDoc = async (id: number) => {
    if (!sessionKey) return;
    try {
      await db.documents.update(id, { deleted_at: Date.now() });
      fetchPasswords(sessionKey);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePrint = (doc: DocumentEntry & { decryptedImage?: string }) => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head><title>${doc.name}</title></head>
          <body style="margin:0; display:flex; align-items:center; justify-content:center; height:100vh;">
            <img src="${doc.decryptedImage}" style="max-width:100%; max-height:100%; object-fit:contain;">
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleShare = async (doc: DocumentEntry) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: doc.name,
          text: `Documento: ${doc.name}`,
        });
      } catch (e) {
        console.error(e);
      }
    } else {
      alert("Compartilhamento não suportado neste navegador.");
    }
  };

  const handleExportData = async () => {
    if (!sessionKey) return;
    const data = {
      passwords: await db.passwords.toArray(),
      folders: await db.folders.toArray(),
      documents: await db.documents.toArray(),
      config: await db.config.toArray()
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SafeVault_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (confirm("Isso irá substituir seus dados atuais. Continuar?")) {
          await db.passwords.clear();
          await db.folders.clear();
          await db.documents.clear();
          await db.config.clear();
          
          if (data.passwords) await db.passwords.bulkAdd(data.passwords);
          if (data.folders) await db.folders.bulkAdd(data.folders);
          if (data.documents) await db.documents.bulkAdd(data.documents);
          if (data.config) await db.config.bulkAdd(data.config);
          
          alert("Dados importados com sucesso! O app irá reiniciar.");
          window.location.reload();
        }
      } catch (e) {
        alert("Erro ao importar arquivo.");
      }
    };
    reader.readAsText(file);
  };

  const filteredPasswords = (activeTab === 'trash' ? trashPasswords : passwords).filter(p => {
    const matchesSearch = p.site.toLowerCase().includes(search.toLowerCase()) || 
                         p.username.toLowerCase().includes(search.toLowerCase());
    const matchesTab = activeTab === 'all' || activeTab === 'trash' || p.category === activeTab;
    return matchesSearch && matchesTab;
  });

  const currentFolders = folders.filter(f => f.parent_id === currentFolderId && f.name.toLowerCase().includes(search.toLowerCase()));
  const currentDocs = documents.filter(d => d.folder_id === currentFolderId && d.name.toLowerCase().includes(search.toLowerCase()));

  const breadcrumbs = [];
  let tempId = currentFolderId;
  while (tempId !== null) {
    const folder = folders.find(f => f.id === tempId);
    if (folder) {
      breadcrumbs.unshift(folder);
      tempId = folder.parent_id;
    } else {
      tempId = null;
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <motion.div 
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      >
        <Shield className="w-12 h-12 text-zinc-700" />
      </motion.div>
    </div>
  );

  if (!isUnlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-950">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md glass p-8 rounded-3xl shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-zinc-100 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <Shield className="w-8 h-8 text-zinc-950" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {isSetup ? "Cofre Bloqueado" : "Configurar Cofre"}
            </h1>
            <p className="text-zinc-400 text-sm mt-2 text-center">
              {isSetup 
                ? "Insira sua senha mestra para acessar suas credenciais." 
                : "Crie uma senha mestra forte. Ela será usada para criptografar todos os seus dados."}
            </p>
          </div>

          <form onSubmit={isSetup ? handleUnlock : handleSetup} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Senha Mestra
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input 
                  type="password"
                  required
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-zinc-700 transition-all"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            {error && (
              <p className="text-rose-400 text-xs font-medium text-center">{error}</p>
            )}

            <button 
              type="submit"
              className="w-full bg-zinc-100 text-zinc-950 font-bold py-3 rounded-xl hover:bg-white transition-colors flex items-center justify-center gap-2"
            >
              {isSetup ? <Unlock className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
              {isSetup ? "Desbloquear" : "Criar Cofre"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-zinc-800 text-center">
            <p className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] font-mono">
              AES-256-GCM ENCRYPTED • ZERO KNOWLEDGE
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center shadow-lg shadow-white/5">
                <Shield className="w-6 h-6 text-zinc-950" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Guardiãodocs</h1>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Cofre Digital</p>
              </div>
            </div>
            <div className="flex md:hidden gap-2">
              {showInstallBtn && (
                <button 
                  onClick={handleInstallClick}
                  className="bg-emerald-500/10 text-emerald-400 p-2 rounded-xl border border-emerald-500/20"
                  title="Instalar App"
                >
                  <Download className="w-5 h-5" />
                </button>
              )}
              <button 
                onClick={handleExportData}
                className="bg-zinc-900 border border-zinc-800 p-2 rounded-xl text-zinc-400"
                title="Backup"
              >
                <Save className="w-5 h-5" />
              </button>
              <button 
                onClick={handleLock}
                className="bg-zinc-900 border border-zinc-800 p-2 rounded-xl text-zinc-400"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
            {showInstallBtn && (
              <button 
                onClick={handleInstallClick}
                className="hidden md:flex bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl font-bold text-sm items-center gap-2 hover:bg-emerald-500/20 transition-all"
              >
                <Download className="w-4 h-4" />
                Instalar App
              </button>
            )}
            <button 
              onClick={handleExportData}
              className="hidden md:flex bg-zinc-900 border border-zinc-800 text-zinc-400 px-4 py-2 rounded-xl font-bold text-sm items-center gap-2 hover:text-white hover:bg-zinc-800 transition-all shrink-0"
            >
              <Save className="w-4 h-4" />
              Backup
            </button>
            <label className="hidden md:flex bg-zinc-900 border border-zinc-800 text-zinc-400 px-4 py-2 rounded-xl font-bold text-sm items-center gap-2 hover:text-white hover:bg-zinc-800 transition-all shrink-0 cursor-pointer">
              <FileUp className="w-4 h-4" />
              Importar
              <input type="file" className="hidden" accept=".json" onChange={handleImportData} />
            </label>
            {activeTab === 'docs' && (
              <button 
                onClick={() => setShowFolderModal(true)}
                className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:text-white hover:bg-zinc-800 transition-all shrink-0"
              >
                <FolderPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Nova Pasta</span>
                <span className="sm:hidden">Pasta</span>
              </button>
            )}
            <button 
              onClick={() => setShowDocModal(true)}
              className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:text-white hover:bg-zinc-800 transition-all shrink-0"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Novo Documento</span>
              <span className="sm:hidden">Doc</span>
            </button>
            <button 
              onClick={() => setShowGenerator(true)}
              className="bg-zinc-100 text-zinc-950 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-white transition-all shadow-lg shadow-white/5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nova Senha</span>
              <span className="sm:hidden">Senha</span>
            </button>
            <button 
              onClick={handleLock}
              className="hidden md:block bg-zinc-900 border border-zinc-800 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
              title="Bloquear Cofre"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Stats & Search */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="glass p-4 rounded-2xl flex items-center gap-4">
            <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-zinc-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Total</p>
              <p className="text-xl font-bold">{passwords.length}</p>
            </div>
          </div>

          <div className="md:col-span-3 glass p-2 rounded-2xl flex items-center gap-2 overflow-x-auto">
            <div className="flex bg-zinc-900 p-1 rounded-xl shrink-0">
              <button 
                onClick={() => setActiveTab('all')}
                className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", activeTab === 'all' ? "bg-zinc-100 text-zinc-950" : "text-zinc-500 hover:text-white")}
              >
                Todos
              </button>
              <button 
                onClick={() => setActiveTab('email')}
                className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", activeTab === 'email' ? "bg-zinc-100 text-zinc-950" : "text-zinc-500 hover:text-white")}
              >
                Emails
              </button>
              <button 
                onClick={() => setActiveTab('site')}
                className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", activeTab === 'site' ? "bg-zinc-100 text-zinc-950" : "text-zinc-500 hover:text-white")}
              >
                Sites
              </button>
              <button 
                onClick={() => setActiveTab('wifi')}
                className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", activeTab === 'wifi' ? "bg-zinc-100 text-zinc-950" : "text-zinc-500 hover:text-white")}
              >
                Wi-Fi
              </button>
              <button 
                onClick={() => setActiveTab('docs')}
                className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", activeTab === 'docs' ? "bg-zinc-100 text-zinc-950" : "text-zinc-500 hover:text-white")}
              >
                Documentos
              </button>
            </div>
            <div className="h-6 w-px bg-zinc-800 mx-1" />
            <Search className="w-4 h-4 text-zinc-500 ml-1" />
            <input 
              type="text"
              placeholder="Pesquisar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-2 py-2"
            />
          </div>
        </div>

        {/* Content Area */}
        {activeTab === 'docs' ? (
          <div className="space-y-6">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-2 text-sm text-zinc-500 overflow-x-auto whitespace-nowrap pb-2">
              <button 
                onClick={() => setCurrentFolderId(null)}
                className={cn("hover:text-white transition-colors", currentFolderId === null ? "text-white font-bold" : "")}
              >
                Documentos
              </button>
              {breadcrumbs.map((folder, idx) => (
                <React.Fragment key={folder.id}>
                  <ChevronRight className="w-4 h-4 shrink-0" />
                  <button 
                    onClick={() => setCurrentFolderId(folder.id)}
                    className={cn("hover:text-white transition-colors", idx === breadcrumbs.length - 1 ? "text-white font-bold" : "")}
                  >
                    {folder.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {/* Folder List */}
              {currentFolders.map(folder => (
                <motion.div 
                  layout
                  key={folder.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const docId = e.dataTransfer.getData("docId");
                    if (docId) handleMoveDoc(Number(docId), folder.id);
                  }}
                  className="group relative glass p-4 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-white/10 transition-all cursor-pointer"
                  onClick={() => setCurrentFolderId(folder.id)}
                >
                  <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center border border-zinc-800 group-hover:border-zinc-700 transition-all">
                    <Folder className="w-8 h-8 text-amber-400 fill-amber-400/20" />
                  </div>
                  {editingFolderId === folder.id ? (
                    <input 
                      autoFocus
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-center focus:outline-none"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameFolder(folder.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRenameFolder(folder.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="text-xs font-medium text-zinc-300 truncate w-full text-center">{folder.name}</span>
                  )}
                  
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFolderId(folder.id);
                        setRenameValue(folder.name);
                      }}
                      className="p-1 hover:bg-white/10 rounded"
                    >
                      <Edit2 className="w-3 h-3 text-zinc-500" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteType('folder');
                        setShowDeleteConfirm(folder.id);
                      }}
                      className="p-1 hover:bg-rose-500/20 rounded"
                    >
                      <Trash2 className="w-3 h-3 text-rose-500" />
                    </button>
                  </div>
                </motion.div>
              ))}

              {/* Document List */}
              {currentDocs.map(doc => (
                <motion.div 
                  layout
                  key={doc.id}
                  draggable
                  onDragStart={(e: any) => e.dataTransfer.setData("docId", doc.id!.toString())}
                  className="group relative glass p-2 rounded-2xl flex flex-col gap-2 hover:bg-white/10 transition-all cursor-pointer"
                >
                  <div 
                    className="aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800"
                    onClick={() => {
                      const win = window.open();
                      win?.document.write(`
                        <html>
                          <body style="margin:0; background:#000; display:flex; align-items:center; justify-content:center; height:100vh;">
                            <img src="${doc.decryptedImage}" style="max-width:100%; max-height:100%; object-fit:contain;">
                          </body>
                        </html>
                      `);
                    }}
                  >
                    <img src={doc.decryptedImage} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                  </div>
                  
                  <div className="px-2 pb-1">
                    {editingDocId === doc.id ? (
                      <input 
                        autoFocus
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-1 py-0.5 text-[10px] focus:outline-none"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleRenameDoc(doc.id)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRenameDoc(doc.id)}
                      />
                    ) : (
                      <span className="text-[10px] font-medium text-zinc-400 truncate block">{doc.name}</span>
                    )}
                  </div>

                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button 
                      onClick={() => {
                        setEditingDocId(doc.id);
                        setRenameValue(doc.name);
                      }}
                      className="p-1.5 bg-black/60 backdrop-blur-md rounded-lg hover:bg-black/80 transition-all"
                    >
                      <Edit2 className="w-3 h-3 text-white" />
                    </button>
                    <button 
                      onClick={() => {
                        setDeleteType('document');
                        setShowDeleteConfirm(doc.id);
                      }}
                      className="p-1.5 bg-black/60 backdrop-blur-md rounded-lg hover:bg-rose-500 transition-all"
                    >
                      <Trash2 className="w-3 h-3 text-white" />
                    </button>
                  </div>
                  
                  <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="p-1.5 bg-black/60 backdrop-blur-md rounded-lg cursor-grab active:cursor-grabbing">
                      <GripVertical className="w-3 h-3 text-white" />
                    </div>
                  </div>
                </motion.div>
              ))}

              {currentFolders.length === 0 && currentDocs.length === 0 && (
                <div className="col-span-full py-20 text-center glass rounded-3xl border-dashed border-zinc-800">
                  <Folder className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
                  <p className="text-zinc-500">Esta pasta está vazia.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPasswords.length === 0 ? (
              <div className="text-center py-20 glass rounded-3xl border-dashed border-zinc-800">
                <Lock className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
                <p className="text-zinc-500">Nenhuma senha encontrada.</p>
              </div>
            ) : (
              filteredPasswords.map((p) => (
                <motion.div 
                  layout
                  key={p.id}
                  className="glass p-4 rounded-2xl flex items-center justify-between hover:bg-white/10 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center border border-zinc-800 font-bold text-zinc-400">
                      {p.category === 'email' ? '@' : p.category === 'wifi' ? <Wifi className="w-5 h-5" /> : p.site.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm truncate max-w-[120px] sm:max-w-none">{p.site}</h3>
                        <span className="hidden xs:inline text-[8px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 uppercase tracking-widest">
                          {p.category}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 truncate max-w-[150px] sm:max-w-none">{p.username || (p.category === 'wifi' ? 'Rede Wi-Fi' : "Sem usuário")}</p>
                      {p.phone_number && (
                        <p className="hidden sm:block text-[10px] text-zinc-600 font-mono mt-0.5">📞 {p.phone_number}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {activeTab === 'trash' ? (
                      <>
                        <button 
                          onClick={() => handleRestore(p.id)}
                          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-emerald-400 hover:bg-emerald-400/10 transition-all"
                          title="Restaurar"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handlePermanentDelete(p.id)}
                          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-rose-500 hover:bg-rose-500/10 transition-all"
                          title="Excluir Permanentemente"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="hidden md:flex flex-col items-end mr-4">
                          <div className="flex items-center gap-1">
                            <div className={cn("w-2 h-2 rounded-full", calculateStrength(p.decryptedPassword || "").bg.replace('bg-', 'bg-').replace('/20', ''))} />
                            <span className={cn("text-[10px] font-bold uppercase tracking-wider", calculateStrength(p.decryptedPassword || "").color)}>
                              {calculateStrength(p.decryptedPassword || "").label}
                            </span>
                          </div>
                        </div>
                        
                        <button 
                          onClick={() => copyToClipboard(p.decryptedPassword || "", p.id!)}
                          className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all relative"
                        >
                          {copiedId === p.id ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                        
                        <button 
                          onClick={() => {
                            setDeleteType('password');
                            setShowDeleteConfirm(p.id);
                          }}
                          disabled={deletingId === p.id}
                          className={cn(
                            "p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 hover:bg-rose-400/10 transition-all",
                            deletingId === p.id && "opacity-50 cursor-not-allowed animate-pulse"
                          )}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Generator Modal */}
      <AnimatePresence>
        {showGenerator && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGenerator(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg glass p-8 rounded-3xl shadow-2xl"
            >
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Plus className="w-5 h-5 text-zinc-400" />
                Adicionar Nova Credencial
              </h2>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Categoria</label>
                  <div className="flex bg-zinc-900 p-1 rounded-xl">
                    <button 
                      onClick={() => setNewCategory('site')}
                      className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all", newCategory === 'site' ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300")}
                    >
                      Site
                    </button>
                    <button 
                      onClick={() => setNewCategory('email')}
                      className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all", newCategory === 'email' ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300")}
                    >
                      Email
                    </button>
                    <button 
                      onClick={() => setNewCategory('wifi')}
                      className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all", newCategory === 'wifi' ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300")}
                    >
                      Wi-Fi
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      {newCategory === 'email' ? 'Serviço' : newCategory === 'wifi' ? 'Nome da Rede (SSID)' : 'Site / App'}
                    </label>
                    <input 
                      type="text"
                      value={newSite}
                      onChange={(e) => setNewSite(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-700"
                      placeholder={newCategory === 'email' ? 'ex: Gmail' : newCategory === 'wifi' ? 'ex: MinhaCasa_5G' : 'ex: Netflix'}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      {newCategory === 'wifi' ? 'Tipo de Segurança' : 'Usuário / Email'}
                    </label>
                    <input 
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-700"
                      placeholder={newCategory === 'wifi' ? 'ex: WPA2' : "ex: joao@email.com"}
                    />
                  </div>
                </div>

                {newCategory !== 'wifi' && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Número de Telefone (Opcional)</label>
                    <input 
                      type="text"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-700"
                      placeholder="ex: +55 11 99999-9999"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Senha</label>
                    <button 
                      onClick={() => setNewPass(generatePassword(passLength))}
                      className="text-[10px] font-bold text-zinc-400 hover:text-white flex items-center gap-1 uppercase tracking-widest"
                    >
                      <RefreshCw className="w-3 h-3" /> Gerar Forte
                    </button>
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 px-4 text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-zinc-700"
                    />
                    {newPass && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded", calculateStrength(newPass).bg, calculateStrength(newPass).color)}>
                          {calculateStrength(newPass).label}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                    <span>Tamanho: {passLength}</span>
                  </div>
                  <input 
                    type="range"
                    min="8"
                    max="32"
                    value={passLength}
                    onChange={(e) => setPassLength(parseInt(e.target.value))}
                    className="w-full accent-zinc-100"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    onClick={() => setShowGenerator(false)}
                    className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold py-3 rounded-xl hover:bg-zinc-800 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleSavePassword}
                    disabled={!newSite || !newPass}
                    className="flex-1 bg-zinc-100 text-zinc-950 font-bold py-3 rounded-xl hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Salvar no Cofre
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Document Modal */}
      <AnimatePresence>
        {showDocModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDocModal(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg glass p-8 rounded-3xl shadow-2xl"
            >
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-zinc-400" />
                Novo Documento
              </h2>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Nome do Documento</label>
                  <input 
                    type="text"
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveDoc()}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-700"
                    placeholder="ex: RG, CPF, Habilitação"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Imagem do Documento</label>
                  {!newDocImage ? (
                    <label 
                      className="flex flex-col items-center justify-center w-full h-48 bg-zinc-900 border-2 border-dashed border-zinc-800 rounded-xl cursor-pointer hover:bg-zinc-800/50 transition-all"
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type.startsWith('image/')) {
                          const reader = new FileReader();
                          reader.onloadend = () => setNewDocImage(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                    >
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 text-zinc-500 mb-2" />
                        <p className="text-sm text-zinc-400 font-medium">Arraste ou clique para selecionar</p>
                        <p className="text-[10px] text-zinc-600 mt-1">PNG, JPG ou WEBP</p>
                      </div>
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                    </label>
                  ) : (
                    <div className="relative w-full h-48 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
                      <img src={newDocImage} className="w-full h-full object-contain" alt="Preview" />
                      <button 
                        onClick={() => setNewDocImage(null)}
                        className="absolute top-3 right-3 p-1.5 bg-rose-500 rounded-full text-white hover:bg-rose-600 transition-all shadow-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    onClick={() => setShowDocModal(false)}
                    className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold py-3 rounded-xl hover:bg-zinc-800 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleSaveDoc}
                    disabled={!newDocName || !newDocImage || isSaving}
                    className="flex-1 bg-zinc-100 text-zinc-950 font-bold py-3 rounded-xl hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      'Salvar na Pasta'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Folder Modal */}
      <AnimatePresence>
        {showFolderModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFolderModal(false)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm glass p-8 rounded-3xl shadow-2xl"
            >
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-zinc-400" />
                Nova Pasta
              </h2>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Nome da Pasta</label>
                  <input 
                    autoFocus
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-700"
                    placeholder="ex: Documentos Pessoais"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    onClick={() => setShowFolderModal(false)}
                    className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold py-3 rounded-xl hover:bg-zinc-800 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleCreateFolder}
                    disabled={!newFolderName}
                    className="flex-1 bg-zinc-100 text-zinc-950 font-bold py-3 rounded-xl hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Criar Pasta
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm !== null && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(null)}
              className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm glass p-6 rounded-3xl shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-rose-500" />
              </div>
              <h3 className="text-lg font-bold mb-2">
                {deleteType === 'folder' ? 'Excluir pasta?' : 'Mover para a lixeira?'}
              </h3>
              <p className="text-zinc-400 text-sm mb-6">
                {deleteType === 'folder' 
                  ? 'Tem certeza que deseja excluir esta pasta? Todos os itens dentro dela serão afetados.' 
                  : 'Tem certeza que deseja mover este item para a lixeira? Você poderá restaurá-lo mais tarde se precisar.'}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 bg-zinc-900 border border-zinc-800 text-zinc-400 font-bold py-3 rounded-xl hover:bg-zinc-800 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    if (deleteType === 'password') {
                      handleDelete(showDeleteConfirm);
                    } else if (deleteType === 'document') {
                      handleDeleteDoc(showDeleteConfirm);
                    } else if (deleteType === 'folder') {
                      handleDeleteFolder(showDeleteConfirm);
                    }
                    setShowDeleteConfirm(null);
                  }}
                  className="flex-1 bg-rose-500 text-white font-bold py-3 rounded-xl hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Footer Info */}
      <footer className="mt-12 text-center">
        <p className="text-[10px] text-zinc-600 uppercase tracking-[0.3em] font-mono">
          Criptografia Local • AES-256-GCM • PBKDF2
        </p>
      </footer>
    </div>
  );
}
