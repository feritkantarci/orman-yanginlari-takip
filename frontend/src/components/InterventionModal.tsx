"use client";
import React, { useEffect, useState, useCallback } from "react";
import { fetchAPI } from "../lib/api";

interface InterventionModalProps {
  line: any;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

const parseAssetIds = (value: string): string[] => {
  if (!value) return [];
  // Split by whitespace, commas, semicolons, plus, newlines, tabs
  const tokens = value.split(/[\s,;+\n\r\t]+/);
  return tokens.map(t => t.trim()).filter(t => t.length > 0);
};

const validateSingleAssetId = (value: string): string | null => {
  if (!value) return null;
  const parsed = parseAssetIds(value);
  if (parsed.length > 1) {
    return "Mevcut kaydı güncellerken tek bir Asset ID girmelisiniz.";
  }
  return null;
};

const ALL_CATEGORIES = [
  'Ağaç Budama',
  'Güzergah Değişimi',
  'Beton Dökümü',
  'Koridor Açma',
  'Operasyon Müdahalesi'
];

interface FormCategoryItem {
  id: string;
  category: string;
  desc: string;
  lengthKm: string;
  quantity: number;
  interventionUnits: string[];
  statuses: string[];
}

const createDefaultCategoryItem = (categoryName: string = 'Ağaç Budama'): FormCategoryItem => ({
  id: Math.random().toString(36).substring(2, 9),
  category: categoryName,
  desc: '',
  lengthKm: '',
  quantity: 1,
  interventionUnits: ['BELLİ DEĞİL'],
  statuses: ['Yapılmadı']
});

export default function InterventionModal({ line, isOpen, onClose, onRefresh }: InterventionModalProps) {
  const [currentUser, setCurrentUser] = useState("");
  const [userRole, setUserRole] = useState("");
  const [interventions, setInterventions] = useState<any[]>([]);
  const [selectedInterventions, setSelectedInterventions] = useState<number[]>([]);
  const [assetId, setAssetId] = useState('');
  const [formCategories, setFormCategories] = useState<FormCategoryItem[]>([createDefaultCategoryItem('Ağaç Budama')]);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const [editingRequestInterventionId, setEditingRequestInterventionId] = useState<number | null>(null);
  const [editRequestData, setEditRequestData] = useState({ status: 'Yapıldı', description: '', lengthKm: '' });

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

  // Line Siparis No edit in modal
  const [modalSiparisNo, setModalSiparisNo] = useState("");
  const [editingSiparisNo, setEditingSiparisNo] = useState(false);
  const [savingSiparis, setSavingSiparis] = useState(false);

  const handleSaveModalSiparis = async () => {
    if (!line) return;
    setSavingSiparis(true);
    try {
      await fetchAPI(`/lines/${line.sira_no}`, {
        method: 'PUT',
        body: JSON.stringify({ siparis_no: modalSiparisNo })
      });
      line.siparis_no = modalSiparisNo;
      setEditingSiparisNo(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert("Sipariş numarası güncellenirken hata oluştu.");
    } finally {
      setSavingSiparis(false);
    }
  };

  const handleUpdateIntervention = async (id: number) => {
    const targetAssetId = (editingForm.assetId || '').trim();
    const targetCategory = (editingForm.category || '').trim();

    if (targetAssetId) {
      const duplicate = interventions.some(
        i => i.id !== id && (i.asset_id || '').trim() === targetAssetId && (i.category || '').trim() === targetCategory
      );
      if (duplicate) {
        alert(`⚠️ Mükerrer Kayıt Engellendi:\nBu hatta "${targetAssetId}" Asset ID'si için "${targetCategory}" kategorisinde zaten bir kayıt mevcuttur.`);
        return;
      }
    }

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
      setInterventions(prev => prev.map(i => i.id === id ? updatedInt : i));
      setEditingInterventionId(null);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(err?.message || "Düzenleme kaydedilirken hata oluştu.");
    } finally {
      setEditingSaving(false);
    }
  };


  const [modalFilter, setModalFilter] = useState<'ALL' | 'UNINSPECTED' | 'INSPECTED'>('ALL');
  const [modalSearch, setModalSearch] = useState('');
  const [quickUpdatingId, setQuickUpdatingId] = useState<number | null>(null);

  const handleQuickStatusUpdate = async (id: number, newStatus: string) => {
    setQuickUpdatingId(id);
    try {
      const updatedInt = await fetchAPI(`/interventions/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: newStatus
        })
      });
      setInterventions(prev => prev.map(i => i.id === id ? updatedInt : i));
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(err?.message || "Durum güncellenirken hata oluştu.");
    } finally {
      setQuickUpdatingId(null);
    }
  };

  const isUninspected = (inv: any) => {
    const s = (inv.status || '').toUpperCase().replace(/İ/g, 'I');
    return s.includes('KONTROL EDILMEDI') || s.includes('KONTROL_EDILMEDI');
  };

  useEffect(() => {
    setCurrentUser(localStorage.getItem('username') || "");
    setUserRole(localStorage.getItem('role') || "");
  }, []);

  const loadInterventions = useCallback(async () => {
    if (!line) return;
    try {
      const history = await fetchAPI(`/interventions/${line.sira_no}`);
      setInterventions(history);
    } catch (err) {
      console.error(err);
    }
  }, [line]);

  const handleAddCategoryItem = () => {
    const existingCats = formCategories.map(c => c.category);
    const nextCat = ALL_CATEGORIES.find(c => !existingCats.includes(c)) || ALL_CATEGORIES[0];
    setFormCategories(prev => [...prev, createDefaultCategoryItem(nextCat)]);
  };

  const handleRemoveCategoryItem = (id: string) => {
    if (formCategories.length <= 1) return;
    setFormCategories(prev => prev.filter(c => c.id !== id));
  };

  const handleUpdateCategoryField = (id: string, field: keyof FormCategoryItem, value: any) => {
    setFormCategories(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  useEffect(() => {
    if (isOpen && line) {
      loadInterventions();
      setSelectedInterventions([]);
      setModalSiparisNo(line.siparis_no || "");
      setEditingSiparisNo(false);
      setAssetId('');
      setFormCategories([createDefaultCategoryItem(line.defaultCategory || 'Ağaç Budama')]);
    }
  }, [isOpen, line, loadInterventions]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line) return;

    const parsedIds = Array.from(new Set(parseAssetIds(assetId).map(id => id.trim()).filter(Boolean)));
    if (parsedIds.length === 0) {
      alert("Lütfen en az bir Asset ID giriniz.");
      return;
    }

    for (const cat of formCategories) {
      if (cat.category === 'Koridor Açma' && !cat.lengthKm) {
        alert(`"Koridor Açma" kategorisi için uzunluk (Km) girilmesi zorunludur.`);
        return;
      }
    }

    // Mükerrer Kontrolü: Aynı hat ve kategori altında aynı Asset ID olamaz
    const duplicateWarnings: string[] = [];
    for (const singleAssetId of parsedIds) {
      for (const cat of formCategories) {
        const exists = interventions.some(
          i => (i.asset_id || '').trim() === singleAssetId && (i.category || '').trim() === (cat.category || '').trim()
        );
        if (exists) {
          duplicateWarnings.push(`• Asset ID: ${singleAssetId} (${cat.category})`);
        }
      }
    }

    if (duplicateWarnings.length > 0) {
      alert(`⚠️ Mükerrer Kayıt Engellendi!\nBu hatta aşağıdaki varlık ve kategori kombinasyonları zaten kayıtlıdır:\n\n${duplicateWarnings.join('\n')}\n\nLütfen mükerrer Asset ID'leri listeden çıkarıp tekrar deneyiniz.`);
      return;
    }

    setSaving(true);
    try {
      const savePromises: Promise<any>[] = [];
      for (const singleAssetId of parsedIds) {
        for (const cat of formCategories) {
          savePromises.push(
            fetchAPI(`/interventions/${line.sira_no}`, {
              method: 'POST',
              body: JSON.stringify({
                category: cat.category,
                asset_id: singleAssetId,
                description: cat.desc || '',
                status: cat.statuses.filter((s: string) => s).join(', '),
                length_km: cat.category === 'Koridor Açma' && cat.lengthKm ? parseFloat(cat.lengthKm) : null,
                quantity: cat.category === 'Ağaç Budama' ? (parseInt(cat.quantity as any) || 1) : 1,
                intervention_unit: cat.interventionUnits.filter((u: string) => u).join(', ')
              })
            })
          );
        }
      }

      const newInts = await Promise.all(savePromises);
      setInterventions(prev => [...newInts, ...prev]);

      // Reset form for next Asset ID
      setAssetId('');
      setFormCategories([createDefaultCategoryItem(line.defaultCategory || 'Ağaç Budama')]);

      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(err?.message || "Müdahaleler kaydedilirken bir hata oluştu.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteIntervention = async (id: number) => {
    if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
    try {
      await fetchAPI(`/interventions/${id}`, { method: 'DELETE' });
      setInterventions(prev => prev.filter(i => i.id !== id));
      if (onRefresh) onRefresh();
    } catch(err) {
      alert("Silme işlemi başarısız.");
    }
  };

  const handleCreateRequest = async (id: number, type: string, newData: string | null = null) => {
    if (type === 'DELETE' && !confirm('Bu kaydın silinmesi için talep oluşturmak istediğinize emin misiniz?')) return;
    try {
      await fetchAPI(`/interventions/${id}/request`, {
        method: 'POST',
        body: JSON.stringify({ request_type: type, new_data: newData })
      });
      alert("Talep başarıyla oluşturuldu.");
      setEditingRequestInterventionId(null);
      loadInterventions();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert("Talep oluşturulurken hata oluştu.");
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

  const formatLineDate = (val: any) => {
    if (!val) return '-';
    if (typeof val === 'string' && val.includes('.')) return val;
    try {
      const date = new Date(val);
      if (isNaN(date.getTime())) return val;
      return date.toLocaleDateString('tr-TR');
    } catch(e) {
      return val;
    }
  };

  if (!isOpen || !line) return null;

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
          <h3 style={{ margin: 0 }}>📍 {line.il} - {line.hat_ismi} <span className="text-muted" style={{fontSize:'0.9rem'}}>(No: {line.sira_no})</span></h3>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:'var(--text-secondary)', cursor:'pointer', fontSize:'1.5rem' }}>&times;</button>
        </div>
        
        <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
          
          {/* Hat Kayıt Bilgileri Tablosu/Grid'i */}
          <div style={{ 
            backgroundColor: 'rgba(255,255,255,0.02)', 
            border: '1px solid var(--border-color)', 
            borderRadius: '8px', 
            padding: '1rem', 
            marginBottom: '1.5rem', 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
            gap: '1rem',
            fontSize: '0.8rem'
          }}>
            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem', fontSize: '0.75rem' }}>Dağıtım Şirketi</span>
              <strong style={{ color: 'var(--text-primary)' }}>{line.dagitim_sirketi || '-'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem', fontSize: '0.75rem' }}>İl / İlçe</span>
              <strong style={{ color: 'var(--text-primary)' }}>{line.il || '-'} / {line.ilce || '-'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem', fontSize: '0.75rem' }}>Operasyon Merkezi</span>
              <strong style={{ color: 'var(--text-primary)' }}>{line.operasyon_merkezi || '-'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem', fontSize: '0.75rem' }}>Gerilim Seviyesi</span>
              <strong style={{ color: 'var(--text-primary)' }}>{line.gerilim_seviyesi || '-'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem', fontSize: '0.75rem' }}>Hat Uzunluğu</span>
              <strong style={{ color: 'var(--text-primary)' }}>{line.hat_uzunlugu || '-'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem', fontSize: '0.75rem' }}>Mevcut Risk</span>
              <strong style={{ color: 'var(--text-primary)' }}>{line.mevcut_risk || '-'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem', fontSize: '0.75rem' }}>Planlanan Bakım</span>
              <strong style={{ color: 'var(--text-primary)' }}>{formatLineDate(line.planlanan_bakim)}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem', fontSize: '0.75rem' }}>Gerçekleşen Bakım</span>
              <strong style={{ color: 'var(--text-primary)' }}>{formatLineDate(line.gerceklesen_bakim)}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem', fontSize: '0.75rem' }}>Sipariş No</span>
              {editingSiparisNo ? (
                <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginTop: '0.2rem' }}>
                  <input 
                    type="text" 
                    value={modalSiparisNo}
                    onChange={e => setModalSiparisNo(e.target.value)}
                    placeholder="Sipariş No"
                    autoFocus
                    style={{ padding: '0.2rem 0.4rem', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'white', width: '110px' }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveModalSiparis();
                      if (e.key === 'Escape') setEditingSiparisNo(false);
                    }}
                  />
                  <button 
                    type="button" 
                    onClick={handleSaveModalSiparis}
                    disabled={savingSiparis}
                    className="btn btn-primary"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                    title="Kaydet"
                  >
                    💾
                  </button>
                  <button 
                    type="button" 
                    onClick={() => {
                      setModalSiparisNo(line.siparis_no || "");
                      setEditingSiparisNo(false);
                    }}
                    className="btn btn-secondary"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                    title="İptal"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{modalSiparisNo || '-'}</strong>
                  {userRole !== 'izleyici' && (
                    <button 
                      type="button"
                      onClick={() => setEditingSiparisNo(true)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, fontSize: '0.85rem', padding: 0 }}
                      title="Sipariş Numarasını Düzenle"
                    >
                      ✏️
                    </button>
                  )}
                </div>
              )}
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.1rem', fontSize: '0.75rem' }}>Son Durum</span>
              <span style={{ 
                padding: '0.15rem 0.4rem', 
                borderRadius: '10px', 
                fontSize: '0.75rem',
                fontWeight: 'bold',
                background: line.son_durum === 'TAMAMLANDI' ? 'rgba(16, 185, 129, 0.2)' : line.son_durum === 'YAPILMADI' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                color: line.son_durum === 'TAMAMLANDI' ? '#10b981' : line.son_durum === 'YAPILMADI' ? '#ef4444' : 'var(--text-secondary)',
                display: 'inline-block',
                marginTop: '0.1rem'
              }}>
                {line.son_durum || '-'}
              </span>
            </div>
          </div>

          {/* Form */}
          {userRole !== 'izleyici' && (
          <form onSubmit={handleSave} style={{ marginBottom: '2rem' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.3rem' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--accent-color)', margin: 0 }}>
                    🏷️ Asset ID(ler) *
                  </label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    💡 Birden çok direk/nokta için aralara boşluk koyabilirsiniz (Örn: <code>101 102 103</code>)
                  </span>
                </div>
                <input 
                  type="text" 
                  value={assetId} 
                  placeholder="Örn: 101 102 103 veya D-10, D-11"
                  onChange={e => setAssetId(e.target.value)} 
                  required 
                  style={{ width: '100%', padding: '0.6rem 0.8rem', fontSize: '0.95rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'white' }}
                />
                {parseAssetIds(assetId).length > 1 && (
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px', fontSize: '0.8rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span>✨ <strong>{parseAssetIds(assetId).length} adet Asset ID algılandı:</strong></span>
                    <span style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {parseAssetIds(assetId).map((id, idx) => (
                        <span key={idx} style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.75rem' }}>
                          {id}
                        </span>
                      ))}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                      ↳ Her biri için ayrı satır oluşturulacak
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  📋 Müdahale Kategorileri ({formCategories.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddCategoryItem}
                  className="btn"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', backgroundColor: 'rgba(96, 165, 250, 0.15)', color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.3)', borderRadius: '6px' }}
                >
                  ➕ Başka Kategori Ekle
                </button>
              </div>

              {/* Kategori Kartları */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {formCategories.map((catItem, catIdx) => (
                  <div 
                    key={catItem.id} 
                    style={{ 
                      background: 'rgba(0, 0, 0, 0.25)', 
                      border: '1px solid rgba(255, 255, 255, 0.1)', 
                      borderRadius: '8px', 
                      padding: '1rem',
                      borderLeft: '4px solid var(--accent-color)'
                    }}
                  >
                    {/* Kart Başlığı */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '220px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Kategori {catIdx + 1}:</span>
                        <select 
                          value={catItem.category} 
                          onChange={e => handleUpdateCategoryField(catItem.id, 'category', e.target.value)}
                          style={{ padding: '0.4rem 0.6rem', fontSize: '0.9rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'white', fontWeight: 500 }}
                        >
                          {ALL_CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>

                      {formCategories.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCategoryItem(catItem.id)}
                          style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', borderRadius: '4px', padding: '0.3rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer' }}
                        >
                          🗑️ Kategoriyi Kaldır
                        </button>
                      )}
                    </div>

                    {/* Birimler ve Durumlar */}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                        Müdahale Edecek Birimler ve Durumları *
                      </label>
                      {catItem.interventionUnits.map((unit: string, unitIdx: number) => {
                        const otherSelected = catItem.interventionUnits.filter((_: any, i: number) => i !== unitIdx);
                        const allOptions = ['BELLİ DEĞİL', 'BAKIM S2', 'BAKIM S3', 'OPERASYON', 'YATIRIM'];
                        const availableOptions = allOptions.filter(opt => opt === 'BELLİ DEĞİL' || !otherSelected.includes(opt));
                        const unitStatus = catItem.statuses[unitIdx] || 'Yapılmadı';

                        return (
                          <div key={unitIdx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.3rem' }}>
                            <select 
                              value={unit} 
                              onChange={e => {
                                const newUnits = [...catItem.interventionUnits];
                                newUnits[unitIdx] = e.target.value;
                                handleUpdateCategoryField(catItem.id, 'interventionUnits', newUnits);
                              }}
                              style={{ flex: 2, padding: '0.4rem', fontSize: '0.85rem' }}
                            >
                              {availableOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                            <select
                              value={unitStatus}
                              onChange={e => {
                                const newStatuses = [...catItem.statuses];
                                newStatuses[unitIdx] = e.target.value;
                                handleUpdateCategoryField(catItem.id, 'statuses', newStatuses);
                              }}
                              style={{ flex: 1.2, padding: '0.4rem', fontSize: '0.85rem' }}
                            >
                              <option value="Yapılmadı">Yapılmadı</option>
                              <option value="Yapıldı">Yapıldı</option>
                              <option value="Bekliyor">Bekliyor</option>
                            </select>
                            {unitIdx === 0 ? (
                              <button 
                                type="button" 
                                className="btn btn-secondary" 
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.9rem', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
                                onClick={() => {
                                  handleUpdateCategoryField(catItem.id, 'interventionUnits', [...catItem.interventionUnits, 'BELLİ DEĞİL']);
                                  handleUpdateCategoryField(catItem.id, 'statuses', [...catItem.statuses, 'Yapılmadı']);
                                }}
                                title="Birim Ekle"
                              >
                                ➕
                              </button>
                            ) : (
                              <button 
                                type="button" 
                                className="btn btn-danger" 
                                style={{ padding: '0.3rem 0.6rem', fontSize: '0.9rem', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                onClick={() => {
                                  const newUnits = catItem.interventionUnits.filter((_: any, i: number) => i !== unitIdx);
                                  const newStatuses = catItem.statuses.filter((_: any, i: number) => i !== unitIdx);
                                  handleUpdateCategoryField(catItem.id, 'interventionUnits', newUnits);
                                  handleUpdateCategoryField(catItem.id, 'statuses', newStatuses);
                                }}
                                title="Birimi Kaldır"
                              >
                                ❌
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Kategoriye Özel Alanlar */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      {catItem.category === 'Koridor Açma' && (
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>Uzunluk (Km) *</label>
                          <input 
                            type="text" 
                            placeholder="Örn: 0.4" 
                            value={catItem.lengthKm} 
                            onChange={e => handleUpdateCategoryField(catItem.id, 'lengthKm', e.target.value)} 
                            required 
                            style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
                          />
                        </div>
                      )}
                      {catItem.category === 'Ağaç Budama' && (
                        <div>
                          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>Ara Sayısı (Adet) *</label>
                          <input 
                            type="number" 
                            min="1" 
                            value={catItem.quantity} 
                            onChange={e => handleUpdateCategoryField(catItem.id, 'quantity', parseInt(e.target.value) || 1)} 
                            required 
                            style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Kategoriye Özel Açıklama Textbox */}
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>
                        📝 {catItem.category} Açıklaması
                      </label>
                      <textarea 
                        rows={2} 
                        value={catItem.desc} 
                        onChange={e => handleUpdateCategoryField(catItem.id, 'desc', e.target.value)} 
                        placeholder={`${catItem.category} için açıklama yazabilirsiniz...`}
                        style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Alt Butonlar */}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={saving || parseAssetIds(assetId).length === 0}
                  style={{ padding: '0.6rem 1.25rem', fontWeight: 'bold' }}
                >
                  {saving 
                    ? 'Kaydediliyor...' 
                    : parseAssetIds(assetId).length > 1 
                      ? `💾 ${parseAssetIds(assetId).length} Asset ID × ${formCategories.length} Kategori (${parseAssetIds(assetId).length * formCategories.length} Kayıt) Oluştur` 
                      : formCategories.length > 1 
                        ? `💾 ${formCategories.length} Kategoriyi Kaydet ve Yeni Ekle` 
                        : '💾 Kaydet ve Yeni Ekle'
                  }
                </button>
                <button
                  type="button"
                  onClick={handleAddCategoryItem}
                  className="btn btn-secondary"
                  style={{ padding: '0.6rem 1rem', fontSize: '0.85rem' }}
                >
                  ➕ Başka Kategori Ekle
                </button>
              </div>
            </div>
          </form>
          )}

          {/* Envanter Kontrol Durumu Özeti */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
            gap: '0.75rem', 
            marginBottom: '1.5rem' 
          }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem 1rem', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Toplam Varlık</span>
              <strong style={{ fontSize: '1.25rem', color: 'var(--text-primary)' }}>{interventions.length}</strong>
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', padding: '0.75rem 1rem', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'block' }}>🟢 Kontrol Edilen</span>
              <strong style={{ fontSize: '1.25rem', color: '#10b981' }}>{interventions.filter(i => !isUninspected(i)).length}</strong>
            </div>
            <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '0.75rem 1rem', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#ef4444', display: 'block' }}>🔴 Kontrol Bekleyen</span>
              <strong style={{ fontSize: '1.25rem', color: '#ef4444' }}>{interventions.filter(i => isUninspected(i)).length}</strong>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <h4 style={{ margin: 0 }}>Varlık Kayıtları ({interventions.length})</h4>
              
              {/* Filter Tabs */}
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-color)', marginLeft: '0.5rem' }}>
                <button 
                  type="button"
                  onClick={() => setModalFilter('ALL')}
                  style={{
                    padding: '0.25rem 0.6rem',
                    fontSize: '0.75rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: modalFilter === 'ALL' ? 'var(--accent-color)' : 'transparent',
                    color: modalFilter === 'ALL' ? 'white' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: modalFilter === 'ALL' ? 'bold' : 'normal'
                  }}
                >
                  Tümü ({interventions.length})
                </button>
                <button 
                  type="button"
                  onClick={() => setModalFilter('UNINSPECTED')}
                  style={{
                    padding: '0.25rem 0.6rem',
                    fontSize: '0.75rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: modalFilter === 'UNINSPECTED' ? '#ef4444' : 'transparent',
                    color: modalFilter === 'UNINSPECTED' ? 'white' : '#f87171',
                    cursor: 'pointer',
                    fontWeight: modalFilter === 'UNINSPECTED' ? 'bold' : 'normal'
                  }}
                >
                  🔴 Kontrol Bekleyen ({interventions.filter(i => isUninspected(i)).length})
                </button>
                <button 
                  type="button"
                  onClick={() => setModalFilter('INSPECTED')}
                  style={{
                    padding: '0.25rem 0.6rem',
                    fontSize: '0.75rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: modalFilter === 'INSPECTED' ? '#10b981' : 'transparent',
                    color: modalFilter === 'INSPECTED' ? 'white' : '#34d399',
                    cursor: 'pointer',
                    fontWeight: modalFilter === 'INSPECTED' ? 'bold' : 'normal'
                  }}
                >
                  🟢 Kontrol Edilen ({interventions.filter(i => !isUninspected(i)).length})
                </button>
              </div>
            </div>

            {/* Quick Search */}
            <div style={{ flex: '1', minWidth: '220px', maxWidth: '350px', position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                type="text" 
                placeholder="🔍 Asset ID (Varlık No) veya Kategori Ara..." 
                value={modalSearch}
                onChange={e => setModalSearch(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '0.45rem 2rem 0.45rem 0.75rem', 
                  fontSize: '0.85rem', 
                  background: 'rgba(0,0,0,0.3)', 
                  border: modalSearch ? '1px solid var(--accent-color)' : '1px solid var(--border-color)', 
                  borderRadius: '6px', 
                  color: 'white' 
                }}
              />
              {modalSearch && (
                <button 
                  type="button" 
                  onClick={() => setModalSearch('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                  title="Aramayı Temizle"
                >
                  ✕
                </button>
              )}
            </div>

            {interventions.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginRight: '0.5rem' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedInterventions.length > 0 && selectedInterventions.length === (modalFilter === 'ALL' ? interventions.length : (modalFilter === 'UNINSPECTED' ? interventions.filter(i => isUninspected(i)).length : interventions.filter(i => !isUninspected(i)).length))}
                    onChange={(e) => {
                      let targetList = interventions;
                      if (modalFilter === 'UNINSPECTED') targetList = interventions.filter(i => isUninspected(i));
                      else if (modalFilter === 'INSPECTED') targetList = interventions.filter(i => !isUninspected(i));
                      
                      if (modalSearch.trim()) {
                        const q = modalSearch.toLowerCase().trim();
                        targetList = targetList.filter(i => (i.asset_id && i.asset_id.toLowerCase().includes(q)) || (i.category && i.category.toLowerCase().includes(q)));
                      }

                      if (e.target.checked) setSelectedInterventions(targetList.map(i => i.id));
                      else setSelectedInterventions([]);
                    }}
                  />
                  <span style={{ fontSize: '0.85rem' }}>Listelenenleri Seç</span>
                </label>
                {userRole !== 'izleyici' && (
                  <>
                    <button 
                      type="button"
                      className="btn" 
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', backgroundColor: '#10b981', color: 'white', fontWeight: 600 }}
                      onClick={() => handleBulkStatusUpdate('Yapıldı')}
                      disabled={bulkSaving || selectedInterventions.length === 0}
                    >
                      {bulkSaving ? '...' : '✅ Yapıldı İşaretle'}
                    </button>
                    <button 
                      type="button"
                      className="btn" 
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', backgroundColor: '#ef4444', color: 'white', fontWeight: 600 }}
                      onClick={() => handleBulkStatusUpdate('Yapılmadı')}
                      disabled={bulkSaving || selectedInterventions.length === 0}
                    >
                      {bulkSaving ? '...' : '❌ Yapılmadı İşaretle'}
                    </button>
                    <button 
                      type="button"
                      className="btn" 
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', backgroundColor: '#f59e0b', color: 'white', fontWeight: 600 }}
                      onClick={() => handleBulkStatusUpdate('Bekliyor')}
                      disabled={bulkSaving || selectedInterventions.length === 0}
                    >
                      {bulkSaving ? '...' : '⏳ Bekliyor İşaretle'}
                    </button>
                    <button 
                      type="button"
                      className="btn" 
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', backgroundColor: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#ef4444', marginLeft: 'auto' }}
                      onClick={handleBulkDelete}
                      disabled={bulkSaving || selectedInterventions.length === 0}
                    >
                      {bulkSaving ? '...' : '🗑️ Seçilenleri Sil'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div>
            {interventions
              .filter(intv => {
                if (modalFilter === 'UNINSPECTED' && !isUninspected(intv)) return false;
                if (modalFilter === 'INSPECTED' && isUninspected(intv)) return false;
                if (modalSearch.trim()) {
                  const q = modalSearch.toLowerCase().trim();
                  return (intv.asset_id && intv.asset_id.toLowerCase().includes(q)) ||
                         (intv.category && intv.category.toLowerCase().includes(q)) ||
                         (intv.description && intv.description.toLowerCase().includes(q)) ||
                         (intv.intervention_unit && intv.intervention_unit.toLowerCase().includes(q));
                }
                return true;
              })
              .map((intv) => (
              <div key={intv.id} style={{ padding: '1rem', backgroundColor: selectedInterventions.includes(intv.id) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', marginBottom: '0.5rem', border: `1px solid ${selectedInterventions.includes(intv.id) ? '#10b981' : 'var(--glass-border)'}`, display: 'flex', gap: '1rem', alignItems: 'flex-start', transition: 'all 0.2s' }}>
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
                          {validateSingleAssetId(editingForm.assetId) && (
                            <span style={{ display: 'block', color: '#f87171', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                              ⚠️ {validateSingleAssetId(editingForm.assetId)}
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
                                <option value="Bekliyor">Bekliyor</option>
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
                          disabled={editingSaving || !!validateSingleAssetId(editingForm.assetId)}
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ cursor: 'pointer', fontSize: '1rem' }} onClick={() => {
                            if (selectedInterventions.includes(intv.id)) setSelectedInterventions(selectedInterventions.filter(id => id !== intv.id));
                            else setSelectedInterventions([...selectedInterventions, intv.id]);
                          }}>{intv.asset_id}</strong>
                          
                          {intv.asset_type && (
                            <span style={{
                              padding: '0.1rem 0.45rem',
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

                          {isUninspected(intv) ? (
                            <span style={{
                              padding: '0.1rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 'bold',
                              background: 'rgba(239, 68, 68, 0.2)',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.4)'
                            }}>
                              🔴 KONTROL BEKLİYOR
                            </span>
                          ) : (
                            <span style={{
                              padding: '0.1rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: 'bold',
                              background: intv.status?.includes('Yapıldı') ? 'rgba(16, 185, 129, 0.2)' : intv.status?.includes('Bekliyor') ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.15)',
                              color: intv.status?.includes('Yapıldı') ? '#10b981' : intv.status?.includes('Bekliyor') ? '#f59e0b' : '#ef4444',
                              border: '1px solid rgba(255,255,255,0.1)'
                            }}>
                              {intv.status?.includes('Yapıldı') ? '✅ YAPILDI' : intv.status?.includes('Bekliyor') ? '⏳ BEKLİYOR' : '❌ YAPILMADI'}
                            </span>
                          )}
                        </div>
                        <span className="text-muted" style={{fontSize:'0.8rem'}}>{new Date(intv.created_at).toLocaleString('tr-TR')}</span>
                      </div>
                      
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                        <span className="text-accent" style={{ fontWeight: 600 }}>{intv.category}</span> • Birimler: <span style={{ color: '#f59e0b', fontWeight: '600' }}>{formatUnitsWithStatuses(intv.intervention_unit, intv.status)}</span> • Ekleyen: <span style={{ color: 'var(--text-primary)' }}>{intv.created_by}</span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ flex: 1, minWidth: '200px' }}>
                          {intv.description && <p style={{ fontSize: '0.85rem', margin: 0, color: 'var(--text-secondary)' }}>{intv.description}</p>}
                          {intv.category === 'Koridor Açma' && intv.length_km && <p style={{ fontSize: '0.85rem', margin: '0.25rem 0 0 0', color: 'var(--text-secondary)' }}>Uzunluk: {intv.length_km} Km</p>}
                          {intv.category === 'Ağaç Budama' && intv.quantity && <p style={{ fontSize: '0.85rem', margin: '0.25rem 0 0 0', color: 'var(--text-secondary)' }}>Ara Sayısı: {intv.quantity} Adet</p>}
                          
                          {editingRequestInterventionId === intv.id && (
                            <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-md)' }}>
                              <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>📝 Düzenleme Talebi</h5>
                              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <select 
                                  value={editRequestData.status} 
                                  onChange={e => setEditRequestData({...editRequestData, status: e.target.value})}
                                  style={{ padding: '0.25rem', fontSize: '0.85rem' }}
                                >
                                  <option>Yapıldı</option>
                                  <option>Yapılmadı</option>
                                  <option>Bekliyor</option>
                                </select>
                              </div>
                              <textarea 
                                value={editRequestData.description}
                                onChange={e => setEditRequestData({...editRequestData, description: e.target.value})}
                                placeholder="Yeni açıklama..."
                                style={{ width: '100%', padding: '0.25rem', fontSize: '0.85rem', marginBottom: '0.5rem' }}
                                rows={2}
                              />
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button type="button" className="btn btn-primary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                                  onClick={() => handleCreateRequest(intv.id, 'UPDATE', JSON.stringify(editRequestData))}>Talep Gönder</button>
                                <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                                  onClick={() => setEditingRequestInterventionId(null)}>İptal</button>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          {userRole !== 'izleyici' && (
                            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                              <button 
                                type="button"
                                onClick={() => handleQuickStatusUpdate(intv.id, 'Yapıldı')}
                                disabled={quickUpdatingId === intv.id}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.75rem',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(16, 185, 129, 0.4)',
                                  background: intv.status?.includes('Yapıldı') ? '#10b981' : 'rgba(16, 185, 129, 0.15)',
                                  color: intv.status?.includes('Yapıldı') ? 'white' : '#34d399',
                                  cursor: 'pointer',
                                  fontWeight: 500
                                }}
                                title="Yapıldı olarak işaretle"
                              >
                                ✅ Yapıldı
                              </button>
                              <button 
                                type="button"
                                onClick={() => handleQuickStatusUpdate(intv.id, 'Yapılmadı')}
                                disabled={quickUpdatingId === intv.id}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.75rem',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(239, 68, 68, 0.4)',
                                  background: (!isUninspected(intv) && intv.status?.includes('Yapılmadı')) ? '#ef4444' : 'rgba(239, 68, 68, 0.15)',
                                  color: (!isUninspected(intv) && intv.status?.includes('Yapılmadı')) ? 'white' : '#f87171',
                                  cursor: 'pointer',
                                  fontWeight: 500
                                }}
                                title="Yapılmadı olarak işaretle"
                              >
                                ❌ Yapılmadı
                              </button>
                              <button 
                                type="button"
                                onClick={() => handleQuickStatusUpdate(intv.id, 'Bekliyor')}
                                disabled={quickUpdatingId === intv.id}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.75rem',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(245, 158, 11, 0.4)',
                                  background: intv.status?.includes('Bekliyor') ? '#f59e0b' : 'rgba(245, 158, 11, 0.15)',
                                  color: intv.status?.includes('Bekliyor') ? 'white' : '#fbbf24',
                                  cursor: 'pointer',
                                  fontWeight: 500
                                }}
                                title="Bekliyor olarak işaretle"
                              >
                                ⏳ Bekliyor
                              </button>
                            </div>
                          )}

                          {intv.flag_request === 'PENDING' ? (
                            <span style={{ fontSize: '0.8rem', color: '#fbbf24', background: 'rgba(251, 191, 36, 0.1)', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>⏳ Talep Bekleniyor</span>
                          ) : (
                            <>
                              {userRole !== 'izleyici' && (
                                <>
                                  {(userRole === 'admin' || currentUser === intv.created_by || intv.created_by === 'GIS Envanter') ? (
                                    <>
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
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0.3rem', color: '#60a5fa', opacity: 0.8 }}
                                        title="Kaydı Düzenle"
                                      >
                                        ✏️
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => handleDeleteIntervention(intv.id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0.3rem', color: '#ef4444', opacity: 0.8 }}
                                        title="Kaydı Sil"
                                      >
                                        🗑️
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button 
                                        type="button"
                                        onClick={() => {
                                          setEditingRequestInterventionId(intv.id);
                                          setEditRequestData({ status: intv.status, description: intv.description || '', lengthKm: intv.length_km?.toString() || '' });
                                        }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0.2rem', color: '#60a5fa', opacity: 0.8 }}
                                        title="Düzenleme Talep Et"
                                      >
                                        ✏️
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => handleCreateRequest(intv.id, 'DELETE')}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0.2rem', color: '#fbbf24', opacity: 0.8 }}
                                        title="Silme Talep Et"
                                      >
                                        🗑️
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
            {interventions.length === 0 && <p className="text-muted" style={{fontSize:'0.9rem'}}>Henüz kayıt yok.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
