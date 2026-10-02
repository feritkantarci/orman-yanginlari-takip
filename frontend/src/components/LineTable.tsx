"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { fetchAPI } from "../lib/api";
import InterventionModal from "./InterventionModal";
import NewLineModal from "./NewLineModal";

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
  const [selectedStatus, setSelectedStatus] = useState("Tümü");
  const [selectedInspectionFilter, setSelectedInspectionFilter] = useState("Tümü");
  const [selectedUnitFilter, setSelectedUnitFilter] = useState("Tümü");
  const [selectedUnitStatusFilter, setSelectedUnitStatusFilter] = useState("Tümü");
  const [omDropdownOpen, setOmDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewLineModalOpen, setIsNewLineModalOpen] = useState(false);

  // Inline edit states
  const [editingSiparisNo, setEditingSiparisNo] = useState<number | null>(null);
  const [editSiparisValue, setEditSiparisValue] = useState<string>("");

  useEffect(() => {
    initData();
  }, []);

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
      applyFilters(data, defaultIl, defaultOms, "Tümü", "Tümü", "Tümü", "Tümü");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (data: any[], city: string, oms: string[], statusFilter: string, unitFilter: string, unitStatusFilter: string, inspectionFilter: string) => {
    let filtered = data;
    let cityFiltered = data;
    
    // Filter by City
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

    // Filter by Saha Tespit
    if (inspectionFilter !== "Tümü") {
      filtered = filtered.filter(l => (l.saha_tespit || l.kontrol_durumu || "KONTROL EDİLMEDİ") === inspectionFilter);
    }

    // Filter by İş Durumu
    if (statusFilter !== "Tümü") {
      filtered = filtered.filter(l => (l.is_durumu || l.son_durum) === statusFilter);
    }

    // Filter by Müdahale Edecek Birim and Birim Durumu
    if (unitFilter !== "Tümü") {
      filtered = filtered.filter(l => {
        const units = (l.intervention_units || "").split(", ").map((u: any) => u.trim());
        const statuses = (l.intervention_statuses || "").split(", ").map((s: any) => s.trim());
        return units.some((u: any, idx: number) => {
          if (u !== unitFilter) return false;
          if (unitStatusFilter !== "Tümü") {
            const s = statuses[idx] || "Yapılmadı";
            return s === unitStatusFilter;
          }
          return true;
        });
      });
    } else if (unitStatusFilter !== "Tümü") {
      filtered = filtered.filter(l => {
        const statuses = (l.intervention_statuses || "").split(", ").map((s: any) => s.trim());
        return statuses.includes(unitStatusFilter);
      });
    }

    setFilteredLines(filtered);
  };

  useEffect(() => {
    applyFilters(lines, selectedCity, selectedOms, selectedStatus, selectedUnitFilter, selectedUnitStatusFilter, selectedInspectionFilter);
  }, [selectedCity, selectedOms, selectedStatus, selectedUnitFilter, selectedUnitStatusFilter, selectedInspectionFilter, lines]);

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

  const handleSaveSiparis = async (siraNo: number) => {
    if (editingSiparisNo === null) return;
    try {
      await fetchAPI(`/lines/${siraNo}`, {
        method: 'PUT',
        body: JSON.stringify({ siparis_no: editSiparisValue })
      });
      // Update local state
      setLines(prev => prev.map(l => l.sira_no === siraNo ? { ...l, siparis_no: editSiparisValue } : l));
    } catch (err) {
      alert("Sipariş no güncellenirken hata oluştu.");
    } finally {
      setEditingSiparisNo(null);
    }
  };

  const handleRowClick = useCallback((line: any, category: string = 'Ağaç Budama') => {
    setSelectedLine({ ...line, defaultCategory: category });
    setIsModalOpen(true);
  }, []);

  const handleCategoryClick = useCallback((e: React.MouseEvent, line: any, category: string) => {
    e.stopPropagation();
    handleRowClick(line, category);
  }, [handleRowClick]);

  const tableBodyRows = useMemo(() => {
    let result = filteredLines;
    const lowerSearch = searchTerm.toLowerCase().trim();

    if (lowerSearch) {
      result = result.filter(line => {
        const matchHat = line.hat_ismi && line.hat_ismi.toLowerCase().includes(lowerSearch);
        const matchOm = line.operasyon_merkezi && line.operasyon_merkezi.toLowerCase().includes(lowerSearch);
        const matchIlce = line.ilce && line.ilce.toLowerCase().includes(lowerSearch);
        const matchSiparis = line.siparis_no && String(line.siparis_no).toLowerCase().includes(lowerSearch);
        const matchAssetStr = line.asset_ids_str && line.asset_ids_str.toLowerCase().includes(lowerSearch);
        const matchAssetArray = line.asset_ids && line.asset_ids.some((id: string) => String(id).toLowerCase().includes(lowerSearch));
        const matchVarliklar = line.varliklar && line.varliklar.some((v: any) => v.asset_id && String(v.asset_id).toLowerCase().includes(lowerSearch));

        return matchHat || matchOm || matchIlce || matchSiparis || matchAssetStr || matchAssetArray || matchVarliklar;
      });
    }

    return result.map((line) => {
      let matchedAssetId: string | null = null;
      if (lowerSearch && line.asset_ids) {
        matchedAssetId = line.asset_ids.find((id: string) => String(id).toLowerCase().includes(lowerSearch)) || null;
      }

      return (
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
          <td className="hat-ismi-td" style={{ padding: '1rem', fontSize: '0.9rem', fontWeight: 500, color: 'var(--accent-color)' }}>
            <div 
              style={{ 
                width: '150px', 
                minWidth: '80px',
                maxWidth: '600px',
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap', 
                resize: 'horizontal'
              }}
            >
              {line.hat_ismi}
            </div>
            <div className="hat-ismi-tooltip">{line.hat_ismi}</div>
            {matchedAssetId && (
              <div style={{ marginTop: '0.2rem' }}>
                <span style={{
                  padding: '0.1rem 0.4rem',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  background: 'rgba(245, 158, 11, 0.25)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.5)'
                }}>
                  🎯 Asset ID: {matchedAssetId}
                </span>
              </div>
            )}
          </td>
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{line.gerilim_seviyesi}</td>
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{line.hat_uzunlugu}</td>
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{line.mevcut_risk}</td>
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{line.planlanan_bakim ? new Date(line.planlanan_bakim).toLocaleDateString('tr-TR') : ''}</td>
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>{line.gerceklesen_bakim ? new Date(line.gerceklesen_bakim).toLocaleDateString('tr-TR') : ''}</td>
        <td 
          style={{ padding: '1rem', fontSize: '0.9rem' }}
          onClick={(e) => e.stopPropagation()}
        >
          {editingSiparisNo === line.sira_no ? (
            <input 
              type="text" 
              autoFocus
              value={editSiparisValue}
              onChange={(e) => setEditSiparisValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveSiparis(line.sira_no);
                if (e.key === 'Escape') setEditingSiparisNo(null);
              }}
              onBlur={() => handleSaveSiparis(line.sira_no)}
              style={{ width: '100px', padding: '0.2rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-primary)' }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>{line.siparis_no || '-'}</span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingSiparisNo(line.sira_no);
                  setEditSiparisValue(line.siparis_no || "");
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: '0.8rem' }}
                title="Sipariş No Düzenle"
              >
                ✏️
              </button>
            </div>
          )}
        </td>
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
          {(line.saha_tespit === 'KONTROL EDİLDİ' || line.kontrol_durumu === 'KONTROL EDİLDİ') ? (
            <span style={{ 
              padding: '0.2rem 0.6rem', 
              borderRadius: '12px', 
              fontSize: '0.75rem',
              fontWeight: 'bold',
              background: 'rgba(16, 185, 129, 0.2)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.4)'
            }}>
              🟢 KONTROL EDİLDİ
            </span>
          ) : (
            <span style={{ 
              padding: '0.2rem 0.6rem', 
              borderRadius: '12px', 
              fontSize: '0.75rem',
              fontWeight: 'bold',
              background: 'rgba(239, 68, 68, 0.2)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.4)'
            }}>
              🔴 KONTROL EDİLMEDİ{line.varlik_sayilari?.toplam > 0 ? ` (${line.varlik_sayilari.toplam})` : ''}
            </span>
          )}
        </td>
        <td style={{ padding: '1rem', fontSize: '0.85rem' }}>
          {line.varlik_sayilari?.toplam > 0 ? (
            <span style={{ 
              padding: '0.15rem 0.5rem', 
              borderRadius: '6px', 
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              fontWeight: 500
            }}>
              {line.varlik_sayilari.toplam} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({line.varlik_sayilari.direk}D • {line.varlik_sayilari.hat}H{line.varlik_sayilari.saha_tespiti > 0 ? ` • ${line.varlik_sayilari.saha_tespiti}S` : ''})</span>
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>0</span>
          )}
        </td>
        <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
          {(() => {
            const st = line.is_durumu || line.son_durum || 'YAPILMADI';
            const isCompleted = st === 'TAMAMLANDI';
            const isNoNeed = st === 'GEREK YOK';
            return (
              <span style={{ 
                padding: '0.2rem 0.6rem', 
                borderRadius: '12px', 
                fontSize: '0.8rem',
                fontWeight: 'bold',
                background: isCompleted ? 'rgba(16, 185, 129, 0.2)' : isNoNeed ? 'rgba(255, 255, 255, 0.05)' : 'rgba(239, 68, 68, 0.2)',
                color: isCompleted ? '#10b981' : isNoNeed ? 'var(--text-secondary)' : '#ef4444'
              }}>
                {st}
              </span>
            );
          })()}
        </td>
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
      );
    });
  }, [filteredLines, searchTerm, handleCategoryClick, handleRowClick, editingSiparisNo, editSiparisValue]);

  return (
    <div>

      <div className="filters-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 className="page-title" style={{ margin: 0 }}>📋 Hat Listesi ve Veri Girişi</h1>
        <div className="filters-wrapper" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', display: 'block' }}>İl Filtresi</label>
            <select value={selectedCity} onChange={(e) => {
              setSelectedCity(e.target.value);
              setSelectedOms([]); // Reset OM selection when city changes
            }} style={{ padding: '0.5rem', minWidth: '130px' }}>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          
          <div style={{ position: 'relative' }}>
            <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', display: 'block' }}>Operasyon Merkezi</label>
            <div 
              onClick={() => setOmDropdownOpen(!omDropdownOpen)}
              style={{ 
                padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', 
                borderRadius: 'var(--radius-md)', minWidth: '180px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between'
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

          <div>
            <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', display: 'block' }}>Saha Tespit</label>
            <select 
              value={selectedInspectionFilter} 
              onChange={(e) => setSelectedInspectionFilter(e.target.value)} 
              style={{ padding: '0.5rem', minWidth: '160px', border: '1px solid var(--accent-color)' }}
            >
              <option value="Tümü">Tümü (Tüm Hatlar)</option>
              <option value="KONTROL EDİLDİ">🟢 Kontrol Edildi</option>
              <option value="KONTROL EDİLMEDİ">🔴 Kontrol Edilmedi</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', display: 'block' }}>İş Durumu</label>
            <select 
              value={selectedStatus} 
              onChange={(e) => setSelectedStatus(e.target.value)} 
              style={{ padding: '0.5rem', minWidth: '130px' }}
            >
              <option value="Tümü">Tümü</option>
              <option value="TAMAMLANDI">TAMAMLANDI</option>
              <option value="YAPILMADI">YAPILMADI</option>
              <option value="GEREK YOK">GEREK YOK</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleSaveDefaults} 
              style={{ height: '38px', padding: '0 1rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
            >
              💾 Varsayılan Yap
            </button>
            <button 
              className="btn" 
              onClick={() => setIsNewLineModalOpen(true)} 
              style={{ 
                height: '38px', 
                padding: '0 1rem', 
                fontSize: '0.85rem', 
                whiteSpace: 'nowrap',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                color: '#10b981',
                border: '1px solid #10b981',
                fontWeight: 600
              }}
            >
              ➕ Yeni Hat Ekle
            </button>
          </div>
        </div>
      </div>
      
      <div style={{ marginBottom: '1rem', position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input 
          type="text" 
          placeholder="🔍 Hat ismi, Operasyon Merkezi, İlçe veya Asset ID (Varlık No) Ara..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ 
            width: '100%', 
            padding: '0.8rem 2.5rem 0.8rem 1rem', 
            borderRadius: 'var(--radius-md)', 
            border: searchTerm ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
            background: 'var(--surface-color)',
            color: 'var(--text-primary)',
            fontSize: '0.95rem'
          }} 
        />
        {searchTerm && (
          <button 
            type="button" 
            onClick={() => setSearchTerm('')}
            style={{
              position: 'absolute',
              right: '12px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '1.2rem'
            }}
            title="Aramayı Temizle"
          >
            ✕
          </button>
        )}
      </div>
      
      <div className="glass-panel table-responsive" style={{ overflowX: 'auto', padding: '1px' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Hatlar yükleniyor...</div>
        ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1900px' }}>
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
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--accent-color)', fontWeight: 600 }}>Saha Tespit</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Varlıklar</th>
                  <th style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>İş Durumu</th>
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

      {/* Modals */}
      <InterventionModal 
        line={selectedLine} 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onRefresh={loadLines} 
      />
      <NewLineModal
        isOpen={isNewLineModalOpen}
        onClose={() => setIsNewLineModalOpen(false)}
        onSuccess={loadLines}
        existingCities={cities}
        linesData={lines}
      />
    </div>
  );
}
