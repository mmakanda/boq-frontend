'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api, TokenStore } from '@/lib/api';
import type { BOQProject, BOQItem, BOQResponse, RoadDimensions } from '@/types';

const MAX_FILE_MB = 20;
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const ALLOWED_EXTS = ['.pdf', '.png', '.jpg', '.jpeg'];

const PROJECT_TYPES = [
  { value: 'residential', label: '🏠 Residential',    desc: 'Houses, flats, townhouses' },
  { value: 'civil',       label: '🛣 Civil / Roads',   desc: 'Roads, drainage, water reticulation' },
  { value: 'commercial',  label: '🏢 Commercial',      desc: 'Offices, retail, warehouses' },
  { value: 'steel',       label: '🏗 Steel Structure', desc: 'Portal frames, industrial sheds' },
  { value: 'dam',         label: '💧 Dam / Hydraulic', desc: 'Dams, weirs, reservoirs' },
  { value: 'renovation',  label: '🔨 Renovation',      desc: 'Extensions, refurbishments' },
];

export default function BOQPage() {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  const [projects,        setProjects]       = useState<BOQProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<BOQProject | null>(null);
  const [boqData,         setBOQData]         = useState<BOQResponse | null>(null);
  const [activeTab,       setActiveTab]       = useState<'boq' | 'materials' | 'cost'>('boq');
  const [view,            setView]            = useState<'dashboard' | 'new' | 'project'>('dashboard');
  const [uploading,       setUploading]       = useState(false);
  const [processing,      setProcessing]      = useState(false);
  const [exporting,       setExporting]       = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [success,         setSuccess]         = useState<string | null>(null);

  // Inline-edit state lifted to parent so renderRow (a plain fn) can close over it
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editQty,     setEditQty]     = useState('');
  const [editRate,    setEditRate]    = useState('');

  const [newName,      setNewName]      = useState('');
  const [newDesc,      setNewDesc]      = useState('');
  const [newType,      setNewType]      = useState('residential');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError,    setFileError]    = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showRoadModal, setShowRoadModal] = useState(false);
  const [roadDims, setRoadDims] = useState<RoadDimensions>({
    road_length_m: 100,
    carriageway_width_m: 7.0,
    shoulder_width_m: 0.5,
    sidewalk_width_m: 1.5,
  });
  const [roadLoading, setRoadLoading] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!loading && !isAuthenticated) router.replace('/auth/login');
  }, [loading, isAuthenticated, router]);

  useEffect(() => { if (isAuthenticated) loadProjects(); }, [isAuthenticated]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const loadProjects = async () => {
    try { const d = await api.listProjects(); setProjects(d.projects); }
    catch (e: any) { setError(e.message); }
  };

  const loadBOQ = async (projectId: string) => {
    try { setBOQData(await api.getBOQ(projectId)); }
    catch (e: any) { setError(e.message); }
  };

  const openProject = async (project: BOQProject) => {
    setSelectedProject(project);
    setView('project');
    setError(null);
    setActiveTab('boq');
    if (project.status === 'ready') {
      await loadBOQ(project.id);
    } else if (project.status === 'processing') {
      startPolling(project.id);
    }
  };

  const startPolling = (projectId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setProcessing(true);
    pollRef.current = setInterval(async () => {
      try {
        const proj = await api.getProject(projectId);
        if (proj.status === 'ready') {
          clearInterval(pollRef.current!);
          setProcessing(false);
          setSelectedProject(proj);
          setProjects(prev => prev.map(p => p.id === proj.id ? proj : p));
          await loadBOQ(proj.id);
          setSuccess('BOQ extraction complete!');
          setTimeout(() => setSuccess(null), 4000);
          if (proj.project_type === 'civil') setShowRoadModal(true);
        } else if (proj.status === 'failed') {
          clearInterval(pollRef.current!);
          setProcessing(false);
          setSelectedProject(proj);
          setError(proj.error_message || 'Extraction failed. Please try again.');
        }
      } catch { }
    }, 3000);
  };

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_MB * 1024 * 1024) return `File too large. Max ${MAX_FILE_MB} MB.`;
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) return 'Accepted: PDF, PNG, JPG.';
    if (!ALLOWED_TYPES.includes(file.type)) return 'MIME type not accepted.';
    return null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setFileError(null);
    if (file) {
      const err = validateFile(file);
      if (err) { setFileError(err); setSelectedFile(null); return; }
    }
    setSelectedFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) { setFileError(err); return; }
    setFileError(null);
    setSelectedFile(file);
  }, []);

  const handleCreateProject = async () => {
    if (!newName.trim()) { setError('Project name is required.'); return; }
    if (!selectedFile)   { setError('Please select a drawing file.'); return; }
    setError(null);
    setUploading(true);
    try {
      const project = await api.createProject(newName.trim(), newDesc.trim() || undefined, newType);
      await api.uploadDrawing(project.id, selectedFile);
      setProjects(prev => [{ ...project, status: 'processing' }, ...prev]);
      setNewName(''); setNewDesc(''); setSelectedFile(null); setNewType('residential');
      await openProject({ ...project, status: 'processing' });
    } catch (e: any) { setError(e.message); }
    finally { setUploading(false); }
  };

  const handleRoadDimensions = async () => {
    if (!selectedProject) return;
    setRoadLoading(true);
    try {
      const result = await api.setRoadDimensions(selectedProject.id, roadDims);
      setShowRoadModal(false);
      await loadBOQ(selectedProject.id);
      setSuccess(`Quantities recalculated. Total: $${result.total_project_cost?.toLocaleString() ?? '—'}`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (e: any) { setError(e.message); }
    finally { setRoadLoading(false); }
  };

  const handleItemUpdate = async (item: BOQItem, field: keyof BOQItem, value: string | number) => {
    if (!selectedProject || !boqData) return;
    try {
      const updated = await api.updateBOQItem(selectedProject.id, item.id, { [field]: value });
      setBOQData(prev => prev ? {
        ...prev,
        items: prev.items.map(i => i.id === updated.id ? updated : i),
        total_amount: prev.items.reduce((sum, i) => {
          const it = i.id === updated.id ? updated : i;
          return sum + (it.amount ?? 0);
        }, 0),
      } : prev);
      setEditingItem(null);
    } catch (e: any) { setError(e.message); }
  };

  const handleExport = async () => {
    if (!selectedProject) return;
    setExporting(true);
    try {
      const token = TokenStore.getAccess();
      const res = await fetch(api.getExportUrl(selectedProject.id), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `BOQ_${selectedProject.name}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { setError(e.message); }
    finally { setExporting(false); }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Delete this project?')) return;
    try {
      await api.deleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      if (selectedProject?.id === projectId) { setView('dashboard'); setBOQData(null); }
    } catch (e: any) { setError(e.message); }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const fc = (v: number | null | undefined) =>
    v != null ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  const confidenceColor = (c: number | null | undefined) => {
    if (!c) return '#6b7280';
    if (c >= 0.8) return '#16a34a';
    if (c >= 0.5) return '#d97706';
    return '#dc2626';
  };

  const statusBadge = (status: BOQProject['status']) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      ready:      { bg: '#dcfce7', color: '#166534', label: 'Ready' },
      processing: { bg: '#fef9c3', color: '#713f12', label: 'Processing…' },
      failed:     { bg: '#fee2e2', color: '#991b1b', label: 'Failed' },
    };
    const s = map[status];
    return (
      <span style={{ background: s.bg, color: s.color, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {s.label}
      </span>
    );
  };

  // ── renderRow: plain function NOT a React component — avoids <tr> root error ──
  const startEdit = (item: BOQItem) => {
    setEditingItem(item.id);
    setEditQty(String(item.quantity ?? ''));
    setEditRate(String(item.unit_rate ?? ''));
  };

  const renderRow = (item: BOQItem) => {
    const isEditing = editingItem === item.id;
    return (
      <tr
        key={item.id}
        className="row-hover"
        style={{ borderBottom: '1px solid #1e293b1a', cursor: 'pointer' }}
        onClick={() => !isEditing && startEdit(item)}
      >
        <td style={{ padding: '9px 12px', color: '#64748b', fontFamily: "'DM Mono', monospace", fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap' }}>
          {item.item_number}
          {item.is_user_edited && <span style={{ color: '#f59e0b', marginLeft: 4, fontSize: 10 }}>✎</span>}
        </td>
        <td style={{ padding: '9px 12px', color: '#cbd5e1', maxWidth: 360 }}>
          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>
            {item.description}
          </span>
        </td>
        <td style={{ padding: '9px 12px', color: '#94a3b8', textAlign: 'right', fontFamily: "'DM Mono', monospace" }}>
          {item.unit ?? '—'}
        </td>
        <td style={{ padding: '9px 12px', textAlign: 'right' }}>
          {isEditing ? (
            <input className="edit-input" style={{ width: 80 }} value={editQty}
              onChange={e => setEditQty(e.target.value)} onClick={e => e.stopPropagation()} />
          ) : (
            <span style={{ fontFamily: "'DM Mono', monospace", color: '#e2e8f0' }}>
              {item.quantity?.toLocaleString() ?? '—'}
            </span>
          )}
        </td>
        <td style={{ padding: '9px 12px', textAlign: 'right' }}>
          {isEditing ? (
            <input className="edit-input" style={{ width: 80 }} value={editRate}
              onChange={e => setEditRate(e.target.value)} onClick={e => e.stopPropagation()} />
          ) : (
            <span style={{ fontFamily: "'DM Mono', monospace", color: '#94a3b8' }}>
              {fc(item.unit_rate)}
            </span>
          )}
        </td>
        <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#3b82f6' }}>
          {fc(item.materials_cost)}
        </td>
        <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#8b5cf6' }}>
          {fc(item.labour_cost)}
        </td>
        <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 700, color: item.amount ? '#f8fafc' : '#334155' }}>
          {fc(item.amount)}
        </td>
        <td style={{ padding: '9px 12px', textAlign: 'right' }}>
          {isEditing ? (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
              <button className="btn btn-primary" style={{ padding: '3px 10px', fontSize: 12 }}
                onClick={() => {
                  const q = parseFloat(editQty);
                  const r = parseFloat(editRate);
                  if (!isNaN(q)) handleItemUpdate(item, 'quantity', q);
                  if (!isNaN(r)) handleItemUpdate(item, 'unit_rate', r);
                }}>✓</button>
              <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 12 }}
                onClick={() => setEditingItem(null)}>✕</button>
            </div>
          ) : (
            <span style={{ color: confidenceColor(item.confidence), fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700 }}>
              {item.confidence ? `${Math.round(item.confidence * 100)}%` : '—'}
            </span>
          )}
        </td>
      </tr>
    );
  };

  const grouped = boqData?.items.reduce<Record<string, BOQItem[]>>((acc, item) => {
    const sec = item.section || 'General';
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(item);
    return acc;
  }, {});

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f1117' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, border: '3px solid #334155', borderTopColor: '#f59e0b', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: '#64748b', fontSize: 13 }}>Loading…</p>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Barlow:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0f1117; }
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .fade-in { animation: fadeIn 0.3s ease forwards; }
        .btn { cursor: pointer; border: none; border-radius: 6px; font-family: 'Barlow', sans-serif; font-weight: 600; transition: all 0.15s; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-primary { background: #f59e0b; color: #0f1117; padding: 10px 20px; font-size: 14px; }
        .btn-primary:hover:not(:disabled) { background: #fbbf24; transform: translateY(-1px); }
        .btn-ghost { background: transparent; color: #94a3b8; padding: 8px 16px; font-size: 13px; border: 1px solid #1e293b; }
        .btn-ghost:hover:not(:disabled) { background: #1e293b; color: #e2e8f0; }
        .btn-danger { background: transparent; color: #ef4444; padding: 6px 12px; font-size: 12px; border: 1px solid #ef444440; }
        .btn-danger:hover { background: #ef444415; }
        .input { background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #e2e8f0; padding: 10px 14px; font-family: 'Barlow', sans-serif; font-size: 14px; width: 100%; outline: none; transition: border-color 0.15s; }
        .input:focus { border-color: #f59e0b; }
        .card { background: #161b27; border: 1px solid #1e293b; border-radius: 10px; }
        .row-hover:hover { background: #1e293b40; }
        .edit-input { background: #0f1117; border: 1px solid #f59e0b; border-radius: 4px; color: #f8fafc; padding: 3px 8px; font-family: 'DM Mono', monospace; font-size: 13px; }
        .section-header { background: #1e293b; padding: 8px 16px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em; }
        .tab { cursor: pointer; padding: 8px 18px; font-size: 13px; font-weight: 600; border: none; background: transparent; color: #475569; border-bottom: 2px solid transparent; transition: all 0.15s; font-family: 'Barlow', sans-serif; }
        .tab.active { color: #f59e0b; border-bottom-color: #f59e0b; }
        .tab:hover:not(.active) { color: #94a3b8; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 100; }
        .modal { background: #161b27; border: 1px solid #334155; border-radius: 12px; padding: 28px; width: 480px; max-width: 90vw; }
        .type-card { border: 1px solid #1e293b; border-radius: 8px; padding: 10px 14px; cursor: pointer; transition: all 0.15s; background: #1e293b20; }
        .type-card:hover { border-color: #334155; background: #1e293b40; }
        .type-card.selected { border-color: #f59e0b; background: #f59e0b10; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0f1117; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
      `}</style>

      {/* ── Road Modal ── */}
      {showRoadModal && (
        <div className="modal-overlay" onClick={() => setShowRoadModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', marginBottom: 6 }}>🛣 Set Road Dimensions</h3>
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
              The cross-section drawing shows layer thicknesses but not road length or width.
              Enter these to calculate correct volumes (L × W × thickness).
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>Total Road Length (m) *</label>
                <input className="input" type="number" min="1" step="0.1" value={roadDims.road_length_m} placeholder="e.g. 500"
                  onChange={e => setRoadDims(d => ({ ...d, road_length_m: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>Carriageway Width (m) *</label>
                <input className="input" type="number" min="1" step="0.1" value={roadDims.carriageway_width_m} placeholder="e.g. 8.5"
                  onChange={e => setRoadDims(d => ({ ...d, carriageway_width_m: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>Shoulder Width each side (m)</label>
                <input className="input" type="number" min="0" step="0.1" value={roadDims.shoulder_width_m} placeholder="default 0.5"
                  onChange={e => setRoadDims(d => ({ ...d, shoulder_width_m: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>Sidewalk Width each side (m)</label>
                <input className="input" type="number" min="0" step="0.1" value={roadDims.sidewalk_width_m} placeholder="default 1.5"
                  onChange={e => setRoadDims(d => ({ ...d, sidewalk_width_m: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <div style={{ background: '#1e293b', borderRadius: 6, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
              <strong style={{ color: '#94a3b8' }}>Preview:</strong><br />
              Carriageway area: {(roadDims.road_length_m * roadDims.carriageway_width_m).toFixed(1)} m²<br />
              Formation width: {(roadDims.carriageway_width_m + 2 * roadDims.shoulder_width_m).toFixed(1)} m<br />
              Sub-base vol (200mm): {(roadDims.road_length_m * (roadDims.carriageway_width_m + 2 * roadDims.shoulder_width_m) * 0.2).toFixed(1)} m³
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowRoadModal(false)}>Skip for now</button>
              <button className="btn btn-primary" onClick={handleRoadDimensions}
                disabled={roadLoading || !roadDims.road_length_m || !roadDims.carriageway_width_m}>
                {roadLoading ? '⟳ Calculating…' : '⚡ Recalculate Quantities'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#0f1117', fontFamily: "'Barlow', sans-serif", color: '#e2e8f0' }}>

        {/* ── Sidebar ── */}
        <aside style={{ width: 260, background: '#0a0d14', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, background: '#f59e0b', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 16 }}>📋</span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>BOQ Generator</div>
                <div style={{ fontSize: 10, color: '#475569', fontFamily: "'DM Mono', monospace" }}>Amaryllis Success</div>
              </div>
            </div>
          </div>
          <nav style={{ flex: 1, padding: 12, overflow: 'auto' }}>
            <button className="btn"
              onClick={() => { setView('dashboard'); setSelectedProject(null); setBOQData(null); }}
              style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 6, background: view === 'dashboard' ? '#1e293b' : 'transparent', color: view === 'dashboard' ? '#f8fafc' : '#64748b', fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⊞</span> All Projects
            </button>
            <button className="btn"
              onClick={() => { setView('new'); setError(null); }}
              style={{ width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 6, background: view === 'new' ? '#1e293b' : 'transparent', color: view === 'new' ? '#f59e0b' : '#64748b', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>＋</span> New Project
            </button>
            {projects.length > 0 && (
              <>
                <div style={{ fontSize: 10, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 12px 6px', fontWeight: 700 }}>Recent</div>
                {projects.slice(0, 8).map(p => (
                  <button key={p.id} className="btn" onClick={() => openProject(p)}
                    style={{ width: '100%', textAlign: 'left', padding: '7px 12px', borderRadius: 6, background: selectedProject?.id === p.id ? '#1e293b' : 'transparent', color: selectedProject?.id === p.id ? '#f8fafc' : '#475569', fontSize: 12, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ fontSize: 8, color: p.status === 'ready' ? '#16a34a' : p.status === 'failed' ? '#ef4444' : '#f59e0b' }}>●</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                  </button>
                ))}
              </>
            )}
          </nav>
          <div style={{ padding: '12px 16px', borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{user?.full_name || user?.email}</div>
              <div style={{ fontSize: 10, color: '#475569', fontFamily: "'DM Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{user?.company || ''}</div>
            </div>
            <button className="btn btn-ghost" onClick={() => api.logout()} style={{ padding: '4px 8px', fontSize: 11 }}>Out</button>
          </div>
        </aside>

        {/* ── Main ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {(error || success) && (
            <div style={{ padding: '10px 20px', fontSize: 13, fontWeight: 500, background: error ? '#450a0a' : '#052e16', color: error ? '#fca5a5' : '#86efac', borderBottom: `1px solid ${error ? '#7f1d1d' : '#14532d'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{error || success}</span>
              <button className="btn" onClick={() => { setError(null); setSuccess(null); }} style={{ background: 'none', color: 'inherit', padding: '0 4px', fontSize: 16, opacity: 0.6 }}>×</button>
            </div>
          )}

          {/* Dashboard */}
          {view === 'dashboard' && (
            <div style={{ flex: 1, overflow: 'auto', padding: 32 }} className="fade-in">
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
                <div>
                  <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>BOQ Projects</h1>
                  <p style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>Upload engineering drawings to auto-generate Bills of Quantities</p>
                </div>
                <button className="btn btn-primary" onClick={() => setView('new')}>+ New Project</button>
              </div>
              {projects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>📐</div>
                  <p style={{ color: '#475569', fontSize: 15, marginBottom: 20 }}>No projects yet. Upload a drawing to get started.</p>
                  <button className="btn btn-primary" onClick={() => setView('new')}>Upload First Drawing</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                  {projects.map(p => (
                    <div key={p.id} className="card"
                      style={{ padding: 20, cursor: 'pointer', transition: 'border-color 0.15s' }}
                      onClick={() => openProject(p)}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = '#334155')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e293b')}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', flex: 1, paddingRight: 8 }}>{p.name}</div>
                        {statusBadge(p.status)}
                      </div>
                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 10 }}>
                        {PROJECT_TYPES.find(t => t.value === p.project_type)?.label || '🏠 Residential'}
                      </div>
                      {p.total_project_cost && (
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#f59e0b', fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>
                          {fc(p.total_project_cost)}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#475569', fontFamily: "'DM Mono', monospace" }}>
                          {p.item_count} items · {new Date(p.created_at).toLocaleDateString()}
                        </span>
                        <button className="btn btn-danger"
                          onClick={e => { e.stopPropagation(); handleDeleteProject(p.id); }}
                          style={{ padding: '3px 8px', fontSize: 11 }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* New Project */}
          {view === 'new' && (
            <div style={{ flex: 1, overflow: 'auto', padding: 32, maxWidth: 640 }} className="fade-in">
              <button className="btn btn-ghost" onClick={() => setView('dashboard')} style={{ marginBottom: 24, fontSize: 12 }}>← Back</button>
              <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6, color: '#f8fafc' }}>New BOQ Project</h1>
              <p style={{ color: '#475569', fontSize: 13, marginBottom: 28 }}>Upload an engineering drawing. The AI will extract quantities and costs automatically.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>Project Name *</label>
                  <input className="input" placeholder="e.g. Tarisa Road Phase 2 — Drainage"
                    value={newName} onChange={e => setNewName(e.target.value)} maxLength={255} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 600 }}>Project Type *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {PROJECT_TYPES.map(t => (
                      <div key={t.value} className={`type-card ${newType === t.value ? 'selected' : ''}`} onClick={() => setNewType(t.value)}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: newType === t.value ? '#f59e0b' : '#e2e8f0', marginBottom: 2 }}>{t.label}</div>
                        <div style={{ fontSize: 11, color: '#475569' }}>{t.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>Description</label>
                  <textarea className="input" placeholder="Optional notes…" value={newDesc}
                    onChange={e => setNewDesc(e.target.value)} rows={2}
                    style={{ resize: 'vertical', fontFamily: 'inherit' }} maxLength={2000} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>Drawing File * (PDF, PNG, JPG — max 20 MB)</label>
                  <div onDragOver={e => e.preventDefault()} onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{ border: `2px dashed ${fileError ? '#ef4444' : selectedFile ? '#f59e0b' : '#334155'}`, borderRadius: 8, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', background: selectedFile ? '#f59e0b0a' : '#1e293b20', transition: 'all 0.2s' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{selectedFile ? '📄' : '⬆'}</div>
                    {selectedFile ? (
                      <div>
                        <p style={{ color: '#f59e0b', fontSize: 14, fontWeight: 600 }}>{selectedFile.name}</p>
                        <p style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    ) : (
                      <p style={{ color: '#64748b', fontSize: 13 }}>Drag & drop or click to select</p>
                    )}
                    <input ref={fileInputRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileChange} />
                  </div>
                  {fileError && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{fileError}</p>}
                </div>
                {newType === 'civil' && (
                  <div style={{ background: '#1e293b', borderRadius: 8, padding: '14px 16px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700, marginBottom: 6 }}>🛣 Civil Project Note</div>
                    <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                      After upload, you'll be asked to enter road length and carriageway width.
                      Cross-section drawings show layer thicknesses only — dimensions are needed to calculate volumes (L × W × thickness).
                    </p>
                  </div>
                )}
                <button className="btn btn-primary" onClick={handleCreateProject}
                  disabled={uploading || !newName.trim() || !selectedFile || !!fileError}
                  style={{ alignSelf: 'flex-start', minWidth: 180 }}>
                  {uploading ? '⟳ Uploading…' : '⚡ Extract BOQ'}
                </button>
              </div>
            </div>
          )}

          {/* Project View */}
          {view === 'project' && selectedProject && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="fade-in">

              {/* Header */}
              <div style={{ padding: '14px 24px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0a0d14' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button className="btn btn-ghost"
                    onClick={() => { setView('dashboard'); setBOQData(null); setSelectedProject(null); }}
                    style={{ padding: '4px 10px', fontSize: 12 }}>←</button>
                  <div>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>{selectedProject.name}</h2>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                      {statusBadge(selectedProject.status)}
                      <span style={{ fontSize: 11, color: '#475569' }}>
                        {PROJECT_TYPES.find(t => t.value === selectedProject.project_type)?.label}
                      </span>
                      {boqData && (
                        <span style={{ fontSize: 11, color: '#475569', fontFamily: "'DM Mono', monospace" }}>
                          {boqData.items.length} items
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {boqData?.cost_summary?.total_project_cost && (
                    <div style={{ textAlign: 'right', marginRight: 12 }}>
                      <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Project Cost</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b', fontFamily: "'DM Mono', monospace" }}>
                        {fc(boqData.cost_summary.total_project_cost)}
                      </div>
                    </div>
                  )}
                  {selectedProject.project_type === 'civil' && selectedProject.status === 'ready' && (
                    <button className="btn btn-ghost" onClick={() => setShowRoadModal(true)} style={{ fontSize: 12 }}>🛣 Road Dims</button>
                  )}
                  {selectedProject.status === 'ready' && (
                    <button className="btn btn-primary" onClick={handleExport} disabled={exporting} style={{ fontSize: 13 }}>
                      {exporting ? '⟳ Exporting…' : '↓ Export XLSX'}
                    </button>
                  )}
                </div>
              </div>

              {/* Processing */}
              {(processing || selectedProject.status === 'processing') && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <div style={{ width: 56, height: 56, border: '3px solid #1e293b', borderTopColor: '#f59e0b', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#f8fafc', fontSize: 15, fontWeight: 600 }}>Analysing drawing…</p>
                    <p style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>Extracting quantities, applying Zimbabwe rates and generating material schedule. 30–90 seconds.</p>
                  </div>
                </div>
              )}

              {/* Failed */}
              {selectedProject.status === 'failed' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <div style={{ fontSize: 48 }}>⚠</div>
                  <p style={{ color: '#fca5a5', fontSize: 15, fontWeight: 600 }}>Extraction failed</p>
                  <p style={{ color: '#64748b', fontSize: 13, maxWidth: 400, textAlign: 'center' }}>{selectedProject.error_message}</p>
                </div>
              )}

              {/* Ready */}
              {selectedProject.status === 'ready' && boqData && (
                <>
                  <div style={{ borderBottom: '1px solid #1e293b', padding: '0 24px', display: 'flex', gap: 4, background: '#0a0d14' }}>
                    <button className={`tab ${activeTab === 'boq' ? 'active' : ''}`} onClick={() => setActiveTab('boq')}>
                      BOQ Items ({boqData.items.length})
                    </button>
                    <button className={`tab ${activeTab === 'materials' ? 'active' : ''}`} onClick={() => setActiveTab('materials')}>
                      Material Schedule ({boqData.material_schedule?.length ?? 0})
                    </button>
                    <button className={`tab ${activeTab === 'cost' ? 'active' : ''}`} onClick={() => setActiveTab('cost')}>
                      Cost Summary
                    </button>
                  </div>

                  {/* BOQ Tab */}
                  {activeTab === 'boq' && (
                    <div style={{ flex: 1, overflow: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                          <tr style={{ background: '#0a0d14', borderBottom: '2px solid #1e293b' }}>
                            {['Item', 'Description', 'Unit', 'Qty', 'Rate (USD)', 'Materials', 'Labour', 'Amount (USD)', 'Conf.'].map(h => (
                              <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Description' ? 'left' : 'right', color: '#475569', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {boqData.sections.map(section => (
                            <React.Fragment key={section}>
                              <tr>
                                <td colSpan={9} className="section-header">{section}</td>
                              </tr>
                              {(grouped?.[section] ?? []).map(item => renderRow(item))}
                            </React.Fragment>
                          ))}
                        </tbody>
                        {boqData.total_amount && (
                          <tfoot>
                            <tr style={{ background: '#0a0d14', borderTop: '2px solid #1e293b' }}>
                              <td colSpan={7} style={{ padding: '12px 16px', textAlign: 'right', color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Subtotal</td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 800, color: '#f59e0b', fontSize: 15 }}>{fc(boqData.total_amount)}</td>
                              <td />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}

                  {/* Materials Tab */}
                  {activeTab === 'materials' && (
                    <div style={{ flex: 1, overflow: 'auto' }}>
                      {(!boqData.material_schedule || boqData.material_schedule.length === 0) ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: '#475569' }}>
                          <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
                          <p>No material schedule generated yet.</p>
                        </div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                            <tr style={{ background: '#0a0d14', borderBottom: '2px solid #1e293b' }}>
                              {['Material', 'Category', 'Unit', 'Qty Required', 'Unit Rate', 'Total Cost', 'Supplier Note'].map(h => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Material' || h === 'Category' || h === 'Supplier Note' ? 'left' : 'right', color: '#475569', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {boqData.material_schedule.map((mat, i) => (
                              <tr key={mat.id || i} className="row-hover" style={{ borderBottom: '1px solid #1e293b1a' }}>
                                <td style={{ padding: '9px 12px', color: '#e2e8f0', fontWeight: 500 }}>{mat.material_name}</td>
                                <td style={{ padding: '9px 12px', color: '#64748b', fontSize: 12 }}>
                                  <span style={{ background: '#1e293b', padding: '2px 8px', borderRadius: 4 }}>{mat.category || '—'}</span>
                                </td>
                                <td style={{ padding: '9px 12px', color: '#94a3b8', textAlign: 'right', fontFamily: "'DM Mono', monospace" }}>{mat.unit}</td>
                                <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#e2e8f0' }}>{mat.quantity_required?.toLocaleString() ?? '—'}</td>
                                <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#94a3b8' }}>{fc(mat.unit_rate)}</td>
                                <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 700, color: '#f8fafc' }}>{fc(mat.total_cost)}</td>
                                <td style={{ padding: '9px 12px', color: '#64748b', fontSize: 11, maxWidth: 220 }}>{mat.supplier_note || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: '#0a0d14', borderTop: '2px solid #1e293b' }}>
                              <td colSpan={5} style={{ padding: '12px 16px', textAlign: 'right', color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Total Materials</td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 800, color: '#f59e0b', fontSize: 15 }}>
                                {fc(boqData.material_schedule.reduce((s, m) => s + (m.total_cost ?? 0), 0))}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  )}

                  {/* Cost Summary Tab */}
                  {activeTab === 'cost' && (
                    <div style={{ flex: 1, overflow: 'auto', padding: 32 }}>
                      {!boqData.cost_summary ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: '#475569' }}>
                          <p>Cost summary not available.</p>
                        </div>
                      ) : (
                        <div style={{ maxWidth: 560 }}>
                          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', marginBottom: 24 }}>Cost Summary</h2>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
                            {[
                              { label: 'Materials',      value: boqData.cost_summary.total_materials_cost,     color: '#3b82f6' },
                              { label: 'Labour',         value: boqData.cost_summary.total_labour_cost,        color: '#8b5cf6' },
                              { label: 'Subcontractors', value: boqData.cost_summary.total_subcontractor_cost, color: '#06b6d4' },
                            ].map(c => (
                              <div key={c.label} className="card" style={{ padding: '16px 20px' }}>
                                <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{c.label}</div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: c.color, fontFamily: "'DM Mono', monospace" }}>{fc(c.value)}</div>
                              </div>
                            ))}
                          </div>
                          <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
                            {[
                              { label: 'Construction cost subtotal', value: (boqData.cost_summary.total_materials_cost ?? 0) + (boqData.cost_summary.total_labour_cost ?? 0) + (boqData.cost_summary.total_subcontractor_cost ?? 0) },
                              { label: `Preliminaries (${boqData.cost_summary.preliminaries_pct ?? 8}%)`, value: ((boqData.cost_summary.total_materials_cost ?? 0) + (boqData.cost_summary.total_labour_cost ?? 0)) * ((boqData.cost_summary.preliminaries_pct ?? 8) / 100) },
                              { label: `Contingency (${boqData.cost_summary.contingency_pct ?? 5}%)`, value: ((boqData.cost_summary.total_materials_cost ?? 0) + (boqData.cost_summary.total_labour_cost ?? 0)) * ((boqData.cost_summary.contingency_pct ?? 5) / 100) },
                              { label: `Profit & Overhead (${boqData.cost_summary.profit_margin_pct ?? 15}%)`, value: ((boqData.cost_summary.total_materials_cost ?? 0) + (boqData.cost_summary.total_labour_cost ?? 0)) * ((boqData.cost_summary.profit_margin_pct ?? 15) / 100) },
                            ].map((row, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #1e293b' }}>
                                <span style={{ fontSize: 13, color: '#94a3b8' }}>{row.label}</span>
                                <span style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", color: '#e2e8f0' }}>{fc(row.value)}</span>
                              </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 20px', background: '#1e293b' }}>
                              <span style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>TOTAL PROJECT COST</span>
                              <span style={{ fontSize: 18, fontFamily: "'DM Mono', monospace", fontWeight: 800, color: '#f59e0b' }}>{fc(boqData.cost_summary.total_project_cost)}</span>
                            </div>
                          </div>
                          <p style={{ fontSize: 11, color: '#334155', lineHeight: 1.6 }}>
                            * Rates based on Zimbabwe 2025 market prices. Actual costs may vary. Validate with a registered quantity surveyor before use in tender documents.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
