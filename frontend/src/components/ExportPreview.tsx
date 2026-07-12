"use client";
import { useEffect, useState } from "react";
import { fetchAPI } from "../lib/api";

export default function ExportPreview() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const handleDownloadExcel = () => {
    window.open("http://localhost:8000/api/export/excel", "_blank");
  };

  useEffect(() => {
    loadPreview();
  }, []);

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
        <button className="btn btn-primary" onClick={handleDownloadExcel}>
          📥 Excel İndir
        </button>
      </div>

      <div className="table-container" style={{ overflowX: "auto", backgroundColor: "#0d121e", padding: "15px", borderRadius: "10px" }}>
        <table className="custom-table" style={{ width: "100%", minWidth: "1200px", whiteSpace: "nowrap", fontSize: "13px" }}>
          <thead>
            {/* ÜST BAŞLIKLAR (MERGED CELLS) */}
            <tr style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
              {/* Sabit sütunların üstü colSpan ile genel başlık yapıldı */}
              <th colSpan={12} style={{ borderRight: "1px solid var(--border-color)", textAlign: "center", color: "var(--text-muted)" }}>Sabit Merkez Verileri</th>
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
            {data.map((row, idx) => (
              <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.05)" }}>
                <td style={{ borderRight: "1px solid var(--border-color)" }}>{row.sira_no}</td>
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
    </div>
  );
}
