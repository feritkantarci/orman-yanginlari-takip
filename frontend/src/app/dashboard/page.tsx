"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LineTable from "../../components/LineTable";
import AdminPanel from "../../components/AdminPanel";
import SummaryView from "../../components/SummaryView";

export default function Dashboard() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [activeTab, setActiveTab] = useState("lines");

  useEffect(() => {
    setIsClient(true);
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Token is empty in dashboard! Redirecting to login...");
      router.push("/login");
    } else {
      setUsername(localStorage.getItem("username") || "");
      setRole(localStorage.getItem("role") || "");
    }
  }, [router]);

  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  useEffect(() => {
    if (role === 'admin') {
      loadRequestCount();
      // Poll every 10 seconds to keep sidebar up to date
      const interval = setInterval(loadRequestCount, 10000);
      return () => clearInterval(interval);
    }
  }, [role]);

  const loadRequestCount = async () => {
    try {
      const { fetchAPI } = await import("../../lib/api");
      const data = await fetchAPI('/requests');
      setPendingRequestsCount(data.length);
    } catch(err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("role");
    router.push("/login");
  };

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (!isClient) return null; // Avoid hydration mismatch

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Mobile Overlay */}
      <div 
        className={`sidebar-overlay ${isMobileMenuOpen ? 'open' : ''}`} 
        onClick={() => setIsMobileMenuOpen(false)}
      ></div>

      {/* Sidebar */}
      <aside className={`glass-panel app-sidebar ${isMobileMenuOpen ? 'open' : ''}`} style={{ width: '260px', padding: '1.5rem', borderRight: '1px solid var(--border-color)', borderRadius: 0, display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '2rem', color: 'var(--accent-color)' }}>🌲 Orman Yangınları</h2>
        
        <div style={{ marginBottom: '2rem' }}>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>GİRİŞ YAPAN</p>
          <p style={{ fontWeight: 600 }}>{username}</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--accent-color)' }}>{role}</p>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          <button 
            onClick={() => { setActiveTab('lines'); setIsMobileMenuOpen(false); }}
            className="btn btn-secondary" 
            style={{ justifyContent: 'flex-start', border: 'none', backgroundColor: activeTab === 'lines' ? 'rgba(255,255,255,0.05)' : 'transparent' }}
          >
            📋 Hat Listesi
          </button>
          
          <button 
            onClick={() => { setActiveTab('summary'); setIsMobileMenuOpen(false); }}
            className="btn btn-secondary" 
            style={{ justifyContent: 'flex-start', border: 'none', backgroundColor: activeTab === 'summary' ? 'rgba(255,255,255,0.05)' : 'transparent' }}
          >
            📊 Genel Özet
          </button>
          
          {role === 'admin' && (
            <button 
              onClick={() => { setActiveTab('admin'); setIsMobileMenuOpen(false); }}
              className="btn btn-secondary" 
              style={{ justifyContent: 'space-between', border: 'none', backgroundColor: activeTab === 'admin' ? 'rgba(255,255,255,0.05)' : 'transparent' }}
            >
              <span>🔒 Admin Paneli</span>
              {pendingRequestsCount > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.75rem', padding: '0.1rem 0.4rem', borderRadius: '10px', fontWeight: 'bold' }}>
                  {pendingRequestsCount}
                </span>
              )}
            </button>
          )}
        </nav>

        <button onClick={handleLogout} className="btn btn-secondary" style={{ marginTop: 'auto', borderColor: 'var(--danger-color)', color: 'var(--danger-color)' }}>
          Çıkış Yap
        </button>
      </aside>

      {/* Main Content Area */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        
        {/* Mobile Navbar */}
        <div className="mobile-navbar">
          <h2 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--accent-color)' }}>🌲 Orman Yangınları</h2>
          <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(true)}>☰</button>
        </div>

        {/* Main Content */}
        <main className="app-main-content" style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
          <div className="container" style={{ maxWidth: '1400px', margin: 0 }}>
            {activeTab === 'lines' && <LineTable />}
            {activeTab === 'summary' && <SummaryView />}
            {activeTab === 'admin' && <AdminPanel />}
          </div>
        </main>
      </div>
    </div>
  );
}
