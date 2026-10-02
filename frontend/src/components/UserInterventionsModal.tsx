"use client";
import React, { useEffect, useState, useCallback } from "react";
import { fetchAPI } from "../lib/api";

interface UserInterventionsModalProps {
  username: string;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

const detectMultipleAssetIds = (value: string): string | null => {
  if (!value) return null;
  if (/[,;\/\+\&]/.test(value)) {
    return "Lütfen tek bir Asset ID girin. Birden fazla Asset ID'yi virgül, eğik çizgi, artı veya ampersand ile birleştirmeyin.";
  }
  if (/\b(ve|ile|to|and)\b/i.test(value)) {
    return "Lütfen tek bir Asset ID girin. 've', 'ile', 'to', 'and' gibi kelimelerle birden fazla ID birleştirmeyin.";
  }
  const parts = value.trim().split(/\s+/);
  if (parts.length > 2) {
    return "Lütfen tek bir Asset ID girin. Boşlukla ayrılmış birden fazla kelime/numara tespit edildi.";
  }
  if (parts.length === 2) {
    if (/^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
      return "Lütfen tek bir Asset ID girin. Boşlukla ayrılmış birden fazla numara tespit edildi.";
    }
  }
  return null;
};

export default function UserInterventionsModal({ username, isOpen, onClose, onRefresh }: UserInterventionsModalProps) {
  const [interventions, setInterventions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedInterventions, setSelectedInterventions] = useState<number[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Inline edit state
  const [editingInterventionId, setEditingInterventionId] = useState<number | null>(null);
  const [editingForm, setEditingForm] = useState({
    category: 'Ağaç Budama',
    assetId: '',
    desc: '',
    lengthKm: '',
    quantity: 1,
    interventionUnits: ['BELLİ DEĞİL'],
    statuses: ['Yapılmadı']
  });
  const [editingSaving, setEditingSaving] = useState(false);

  const loadInterventions = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    try {
      const data = await fetchAPI(`/interventions/user/${username}`);
      setInterventions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    if (isOpen && username) {
      setInterventions([]);
      loadInterventions();
      setSelectedInterventions([]);
      setEditingInterventionId(null);
    } else {
      setInterventions([]);
    }
  }, [isOpen, username, loadInterventions]);

  const handleDeleteIntervention = async (id: number) => {
    if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
    try {
      await fetchAPI(`/interventions/${id}`, { method: 'DELETE' });
      setInterventions(prev => prev.filter(i => i.id !== id));
      if (onRefresh) onRefresh();
    } catch (err) {
      alert("Silme işlemi başarısız.");
    }
  };

  const handleUpdateIntervention = async (id: number) => {
    setEditingSaving(true);
    try {
      const updatedInt = await fetchAPI(`/interventions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          category: editingForm.category,
          asset_id: editingForm.assetId,
          description: editingForm.desc,
          status: editingForm.statuses.filter(s => s).join(', '),
          length_km: editingForm.lengthKm ? parseFloat(editingForm.lengthKm) : null,
          quantity: editingForm.category === 'Ağaç Budama' ? parseInt(editingForm.quantity as any) || 1 : 1,
          intervention_unit: editingForm.interventionUnits.filter(u => u).join(', ')
        })
      });
      // Replace in local state, preserving the line information fields
      setInterventions(prev => prev.map(i => i.id === id ? { ...updatedInt, line_name: i.line_name, il: i.il, ilce: i.ilce, operasyon_merkezi: i.operasyon_merkezi } : i));
      setEditingInterventionId(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert("Düzenleme kaydedilirken hata oluştu.");
    } finally {
      setEditingSaving(false);
    }
  };

  const handleBulkStatusUpdate = async (newStatus: string) => {
    if (selectedInterventions.length === 0) return;
    setBulkSaving(true);
    try {
      await fetchAPI(`/interventions/bulk/status`, {
        method: 'PUT',
        body: JSON.stringify({
          ids: selectedInterventions,
          status: newStatus
        })
      });
      alert(`${selectedInterventions.length} adet müdahale başarıyla güncellendi.`);
      setSelectedInterventions([]);
      loadInterventions();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert("Güncelleme başarısız oldu.");
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedInterventions.length === 0) return;
    if (!confirm(`${selectedInterventions.length} adet müdahaleyi silmek istediğinize emin misiniz?`)) return;
    setBulkSaving(true);
    try {
      await fetchAPI(`/interventions/bulk`, {
        method: 'DELETE',
        body: JSON.stringify({ ids: selectedInterventions })
      });
      alert(`${selectedInterventions.length} adet müdahale başarıyla silindi.`);
      setSelectedInterventions([]);
      loadInterventions();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert("Silme işlemi başarısız oldu.");
    } finally {
      setBulkSaving(false);
    }
  };

  const formatUnitsWithStatuses = (unitStr: string, statusStr: string) => {
    if (!unitStr) return 'BELLİ DEĞİL (Yapılmadı)';
    const units = unitStr.split(', ');
    const statuses = (statusStr || '').split(', ');
    return units.map((u, i) => {
      const s = statuses[i] || 'Yapılmadı';
      return `${u} (${s})`;
    }).join(', ');
  };

  if (!isOpen || !username) return null;

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
      padding: '1rem'
    }} onClick={onClose}>
      <div className="glass-panel animate-fade-in modal-content" style={{
        width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        backgroundColor: 'var(--surface-color)', overflow: 'hidden'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>👤 {username} Kullanıcısının Girdiği Veriler</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
        </div>

        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h4 style={{ margin: 0 }}>Toplam Kayıt: {interventions.length}</h4>
            {interventions.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginRight: '1rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedInterventions.length === interventions.length && interventions.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedInterventions(interventions.map(i => i.id));
                      else setSelectedInterventions([]);
                    }}
                  />
                  <span style={{ fontSize: '0.85rem' }}>Tümünü Seç</span>
                </label>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', backgroundColor: 'var(--surface-hover)' }}
                  onClick={() => handleBulkStatusUpdate('Yapılmadı')}
                  disabled={bulkSaving || selectedInterventions.length === 0}
                >
                  {bulkSaving ? '...' : '❌ Yapılmadı'}
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', backgroundColor: '#10b981', color: 'white' }}
                  onClick={() => handleBulkStatusUpdate('Yapıldı')}
                  disabled={bulkSaving || selectedInterventions.length === 0}
                >
                  {bulkSaving ? '...' : '✅ Yapıldı'}
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', backgroundColor: '#ef4444', color: 'white' }}
                  onClick={handleBulkDelete}
                  disabled={bulkSaving || selectedInterventions.length === 0}
                >
                  {bulkSaving ? '...' : '🗑️ Sil'}
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Yükleniyor...</div>
          ) : (
            <div>
              {interventions.map((intv) => (
                <div key={intv.id} style={{
                  padding: '1rem',
                  backgroundColor: selectedInterventions.includes(intv.id) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(0,0,0,0.2)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '0.5rem',
                  border: `1px solid ${selectedInterventions.includes(intv.id) ? '#10b981' : 'var(--glass-border)'}`,
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-start',
                  transition: 'all 0.2s'
                }}>
                  <input
                    type="checkbox"
                    style={{ marginTop: '0.25rem', cursor: 'pointer', width: '1.2rem', height: '1.2rem' }}
                    checked={selectedInterventions.includes(intv.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedInterventions([...selectedInterventions, intv.id]);
                      else setSelectedInterventions(selectedInterventions.filter(id => id !== intv.id));
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    {editingInterventionId === intv.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.25rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                          <div>
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Asset ID *</label>
                            <input
                              type="text"
                              value={editingForm.assetId}
                              placeholder="Örn: 12345"
                              onChange={e => setEditingForm({ ...editingForm, assetId: e.target.value })}
                              style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'white' }}
                              required
                            />
                            {detectMultipleAssetIds(editingForm.assetId) && (
                              <span style={{ display: 'block', color: '#f87171', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                ⚠️ {detectMultipleAssetIds(editingForm.assetId)}
                              </span>
                            )}
                          </div>
                          <div>
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Kategori *</label>
                            <select
                              value={editingForm.category}
                              onChange={e => setEditingForm({ ...editingForm, category: e.target.value })}
                              style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'white' }}
                            >
                              <option>Ağaç Budama</option>
                              <option>Güzergah Değişimi</option>
                              <option>Beton Dökümü</option>
                              <option>Koridor Açma</option>
                              <option>Operasyon Müdahalesi</option>
                            </select>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Müdahale Edecek Birimler ve Durumları *</label>
                          {editingForm.interventionUnits.map((unit, idx) => {
                            const otherSelected = editingForm.interventionUnits.filter((_, i) => i !== idx);
                            const allOptions = ['BELLİ DEĞİL', 'BAKIM S2', 'BAKIM S3', 'OPERASYON', 'YATIRIM'];
                            const availableOptions = allOptions.filter(opt => opt === 'BELLİ DEĞİL' || !otherSelected.includes(opt));
                            const unitStatus = editingForm.statuses[idx] || 'Yapılmadı';

                            return (
                              <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                                <select
                                  value={unit}
                                  onChange={e => {
                                    const newUnits = [...editingForm.interventionUnits];
                                    newUnits[idx] = e.target.value;
                                    setEditingForm({ ...editingForm, interventionUnits: newUnits });
                                  }}
                                  style={{ flex: 2, padding: '0.4rem', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'white' }}
                                >
                                  {availableOptions.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                                <select
                                  value={unitStatus}
                                  onChange={e => {
                                    const newStatuses = [...editingForm.statuses];
                                    newStatuses[idx] = e.target.value;
                                    setEditingForm({ ...editingForm, statuses: newStatuses });
                                  }}
                                  style={{ flex: 1.2, padding: '0.4rem', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'white' }}
                                >
                                  <option value="Yapılmadı">Yapılmadı</option>
                                  <option value="Yapıldı">Yapıldı</option>
                                </select>
                                {idx === 0 ? (
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.9rem', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
                                    onClick={() => setEditingForm({
                                      ...editingForm,
                                      interventionUnits: [...editingForm.interventionUnits, 'BELLİ DEĞİL'],
                                      statuses: [...editingForm.statuses, 'Yapılmadı']
                                    })}
                                  >
                                    ➕
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-danger"
                                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.9rem', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                    onClick={() => {
                                      const newUnits = editingForm.interventionUnits.filter((_, i) => i !== idx);
                                      const newStatuses = editingForm.statuses.filter((_, i) => i !== idx);
                                      setEditingForm({ ...editingForm, interventionUnits: newUnits, statuses: newStatuses });
                                    }}
                                  >
                                    ❌
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                          {editingForm.category === 'Koridor Açma' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Uzunluk (Km)</label>
                              <input
                                type="text"
                                placeholder="Örn: 0.4"
                                value={editingForm.lengthKm}
                                onChange={e => setEditingForm({ ...editingForm, lengthKm: e.target.value })}
                                style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'white' }}
                                required
                              />
                            </div>
                          )}
                          {editingForm.category === 'Ağaç Budama' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Ara Sayısı (Adet)</label>
                              <input
                                type="number"
                                min="1"
                                value={editingForm.quantity}
                                onChange={e => setEditingForm({ ...editingForm, quantity: parseInt(e.target.value) || 1 })}
                                style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'white' }}
                                required
                              />
                            </div>
                          )}
                        </div>

                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Açıklama</label>
                          <textarea
                            rows={2}
                            value={editingForm.desc}
                            onChange={e => setEditingForm({ ...editingForm, desc: e.target.value })}
                            style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'white' }}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
                            onClick={() => handleUpdateIntervention(intv.id)}
                            disabled={editingSaving || !!detectMultipleAssetIds(editingForm.assetId)}
                          >
                            {editingSaving ? 'Güncelleniyor...' : '💾 Güncelle'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', backgroundColor: 'var(--surface-hover)' }}
                            onClick={() => setEditingInterventionId(null)}
                            disabled={editingSaving}
                          >
                            İptal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <strong style={{ cursor: 'pointer', color: 'var(--accent-color)' }} onClick={() => {
                              if (selectedInterventions.includes(intv.id)) setSelectedInterventions(selectedInterventions.filter(id => id !== intv.id));
                              else setSelectedInterventions([...selectedInterventions, intv.id]);
                            }}>{intv.asset_id}</strong>
                            {intv.asset_type && (
                              <span style={{
                                padding: '0.1rem 0.4rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                background: intv.asset_type.includes('DİREK') ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                                color: intv.asset_type.includes('DİREK') ? '#60a5fa' : '#c084fc',
                                border: '1px solid rgba(255,255,255,0.1)'
                              }}>
                                {intv.asset_type}
                              </span>
                            )}
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>
                              ({intv.il} - {intv.line_name})
                            </span>
                          </div>
                          <span className="text-muted" style={{ fontSize: '0.85rem' }}>{new Date(intv.created_at).toLocaleString('tr-TR')}</span>
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                          <span className="text-accent">{intv.category}</span> • Birimler: <span style={{ color: '#f59e0b', fontWeight: '600' }}>{formatUnitsWithStatuses(intv.intervention_unit, intv.status)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '0.5rem' }}>
                          <div style={{ flex: 1 }}>
                            {intv.description && <p style={{ fontSize: '0.85rem', margin: 0 }}>{intv.description}</p>}
                            {intv.category === 'Koridor Açma' && intv.length_km && <p style={{ fontSize: '0.85rem', margin: '0.25rem 0 0 0', color: 'var(--text-secondary)' }}>Uzunluk: {intv.length_km} Km</p>}
                            {intv.category === 'Ağaç Budama' && intv.quantity && <p style={{ fontSize: '0.85rem', margin: '0.25rem 0 0 0', color: 'var(--text-secondary)' }}>Ara Sayısı: {intv.quantity} Adet</p>}
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingInterventionId(intv.id);
                                setEditingForm({
                                  category: intv.category,
                                  assetId: intv.asset_id,
                                  desc: intv.description || '',
                                  lengthKm: intv.length_km ? intv.length_km.toString() : '',
                                  quantity: intv.quantity || 1,
                                  interventionUnits: intv.intervention_unit ? intv.intervention_unit.split(', ') : ['BELLİ DEĞİL'],
                                  statuses: intv.status ? intv.status.split(', ') : ['Yapılmadı']
                                });
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.5rem', color: '#60a5fa', opacity: 0.8 }}
                              title="Kaydı Düzenle"
                            >
                              📝
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteIntervention(intv.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.5rem', color: '#ef4444', opacity: 0.8 }}
                              title="Kaydı Sil"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {interventions.length === 0 && <p className="text-muted" style={{ fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>Bu kullanıcının girdiği veri bulunmamaktadır.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
