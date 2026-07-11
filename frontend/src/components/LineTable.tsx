"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { fetchAPI } from "../lib/api";

export default function LineTable() {
  const [lines, setLines] = useState<any[]>([]);
  const [filteredLines, setFilteredLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLine, setSelectedLine] = useState<any>(null);
  
  // Filters
  const [cities, setCities] = useState<string[]>(["Tümü"]);
  const [omList, setOmList] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState("Tümü");
  const [selectedOms, setSelectedOms] = useState<string[]>([]);
  const [omDropdownOpen, setOmDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [interventions, setInterventions] = useState<any[]>([]);
  const [selectedInterventions, setSelectedInterventions] = useState<number[]>([]);
  const [form, setForm] = useState({ category: 'Ağaç Budama', status: 'Yapılmadı', assetId: '', desc: '', lengthKm: '', quantity: 1 });
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  
  const [currentUser, setCurrentUser] = useState("");
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    setCurrentUser(localStorage.getItem('username') || "");
    setUserRole(localStorage.getItem('role') || "");
    initData();
  }, []);

  const handleDeleteIntervention = async (id: number) => {
    if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
    try {
      await fetchAPI(`/interventions/${id}`, { method: 'DELETE' });
      const newInterventions = interventions.filter(i => i.id !== id);
      setInterventions(newInterventions);
      loadLines();
    } catch(err) {
      alert("Silme işlemi başarısız.");
    }
  };

  const [editingRequestInterventionId, setEditingRequestInterventionId] = useState<number | null>(null);
  const [editRequestData, setEditRequestData] = useState({ status: 'Yapıldı', description: '', lengthKm: '' });

  const handleCreateRequest = async (id: number, type: string, newData: string | null = null) => {
    if (type === 'DELETE' && !confirm('Bu kaydın silinmesi için talep oluşturmak istediğinize emin misiniz?')) return;
    try {
      await fetchAPI(`/interventions/${id}/request`, {
        method: 'POST',
        body: JSON.stringify({ request_type: type, new_data: newData })
      });
      alert('Talebiniz başarıyla iletildi.');
      setInterventions(interventions.map(i => i.id === id ? { ...i, flag_request: 'PENDING' } : i));
      setEditingRequestInterventionId(null);
    } catch(err) {
      alert("Talep iletilemedi.");
    }
  };

  const initData = async () => {
    try {
      // Get user profile first to set default IL and OMs
      let defaultIl = "Tümü";
      let defaultOms: string[] = [];
      try {
        const user = await fetchAPI('/me');
        if (user && user.default_il) {
          defaultIl = user.default_il;
          setSelectedCity(defaultIl);
        }
        if (user && user.default_oms) {
          defaultOms = user.default_oms.split(',').map((o: string) => o.trim()).filter(Boolean);
          setSelectedOms(defaultOms);
        }
      } catch(e) {}

      const data = await fetchAPI('/lines');
      setLines(data);
      
      
      // Extract unique cities
      const uniqueCities = Array.from(new Set(data.map((l: any) => l.il).filter(Boolean))).sort() as string[];
      setCities(["Tümü", ...uniqueCities]);
      
      // Apply initial filter
      applyFilters(data, defaultIl, defaultOms);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (data: any[], city: string, oms: string[]) => {
    let filtered = data;
    
    // First filter by city to get the relevant OMs for the dropdown
    let cityFiltered = data;
    if (city !== "Tümü") {
      cityFiltered = data.filter(l => l.il === city);
      filtered = cityFiltered;
    }
    
    // Update OM dropdown list based on the selected city
    const uniqueOms = Array.from(new Set(cityFiltered.map((l: any) => l.operasyon_merkezi).filter(Boolean))).sort() as string[];
    setOmList(uniqueOms);

    // Filter by OMs if any are selected
    if (oms.length > 0) {
      filtered = filtered.filter(l => oms.includes(l.operasyon_merkezi));
    }

    setFilteredLines(filtered);
  };

  useEffect(() => {
    applyFilters(lines, selectedCity, selectedOms);
  }, [selectedCity, selectedOms, lines]);

  const toggleOm = (om: string) => {
    setSelectedOms(prev => 
      prev.includes(om) ? prev.filter(o => o !== om) : [...prev, om]
    );
  };

  const handleSaveDefaults = async () => {
    try {
      await fetchAPI('/me/defaults', {
        method: 'PUT',
        body: JSON.stringify({
          default_il: selectedCity,
          default_oms: selectedOms.join(',')
        })
      });
      alert('Varsayılan filtreleriniz başarıyla kaydedildi.');
    } catch (err) {
      alert('Varsayılan ayarlar kaydedilirken hata oluştu.');
      console.error(err);
    }
  };

  const loadLines = async () => {
    try {
      const data = await fetchAPI('/lines');
      setLines(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRowClick = useCallback(async (line: any) => {
    setSelectedLine(line);
    setIsModalOpen(true);
    setSelectedInterventions([]); // Reset selections on modal open
    // Fetch interventions for this line
    try {
      const history = await fetchAPI(`/interventions/${line.sira_no}`);
      setInterventions(history);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleCategoryClick = useCallback((e: React.MouseEvent, line: any, category: string) => {
    e.stopPropagation();
    setForm(prev => ({ ...prev, category }));
    handleRowClick(line);
  }, [handleRowClick]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const newInt = await fetchAPI(`/interventions/${selectedLine.sira_no}`, {
        method: 'POST',
        body: JSON.stringify({
          category: form.category,
          asset_id: form.assetId,
          description: form.desc,
          status: form.status,
          length_km: form.lengthKm ? parseFloat(form.lengthKm) : null,
          quantity: form.category === 'Ağaç Budama' ? parseInt(form.quantity as any) || 1 : 1
        })
      });
      setInterventions([newInt, ...interventions]);
      setForm({...form, assetId: '', desc: '', lengthKm: '', quantity: 1}); // Clear form
      // Reload main lines in background to update counts
      loadLines();
    } catch (err) {
      alert("Kayıt sırasında hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  const handleBulkStatusUpdate = async (status: string) => {
    if (selectedInterventions.length === 0) return;
    setBulkSaving(true);
    try {
      await fetchAPI('/interventions/bulk-status', {
        method: 'PUT',
        body: JSON.stringify({
          ids: selectedInterventions,
          status: status
        })
      });
      
      // Update local state to reflect change without refetching history
      setInterventions(interventions.map(inv => 
        selectedInterventions.includes(inv.id) ? { ...inv, status: status } : inv
      ));
      setSelectedInterventions([]);
      // Reload main lines in background to update counts
      loadLines();
    } catch (err) {
      alert("Toplu güncelleme sırasında hata oluştu");
      console.error(err);
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedInterventions.length === 0) return;
    if (!confirm(`Seçili ${selectedInterventions.length} kaydı silmek istediğinize emin misiniz?`)) return;
    
    setBulkSaving(true);
    try {
      await fetchAPI('/interventions/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({
          ids: selectedInterventions
        })
      });
      
      setInterventions(interventions.filter(inv => !selectedInterventions.includes(inv.id)));
      setSelectedInterventions([]);
      loadLines();
    } catch (err) {
      alert("Toplu silme başarısız. Sadece kendi kayıtlarınızı silebilirsiniz.");
      console.error(err);
    } finally {
      setBulkSaving(false);
    }
  };

  const tableBodyRows = useMemo(() => {
    let result = filteredLines;
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(line => 
        (line.hat_ismi && line.hat_ismi.toLowerCase().includes(lowerSearch)) ||
        (line.operasyon_merkezi && line.operasyon_merkezi.toLowerCase().includes(lowerSearch))
      );
    }
    return result.map((line) => (
      <tr 
        key={line.sira_no} 
        onClick={() => handleRowClick(line)}
        style={{ borderBottom: '1px solid var(--glass-border)', cursor: 'pointer', transition: 'background 0.2s', whiteSpace: 'nowrap' }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{line.sira_no}</td>
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{line.il}</td>
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{line.ilce}</td>
        <td style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>{line.operasyon_merkezi}</td>
        <td style={{ padding: '1rem', fontSize: '0.9rem', fontWeight: 500, color: 'var(--accent-color)' }}>{line.hat_ismi}</td>
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{line.gerilim_seviyesi}</td>
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{line.hat_uzunlugu}</td>
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{line.mevcut_risk}</td>
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{line.planlanan_bakim ? new Date(line.planlanan_bakim).toLocaleDateString('tr-TR') : ''}</td>
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{line.gerceklesen_bakim ? new Date(line.gerceklesen_bakim).toLocaleDateString('tr-TR') : ''}</td>
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{line.siparis_no}</td>
        <td onClick={(e) => handleCategoryClick(e, line, 'Ağaç Budama')} style={{ padding: '1rem', fontSize: '0.9rem', cursor: 'pointer' }}>
          <span style={{ color: line.agac_budama_ok > 0 ? '#10b981' : 'inherit', fontWeight: line.agac_budama_ok > 0 ? 'bold' : 'normal' }}>{line.agac_budama_ok} ok</span>{' | '}
          <span style={{ color: line.agac_budama_nok > 0 ? '#ef4444' : 'inherit', fontWeight: line.agac_budama_nok > 0 ? 'bold' : 'normal' }}>{line.agac_budama_nok} nok</span>
          {' | '}
          <span style={{ color: line.ihale_budama ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>{line.ihale_budama ? 'var' : 'yok'}</span>
        </td>
        <td onClick={(e) => handleCategoryClick(e, line, 'Güzergah Değişimi')} style={{ padding: '1rem', fontSize: '0.9rem', cursor: 'pointer' }}>
          <span style={{ color: line.guzergah_degisimi_ok > 0 ? '#10b981' : 'inherit', fontWeight: line.guzergah_degisimi_ok > 0 ? 'bold' : 'normal' }}>{line.guzergah_degisimi_ok} ok</span>{' | '}
          <span style={{ color: line.guzergah_degisimi_nok > 0 ? '#ef4444' : 'inherit', fontWeight: line.guzergah_degisimi_nok > 0 ? 'bold' : 'normal' }}>{line.guzergah_degisimi_nok} nok</span>
        </td>
        <td onClick={(e) => handleCategoryClick(e, line, 'Beton Dökümü')} style={{ padding: '1rem', fontSize: '0.9rem', cursor: 'pointer' }}>
          <span style={{ color: line.beton_dokumu_ok > 0 ? '#10b981' : 'inherit', fontWeight: line.beton_dokumu_ok > 0 ? 'bold' : 'normal' }}>{line.beton_dokumu_ok} ok</span>{' | '}
          <span style={{ color: line.beton_dokumu_nok > 0 ? '#ef4444' : 'inherit', fontWeight: line.beton_dokumu_nok > 0 ? 'bold' : 'normal' }}>{line.beton_dokumu_nok} nok</span>
        </td>
        <td onClick={(e) => handleCategoryClick(e, line, 'Koridor Açma')} style={{ padding: '1rem', fontSize: '0.9rem', cursor: 'pointer' }}>
          <span style={{ color: line.koridor_acma_ok > 0 ? '#10b981' : 'inherit', fontWeight: line.koridor_acma_ok > 0 ? 'bold' : 'normal' }}>{line.koridor_acma_ok} ok</span>{' | '}
          <span style={{ color: line.koridor_acma_nok > 0 ? '#ef4444' : 'inherit', fontWeight: line.koridor_acma_nok > 0 ? 'bold' : 'normal' }}>{line.koridor_acma_nok} nok</span>
          {' | '}
          <span style={{ color: line.ihale_koridor ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>{line.ihale_koridor ? 'var' : 'yok'}</span>
        </td>
        <td onClick={(e) => handleCategoryClick(e, line, 'Operasyon Müdahalesi')} style={{ padding: '1rem', fontSize: '0.9rem', cursor: 'pointer' }}>
          <span style={{ color: line.operasyon_mudahalesi_ok > 0 ? '#10b981' : 'inherit', fontWeight: line.operasyon_mudahalesi_ok > 0 ? 'bold' : 'normal' }}>{line.operasyon_mudahalesi_ok} ok</span>{' | '}
          <span style={{ color: line.operasyon_mudahalesi_nok > 0 ? '#ef4444' : 'inherit', fontWeight: line.operasyon_mudahalesi_nok > 0 ? 'bold' : 'normal' }}>{line.operasyon_mudahalesi_nok} nok</span>
        </td>
      </tr>
    ));
  }, [filteredLines, searchTerm, handleCategoryClick, handleRowClick]);

  return (
    <div>

      <div className="filters-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: 0 }}>📋 Hat Listesi ve Veri Girişi</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem' }}>İl Filtresi</label>
            <select value={selectedCity} onChange={(e) => {
              setSelectedCity(e.target.value);
              setSelectedOms([]); // Reset OM selection when city changes
            }} style={{ padding: '0.5rem', minWidth: '150px' }}>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ position: 'relative' }}>
            <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem' }}>Operasyon Merkezi</label>
            <div 
              onClick={() => setOmDropdownOpen(!omDropdownOpen)}
              style={{ 
                padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', 
                borderRadius: 'var(--radius-md)', minWidth: '200px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between'
              }}
            >
              <span style={{ fontSize: '0.9rem', color: selectedOms.length ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {selectedOms.length > 0 ? `${selectedOms.length} Merkez Seçildi` : 'Tüm Merkezler'}
              </span>
              <span>▼</span>
            </div>
            {omDropdownOpen && (
              <div style={{ 
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '0.5rem',
                background: 'var(--surface-hover)', border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)', padding: '0.5rem', zIndex: 10,
                maxHeight: '250px', overflowY: 'auto', boxShadow: 'var(--shadow-md)'
              }}>
                {omList.map(om => (
                  <label key={om} style={{ display: 'flex', alignItems: 'center', padding: '0.5rem', cursor: 'pointer', margin: 0, borderRadius: '4px' }}
                         onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                         onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <input 
                      type="checkbox" 
                      checked={selectedOms.includes(om)}
                      onChange={() => toggleOm(om)}
                      style={{ width: 'auto', marginRight: '0.5rem' }}
                    />
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 'normal' }}>{om}</span>
                  </label>
                ))}
                {omList.length === 0 && <div style={{ padding: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Seçilen ile ait merkez yok</div>}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleSaveDefaults} 
              style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
            >
              💾 Varsayılan Yap
            </button>
          </div>
        </div>
      </div>
      
      <div style={{ marginBottom: '1rem' }}>
        <input 
          type="text" 
          placeholder="🔍 Hat ismi veya Operasyon Merkezi Ara..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ 
            width: '100%', 
            padding: '0.8rem 1rem', 
            borderRadius: 'var(--radius-md)', 
            border: '1px solid var(--border-color)',
            background: 'var(--surface-color)',
            color: 'var(--text-primary)'
          }} 
        />
      </div>
      
      <div className="glass-panel table-responsive" style={{ overflowX: 'auto', padding: '1px' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Hatlar yükleniyor...</div>
        ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1800px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Sıra No</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>İl</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>İlçe</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Operasyon Merkezi</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Hat İsmi</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Gerilim Seviyesi</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Hat Uzunluğu (Km)</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mevcut Risk</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Planlanan Bakım</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Gerçekleşen Bakım</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Sipariş No</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Ağaç Budama</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Güzergah Değişimi</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Beton Dökümü</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Koridor Açma</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Operasyon Müdahalesi</th>
                </tr>
              </thead>
              <tbody>
                {tableBodyRows}
              </tbody>
            </table>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && selectedLine && (
        <div className="modal-overlay" style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="glass-panel animate-fade-in modal-content" style={{ 
            width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
            backgroundColor: 'var(--surface-color)', overflow: 'hidden'
          }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>📍 {selectedLine.il} - {selectedLine.hat_ismi} <span className="text-muted" style={{fontSize:'0.9rem'}}>(No: {selectedLine.sira_no})</span></h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background:'transparent', border:'none', color:'var(--text-secondary)', cursor:'pointer', fontSize:'1.5rem' }}>&times;</button>
            </div>
            
            <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
              {/* Form */}
              <form onSubmit={handleSave} style={{ marginBottom: '2rem' }}>
                <div className="form-grid">
                  <div>
                    <label>Asset ID *</label>
                    <input type="text" value={form.assetId} onChange={e=>setForm({...form, assetId: e.target.value})} required />
                  </div>
                  <div>
                    <label>Kategori *</label>
                    <select value={form.category} onChange={e=>setForm({...form, category: e.target.value})}>
                      <option>Ağaç Budama</option>
                      <option>Güzergah Değişimi</option>
                      <option>Beton Dökümü</option>
                      <option>Koridor Açma</option>
                      <option>Operasyon Müdahalesi</option>
                    </select>
                  </div>
                  <div>
                    <label>Durum *</label>
                    <select value={form.status} onChange={e=>setForm({...form, status: e.target.value})}>
                      <option>Yapılmadı</option>
                      <option>Yapıldı</option>
                      <option>Bekliyor</option>
                    </select>
                  </div>
                  {form.category === 'Koridor Açma' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Uzunluk (Km)</label>
                      <input type="text" placeholder="Örn: 0.4" value={form.lengthKm} onChange={e=>setForm({...form, lengthKm: e.target.value})} required />
                    </div>
                  )}
                  {form.category === 'Ağaç Budama' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Ara Sayısı (Adet)</label>
                      <input type="number" min="1" value={form.quantity} onChange={e=>setForm({...form, quantity: parseInt(e.target.value) || 1})} required />
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label>Açıklama</label>
                  <textarea rows={2} value={form.desc} onChange={e=>setForm({...form, desc: e.target.value})} />
                </div>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Kaydediliyor...' : '💾 Kaydet ve Yeni Ekle'}
                </button>
              </form>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '2rem 0' }} />
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h4 style={{ margin: 0 }}>Önceki Kayıtlar ({interventions.length})</h4>
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
                      {bulkSaving ? '...' : '❌ Yapılmadı İşaretle'}
                    </button>
                    <button 
                      type="button"
                      className="btn" 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', backgroundColor: '#10b981', color: 'white' }}
                      onClick={() => handleBulkStatusUpdate('Yapıldı')}
                      disabled={bulkSaving || selectedInterventions.length === 0}
                    >
                      {bulkSaving ? '...' : '✅ Yapıldı İşaretle'}
                    </button>
                    <button 
                      type="button"
                      className="btn" 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', backgroundColor: '#ef4444', color: 'white', marginLeft: 'auto' }}
                      onClick={handleBulkDelete}
                      disabled={bulkSaving || selectedInterventions.length === 0}
                    >
                      {bulkSaving ? '...' : '🗑️ Seçilenleri Sil'}
                    </button>
                  </div>
                )}
              </div>

              <div>
                {interventions.map((intv) => (
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <strong style={{ cursor: 'pointer' }} onClick={() => {
                          if (selectedInterventions.includes(intv.id)) setSelectedInterventions(selectedInterventions.filter(id => id !== intv.id));
                          else setSelectedInterventions([...selectedInterventions, intv.id]);
                        }}>{intv.asset_id}</strong>
                        <span className="text-muted" style={{fontSize:'0.85rem'}}>{new Date(intv.created_at).toLocaleString('tr-TR')}</span>
                      </div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        <span className="text-accent">{intv.category}</span> • <span style={{ color: intv.status === 'Yapıldı' ? '#10b981' : intv.status === 'Yapılmadı' ? '#ef4444' : 'inherit', fontWeight: 'bold' }}>{intv.status}</span> • Ekleyen: {intv.created_by}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '0.5rem' }}>
                        <div style={{ flex: 1 }}>
                          {intv.description && <p style={{ fontSize: '0.85rem', margin: 0 }}>{intv.description}</p>}
                          
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
                        
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {intv.flag_request === 'PENDING' ? (
                            <span style={{ fontSize: '0.8rem', color: '#fbbf24', background: 'rgba(251, 191, 36, 0.1)', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>⏳ Talep Bekleniyor</span>
                          ) : (
                            <>
                              {(userRole === 'admin' || currentUser === intv.created_by) ? (
                                <button 
                                  type="button"
                                  onClick={() => handleDeleteIntervention(intv.id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.5rem', color: '#ef4444', opacity: 0.8 }}
                                  title="Kaydı Sil"
                                >
                                  🗑️
                                </button>
                              ) : (
                                <>
                                  <button 
                                    type="button"
                                    onClick={() => {
                                      setEditingRequestInterventionId(intv.id);
                                      setEditRequestData({ status: intv.status, description: intv.description || '', lengthKm: intv.length_km?.toString() || '' });
                                    }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.2rem', color: '#60a5fa', opacity: 0.8 }}
                                    title="Düzenleme Talep Et"
                                  >
                                    📝
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={() => handleCreateRequest(intv.id, 'DELETE')}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.2rem', color: '#fbbf24', opacity: 0.8 }}
                                    title="Silme Talep Et"
                                  >
                                    🗑️
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {interventions.length === 0 && <p className="text-muted" style={{fontSize:'0.9rem'}}>Henüz kayıt yok.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
