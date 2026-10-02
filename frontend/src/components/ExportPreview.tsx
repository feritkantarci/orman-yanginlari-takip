"use client";
import { useEffect, useState } from "react";
import { fetchAPI, API_URL } from "../lib/api";
import InterventionModal from "./InterventionModal";

export default function ExportPreview() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string[]>([]);
  const [selectedUnitStatusFilter, setSelectedUnitStatusFilter] = useState<string[]>([]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false);
  const [unitStatusDropdownOpen, setUnitStatusDropdownOpen] = useState(false);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [selectedLine, setSelectedLine] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSummaryCell, setSelectedSummaryCell] = useState<{ unit: string; status: string } | null>(null);

  const handleDownloadExcel = () => {
    window.open(`${API_URL}/export/excel`, "_blank");
  };

  const handleDownloadDetailedExcel = () => {
    window.open(`${API_URL}/export/excel/details`, "_blank");
  };

  const toggleStatus = (val: string) => {
    setSelectedStatus(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const toggleUnit = (val: string) => {
    setSelectedUnitFilter(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const toggleUnitStatus = (val: string) => {
    setSelectedUnitStatusFilter(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  useEffect(() => {
    loadPreview();
  }, []);

  useEffect(() => {
    let filtered = data;

    // Filter by Son Durum
    if (selectedStatus.length > 0) {
      filtered = filtered.filter(l => selectedStatus.includes(l.son_durum));
    }

    // Filter by Müdahale Edecek Birim and Birim Durumu
    if (selectedUnitFilter.length > 0) {
      filtered = filtered.filter(l => {
        const units = (l.intervention_units || "").split(", ").map((u: string) => u.trim());
        const statuses = (l.intervention_statuses || "").split(", ").map((s: string) => s.trim());
        return units.some((u: string, idx: number) => {
          if (!selectedUnitFilter.includes(u)) return false;
          if (selectedUnitStatusFilter.length > 0) {
            const s = statuses[idx] || "Yapılmadı";
            return selectedUnitStatusFilter.includes(s);
          }
          return true;
        });
      });
    } else if (selectedUnitStatusFilter.length > 0) {
      filtered = filtered.filter(l => {
        const statuses = (l.intervention_statuses || "").split(", ").map((s: string) => s.trim());
        return statuses.some((s: string) => selectedUnitStatusFilter.includes(s));
      });
    }

    setFilteredData(filtered);
  }, [data, selectedStatus, selectedUnitFilter, selectedUnitStatusFilter]);

  const computeUnitStats = () => {
    const stats: Record<string, { yapildi: number; yapilacak: number }> = {
      'BELLİ DEĞİL': { yapildi: 0, yapilacak: 0 },
      'BAKIM S2': { yapildi: 0, yapilacak: 0 },
      'BAKIM S3': { yapildi: 0, yapilacak: 0 },
      'OPERASYON': { yapildi: 0, yapilacak: 0 },
      'YATIRIM': { yapildi: 0, yapilacak: 0 }
    };

    data.forEach(l => {
      if (l.unit_stats) {
        Object.entries(l.unit_stats).forEach(([u, s]: [string, any]) => {
          if (stats[u]) {
            stats[u].yapildi += s.yapildi || 0;
            stats[u].yapilacak += s.yapilacak || 0;
          }
        });
      } else if (l.intervention_units) {
        const units = l.intervention_units.split(", ").map((u: string) => u.trim());
        const statuses = (l.intervention_statuses || "").split(", ").map((s: string) => s.trim());
        units.forEach((u: string, idx: number) => {
          if (stats[u]) {
            const s = statuses[idx] || "Yapılmadı";
            if (s === "Yapıldı") stats[u].yapildi++;
            else stats[u].yapilacak++; // Yapılmadı
          }
        });
      }
    });

    return stats;
  };

  const getSummaryLines = () => {
    if (!selectedSummaryCell) return [];
    const { unit, status } = selectedSummaryCell;
    return data.filter(l => {
      if (l.varliklar && l.varliklar.length > 0) {
        return l.varliklar.some((v: any) => {
          if (v.intervention_unit !== unit) return false;
          if (status !== "Toplam") {
            const s = v.status || "Yapılmadı";
            return s === status;
          }
          return true;
        });
      }
      if (!l.intervention_units) return false;
      const units = l.intervention_units.split(", ").map((u: string) => u.trim());
      const statuses = (l.intervention_statuses || "").split(", ").map((s: string) => s.trim());
      return units.some((u: string, idx: number) => {
        if (u !== unit) return false;
        if (status !== "Toplam") {
          const s = statuses[idx] || "Yapılmadı";
          return s === status;
        }
        return true;
      });
    });
  };

  const loadPreview = async () => {
    try {
      setLoading(true);
      const result = await fetchAPI("/export/preview");
      setData(result);
    } catch (err) {
      console.error(err);
      alert("Ön izleme verisi yüklenirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: "2rem", textAlign: "center" }}>Veriler Hazırlanıyor... Lütfen bekleyin.</div>;
  }

  return (
    <div className="glass-panel" style={{ padding: "1.5rem", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ margin: 0, color: "var(--accent-color)" }}>RAPOR ÖN İZLEME</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: "0.9rem" }}>M sütunu ve sonrasındaki verilerin Excel'e yazılmadan önceki halidir. Aşağıda inceleyebilirsiniz.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn" style={{ backgroundColor: "var(--bg-lighter)", color: "white", border: "1px solid var(--border-color)" }} onClick={handleDownloadDetailedExcel}>
            📝 Detaylı Rapor
          </button>
          <button className="btn btn-primary" onClick={handleDownloadExcel}>
            📊 Özet Rapor
          </button>
        </div>
      </div>

      {/* Filtreler ve Birim Bazlı Özet Tablo Üst Paneli */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {/* Sol Taraf: Filtreler */}
        <div style={{ flex: '1 1 300px', display: 'flex', gap: '1rem', flexWrap: 'wrap', backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', alignItems: 'center' }}>
          
          {/* Son Durum Filtresi */}
          <div style={{ position: 'relative', minWidth: '180px' }}>
            <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', display: 'block', color: 'var(--text-secondary)', fontWeight: 600 }}>Son Durum Filtresi</label>
            <div 
              onClick={() => {
                setStatusDropdownOpen(!statusDropdownOpen);
                setUnitDropdownOpen(false);
                setUnitStatusDropdownOpen(false);
              }}
              style={{ 
                padding: '0.5rem 1rem', background: 'var(--bg-lighter)', border: '1px solid var(--border-color)', 
                borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}
            >
              <span style={{ fontSize: '0.9rem', color: selectedStatus.length ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {selectedStatus.length > 0 ? `${selectedStatus.length} Seçildi` : 'Tümü'}
              </span>
              <span>▼</span>
            </div>
            {statusDropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#111827', border: '1px solid var(--border-color)', borderRadius: '4px', zIndex: 100, padding: '0.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                {['TAMAMLANDI', 'YAPILMADI', 'GEREK YOK'].map(val => (
                  <label key={val} style={{ display: 'flex', alignItems: 'center', padding: '0.4rem', cursor: 'pointer', margin: 0, borderRadius: '4px' }}
                         onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                         onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <input 
                      type="checkbox" 
                      checked={selectedStatus.includes(val)}
                      onChange={() => toggleStatus(val)}
                      style={{ width: 'auto', marginRight: '0.5rem' }}
                    />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{val}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Müdahale Edecek Birim */}
          <div style={{ position: 'relative', minWidth: '180px' }}>
            <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', display: 'block', color: 'var(--text-secondary)', fontWeight: 600 }}>Müdahale Edecek Birim</label>
            <div 
              onClick={() => {
                setUnitDropdownOpen(!unitDropdownOpen);
                setStatusDropdownOpen(false);
                setUnitStatusDropdownOpen(false);
              }}
              style={{ 
                padding: '0.5rem 1rem', background: 'var(--bg-lighter)', border: '1px solid var(--border-color)', 
                borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}
            >
              <span style={{ fontSize: '0.9rem', color: selectedUnitFilter.length ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {selectedUnitFilter.length > 0 ? `${selectedUnitFilter.length} Seçildi` : 'Tümü'}
              </span>
              <span>▼</span>
            </div>
            {unitDropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#111827', border: '1px solid var(--border-color)', borderRadius: '4px', zIndex: 100, padding: '0.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                {['BELLİ DEĞİL', 'BAKIM S2', 'BAKIM S3', 'OPERASYON', 'YATIRIM'].map(val => (
                  <label key={val} style={{ display: 'flex', alignItems: 'center', padding: '0.4rem', cursor: 'pointer', margin: 0, borderRadius: '4px' }}
                         onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                         onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <input 
                      type="checkbox" 
                      checked={selectedUnitFilter.includes(val)}
                      onChange={() => toggleUnit(val)}
                      style={{ width: 'auto', marginRight: '0.5rem' }}
                    />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{val}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Birim Durumu */}
          <div style={{ position: 'relative', minWidth: '180px' }}>
            <label style={{ fontSize: '0.8rem', marginBottom: '0.2rem', display: 'block', color: 'var(--text-secondary)', fontWeight: 600 }}>Birim Durumu</label>
            <div 
              onClick={() => {
                setUnitStatusDropdownOpen(!unitStatusDropdownOpen);
                setStatusDropdownOpen(false);
                setUnitDropdownOpen(false);
              }}
              style={{ 
                padding: '0.5rem 1rem', background: 'var(--bg-lighter)', border: '1px solid var(--border-color)', 
                borderRadius: '4px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}
            >
              <span style={{ fontSize: '0.9rem', color: selectedUnitStatusFilter.length ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {selectedUnitStatusFilter.length > 0 ? `${selectedUnitStatusFilter.length} Seçildi` : 'Tümü'}
              </span>
              <span>▼</span>
            </div>
            {unitStatusDropdownOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#111827', border: '1px solid var(--border-color)', borderRadius: '4px', zIndex: 100, padding: '0.5rem', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                {['Yapıldı', 'Yapılmadı'].map(val => (
                  <label key={val} style={{ display: 'flex', alignItems: 'center', padding: '0.4rem', cursor: 'pointer', margin: 0, borderRadius: '4px' }}
                         onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                         onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <input 
                      type="checkbox" 
                      checked={selectedUnitStatusFilter.includes(val)}
                      onChange={() => toggleUnitStatus(val)}
                      style={{ width: 'auto', marginRight: '0.5rem' }}
                    />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{val}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Sağ Taraf: Birim Bazlı Özet Tablo */}
        <div style={{ flex: '2 1 500px', backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--accent-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Birimlere Göre İş Durum Özeti</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ textAlign: 'left', padding: '0.4rem', color: 'var(--text-muted)' }}>Müdahale Edecek Birim</th>
                <th style={{ textAlign: 'center', padding: '0.4rem', color: '#10b981' }}>Yapıldı</th>
                <th style={{ textAlign: 'center', padding: '0.4rem', color: '#ef4444' }}>Yapılmadı</th>
                <th style={{ textAlign: 'center', padding: '0.4rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>Toplam</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(computeUnitStats()).map(([unit, counts]) => {
                const total = counts.yapildi + counts.yapilacak;
                return (
                  <tr key={unit} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '0.4rem', fontWeight: 600 }}>{unit}</td>
                    <td 
                      onClick={() => counts.yapildi > 0 && setSelectedSummaryCell({ unit, status: 'Yapıldı' })}
                      style={{ 
                        textAlign: 'center', 
                        padding: '0.4rem', 
                        color: counts.yapildi > 0 ? '#10b981' : 'var(--text-muted)', 
                        fontWeight: counts.yapildi > 0 ? 'bold' : 'normal',
                        cursor: counts.yapildi > 0 ? 'pointer' : 'default',
                        textDecoration: counts.yapildi > 0 ? 'underline' : 'none'
                      }}
                      title={counts.yapildi > 0 ? 'Yapıldı kayıtlarını görmek için tıklayın' : undefined}
                    >
                      {counts.yapildi}
                    </td>
                    <td 
                      onClick={() => counts.yapilacak > 0 && setSelectedSummaryCell({ unit, status: 'Yapılmadı' })}
                      style={{ 
                        textAlign: 'center', 
                        padding: '0.4rem', 
                        color: counts.yapilacak > 0 ? '#ef4444' : 'var(--text-muted)', 
                        fontWeight: counts.yapilacak > 0 ? 'bold' : 'normal',
                        cursor: counts.yapilacak > 0 ? 'pointer' : 'default',
                        textDecoration: counts.yapilacak > 0 ? 'underline' : 'none'
                      }}
                      title={counts.yapilacak > 0 ? 'Yapılmadı kayıtlarını görmek için tıklayın' : undefined}
                    >
                      {counts.yapilacak}
                    </td>
                    <td 
                      onClick={() => total > 0 && setSelectedSummaryCell({ unit, status: 'Toplam' })}
                      style={{ 
                        textAlign: 'center', 
                        padding: '0.4rem', 
                        fontWeight: 'bold',
                        color: total > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                        cursor: total > 0 ? 'pointer' : 'default',
                        textDecoration: total > 0 ? 'underline' : 'none'
                      }}
                      title={total > 0 ? 'Tüm kayıtları görmek için tıklayın' : undefined}
                    >
                      {total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="table-container" style={{ overflowX: "auto", backgroundColor: "#0d121e", padding: "15px", borderRadius: "10px" }}>
        <table className="custom-table" style={{ width: "100%", minWidth: "1200px", whiteSpace: "nowrap", fontSize: "13px" }}>
          <thead>
            {/* ÜST BAŞLIKLAR (MERGED CELLS) */}
            <tr style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
              {/* Sabit sütunların üstü colSpan ile genel başlık yapıldı */}
              <th colSpan={13} style={{ borderRight: "1px solid var(--border-color)", textAlign: "center", color: "var(--text-muted)" }}>Sabit Merkez Verileri</th>
              <th colSpan={3} style={{ borderRight: "1px solid var(--border-color)", textAlign: "center" }}>Ağaç Budama</th>
              <th colSpan={2} style={{ borderRight: "1px solid var(--border-color)", textAlign: "center" }}>Güzergah Değişimi</th>
              <th colSpan={2} style={{ borderRight: "1px solid var(--border-color)", textAlign: "center" }}>Beton Dökümü</th>
              <th colSpan={3} style={{ borderRight: "1px solid var(--border-color)", textAlign: "center" }}>Koridor Açma (Km)</th>
              <th colSpan={2} style={{ borderRight: "1px solid var(--border-color)", textAlign: "center" }}>Operasyon Müdahalesi</th>
            </tr>
            {/* ALT BAŞLIKLAR (Filtrelenebilir Asıl Satır) */}
            <tr>
              <th style={{ borderRight: "1px solid var(--border-color)", textAlign: "left" }}>Sıra No</th>
              <th style={{ borderRight: "1px solid var(--border-color)", textAlign: "left" }}>Dağıtım Şirketi</th>
              <th style={{ borderRight: "1px solid var(--border-color)", textAlign: "left" }}>İl</th>
              <th style={{ borderRight: "1px solid var(--border-color)", textAlign: "left" }}>İlçe</th>
              <th style={{ borderRight: "1px solid var(--border-color)", textAlign: "left" }}>Operasyon Merkezi</th>
              <th style={{ borderRight: "1px solid var(--border-color)", textAlign: "left" }}>Hat İsmi</th>
              <th style={{ borderRight: "1px solid var(--border-color)", textAlign: "left" }}>Gerilim Seviyesi</th>
              <th style={{ borderRight: "1px solid var(--border-color)", textAlign: "left" }}>Hat Uzunluğu</th>
              <th style={{ borderRight: "1px solid var(--border-color)", textAlign: "left" }}>Mevcut Risk</th>
              <th style={{ borderRight: "1px solid var(--border-color)", textAlign: "left" }}>Planlanan Bakım</th>
              <th style={{ borderRight: "1px solid var(--border-color)", textAlign: "left" }}>Gerçekleşen Bakım</th>
              <th style={{ borderRight: "1px solid var(--border-color)", textAlign: "left" }}>Sipariş No</th>
              <th style={{ borderRight: "1px solid var(--border-color)", textAlign: "left", color: "var(--accent-color)" }}>İş Durumu</th>
              {/* Ağaç Budama */}
              <th style={{ color: "#10b981" }}>Yapılan</th>
              <th style={{ color: "#ef4444" }}>Yapılacak</th>
              <th style={{ borderRight: "1px solid var(--border-color)" }}>İhale</th>
              {/* Güzergah */}
              <th style={{ color: "#10b981" }}>Yapılan</th>
              <th style={{ color: "#ef4444", borderRight: "1px solid var(--border-color)" }}>Yapılacak</th>
              {/* Beton */}
              <th style={{ color: "#10b981" }}>Yapılan</th>
              <th style={{ color: "#ef4444", borderRight: "1px solid var(--border-color)" }}>Yapılacak</th>
              {/* Koridor Açma */}
              <th style={{ color: "#10b981" }}>Yapılan</th>
              <th style={{ color: "#ef4444" }}>Yapılacak</th>
              <th style={{ borderRight: "1px solid var(--border-color)" }}>İhale</th>
              {/* Operasyon */}
              <th style={{ color: "#10b981" }}>Yapılan</th>
              <th style={{ color: "#ef4444", borderRight: "1px solid var(--border-color)" }}>Yapılacak</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((row, idx) => (
              <tr 
                key={idx} 
                onDoubleClick={() => { setSelectedLine(row); setIsModalOpen(true); }}
                style={{ 
                  backgroundColor: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.05)",
                  cursor: "pointer",
                  transition: "background-color 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.05)"}
              >
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.excel_sira_no || row.sira_no}</td>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.dagitim_sirketi}</td>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.il}</td>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.ilce}</td>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.operasyon_merkezi}</td>
                <td style={{ borderRight: "1px solid var(--border-color)", fontWeight: "bold" }}>{row.hat_ismi}</td>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.gerilim_seviyesi}</td>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.hat_uzunlugu}</td>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.mevcut_risk}</td>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.planlanan_bakim}</td>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.gerceklesen_bakim}</td>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.siparis_no}</td>
                <td style={{ borderRight: "1px solid var(--border-color)", fontWeight: "bold", color: row.son_durum === "TAMAMLANDI" ? "#10b981" : row.son_durum === "YAPILMADI" ? "#ef4444" : "#9ca3af" }}>{row.son_durum}</td>
                
                {/* Ağaç Budama */}
                <td>{row.agac_budama.yapildi}</td>
                <td>{row.agac_budama.yapilacak}</td>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.agac_budama.ihale}</td>
                
                {/* Güzergah */}
                <td>{row.guzergah_degisimi.yapildi}</td>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.guzergah_degisimi.yapilacak}</td>
                
                {/* Beton */}
                <td>{row.beton_dokumu.yapildi}</td>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.beton_dokumu.yapilacak}</td>
                
                {/* Koridor Açma */}
                <td>{row.koridor_acma.yapildi.toFixed(2)}</td>
                <td>{row.koridor_acma.yapilacak.toFixed(2)}</td>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.koridor_acma.ihale}</td>
                
                {/* Operasyon */}
                <td>{row.operasyon_mudahalesi.yapildi}</td>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.operasyon_mudahalesi.yapilacak}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={14} style={{ textAlign: "center", padding: "2rem" }}>Henüz hiç kayıt yok.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Çift Tıklama ile Açılan Müdahale Modalı */}
      <InterventionModal 
        line={selectedLine} 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); loadPreview(); }} 
        onRefresh={loadPreview} 
      />

      {/* Birim Bazlı İş Durumu Özet Detay Modalı */}
      {selectedSummaryCell && (
        <div className="modal-overlay" style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999,
          padding: '1rem'
        }} onClick={() => setSelectedSummaryCell(null)}>
          <div className="glass-panel animate-fade-in modal-content" style={{ 
            width: '100%', maxWidth: '900px', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            backgroundColor: 'var(--surface-color)', overflow: 'hidden'
          }} onClick={e => e.stopPropagation()}>
            
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--accent-color)', fontSize: '1.2rem' }}>
                  🔍 {selectedSummaryCell.unit} - {selectedSummaryCell.status === 'Toplam' ? 'Tüm Müdahaleler' : selectedSummaryCell.status}
                </h3>
                <p className="text-muted" style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem' }}>
                  Toplam {getSummaryLines().length} hat bulundu. Düzenlemek için satıra çift tıklayabilirsiniz.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button 
                  className="btn btn-primary" 
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                  onClick={() => {
                    const lines = getSummaryLines();
                    const title = `${selectedSummaryCell.unit} - ${selectedSummaryCell.status}`;
                    // UTF-8 BOM to prevent Excel Turkish character encoding issues
                    const BOM = "\uFEFF";
                    let csvContent = BOM;
                    
                    const headers = ["Sıra No", "İl", "İlçe", "Operasyon Merkezi", "Hat İsmi", "Gerilim Seviyesi", "Hat Uzunluğu", "Son Durum", "Müdahale Edecek Birim", "Birim Durumu"];
                    csvContent += headers.join(";") + "\n";
                    
                    lines.forEach(l => {
                      const row = [
                        l.excel_sira_no || l.sira_no || "",
                        l.il || "",
                        l.ilce || "",
                        l.operasyon_merkezi || "",
                        l.hat_ismi || "",
                        l.gerilim_seviyesi || "",
                        l.hat_uzunlugu || "",
                        l.son_durum || "",
                        l.intervention_units || "",
                        l.intervention_statuses || ""
                      ];
                      const escapedRow = row.map(val => {
                        const stringVal = String(val).replace(/"/g, '""');
                        return `"${stringVal}"`;
                      });
                      csvContent += escapedRow.join(";") + "\n";
                    });
                    
                    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.setAttribute("href", url);
                    link.setAttribute("download", `${title.replace(/\s+/g, "_")}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                >
                  📥 Excel (CSV) Olarak İndir
                </button>
                <button onClick={() => setSelectedSummaryCell(null)} style={{ background:'transparent', border:'none', color:'var(--text-secondary)', cursor:'pointer', fontSize:'1.5rem' }}>&times;</button>
              </div>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              <div className="table-container" style={{ overflowX: "auto", backgroundColor: "rgba(0,0,0,0.2)", borderRadius: "6px" }}>
                <table className="custom-table" style={{ width: "100%", fontSize: "0.85rem", whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr>
                      <th>Sıra No</th>
                      <th>İl</th>
                      <th>İlçe</th>
                      <th>Operasyon Merkezi</th>
                      <th>Hat İsmi</th>
                      <th>Son Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSummaryLines().map((row, idx) => (
                      <tr 
                        key={idx}
                        onDoubleClick={() => {
                          setSelectedLine(row);
                          setIsModalOpen(true);
                        }}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                      >
                        <td>{row.excel_sira_no || row.sira_no}</td>
                        <td>{row.il}</td>
                        <td>{row.ilce}</td>
                        <td>{row.operasyon_merkezi}</td>
                        <td style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>{row.hat_ismi}</td>
                        <td>
                          <span style={{ 
                            padding: '0.1rem 0.4rem', 
                            borderRadius: '10px', 
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            background: row.son_durum === 'TAMAMLANDI' ? 'rgba(16, 185, 129, 0.2)' : row.son_durum === 'YAPILMADI' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            color: row.son_durum === 'TAMAMLANDI' ? '#10b981' : row.son_durum === 'YAPILMADI' ? '#ef4444' : 'var(--text-secondary)'
                          }}>
                            {row.son_durum}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
