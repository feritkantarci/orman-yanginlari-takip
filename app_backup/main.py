import streamlit as st
import pandas as pd
import json
import sqlite3
import os
from auth import login_form, logout_button, hash_password

# Database Path
db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'database.db')

def get_connection():
    return sqlite3.connect(db_path)

@st.cache_data
def load_lines():
    conn = get_connection()
    df = pd.read_sql("SELECT * FROM lines", conn)
    conn.close()
    
    # Tarihlerden saat kısmını temizleyip gün/ay/yıl formatına getirme
    for col in ['Planlanan Bakım Tarihi', 'Gerçekleşen Bakım Tarihi']:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors='coerce').dt.strftime('%d/%m/%Y')
            df[col] = df[col].fillna('')
            
    return df

def load_interventions(sira_no=None):
    conn = get_connection()
    if sira_no:
        df = pd.read_sql(f"SELECT * FROM interventions WHERE sira_no = {sira_no}", conn)
    else:
        df = pd.read_sql("SELECT * FROM interventions", conn)
    conn.close()
    return df

def safe_dataframe(df, height=400):
    if df.empty:
        st.write("Veri bulunamadı.")
        return
    html = df.to_html(index=False)
    st.markdown(
        f"""
        <div style="height: {height}px; overflow-y: auto; border: 1px solid rgba(128,128,128,0.2); border-radius: 5px;">
            <style>
                .scrollable-table table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
                .scrollable-table th {{ 
                    position: sticky; 
                    top: 0; 
                    background-color: #262730; 
                    color: white;
                    padding: 8px; 
                    text-align: left; 
                    z-index: 1; 
                    box-shadow: 0 2px 2px -1px rgba(0, 0, 0, 0.4);
                }}
                .scrollable-table td {{ padding: 8px; border-bottom: 1px solid rgba(128,128,128,0.2); }}
            </style>
            <div class="scrollable-table">
                {html}
            </div>
        </div>
        """,
        unsafe_allow_html=True
    )

@st.cache_data
def generate_excel_reports(df):
    from io import BytesIO
    output_detail = BytesIO()
    with pd.ExcelWriter(output_detail, engine='xlsxwriter') as writer:
        df.to_excel(writer, sheet_name='Detaylı Tespitler', index=False)
    detail_data = output_detail.getvalue()
    
    summary_df = df.groupby(['sira_no', 'category', 'status']).size().reset_index(name='Adet')
    output_summary = BytesIO()
    with pd.ExcelWriter(output_summary, engine='xlsxwriter') as writer:
        summary_df.to_excel(writer, sheet_name='Ozet Rapor', index=False)
    summary_data = output_summary.getvalue()
    
    return detail_data, summary_data

st.set_page_config(layout="wide", page_title="Orman Yangınları Takip Sistemi")

if 'logged_in_user' not in st.session_state:
    login_form()
    st.stop()

logout_button()
user_info = st.session_state.logged_in_user
username = user_info['username']
user_role = user_info['role']

# Parsing Defaults
db_def_il = user_info.get('default_il')
db_def_oms = user_info.get('default_oms')

if db_def_il is None:
    user_def_il = "HATAY"
else:
    user_def_il = db_def_il
    
if db_def_oms is None:
    user_def_oms = ["HATAY METROPOL", "KIRIKHAN", "REYHANLI"]
else:
    try:
        user_def_oms = json.loads(db_def_oms)
    except:
        user_def_oms = []

st.title(f"🌲 Ormanlık Alan Hat Bakım Takip Sistemi (Hoşgeldin, {username})")

# Define Dialog for Data Entry
@st.dialog("Veri Girişi ve Geçmiş Kayıtlar", width="large")
def open_data_entry_dialog(sira_no, hat_ismi, siparis="", planlanan="", gerceklesen="", il=""):
    st.markdown(f"### 📍 {il} - {hat_ismi}")
    st.markdown(f"**Sıra No:** {sira_no}")
    
    if st.session_state.get('clear_next'):
        st.session_state.entry_asset_id = ""
        st.session_state.entry_desc = ""
        st.session_state.entry_len = ""
        st.session_state.clear_next = False
    
    with st.expander("📍 Hat Bilgilerini Güncelle (Sipariş / Bakım Tarihleri)", expanded=True):
        c1, c2, c3 = st.columns(3)
        with c1:
            new_siparis = st.text_input("Sipariş Numarası", value=siparis if siparis != 'nan' and siparis != 'None' else "")
        with c2:
            new_planlanan = st.text_input("Planlanan Bakım Tarihi", value=planlanan if planlanan != 'nan' and planlanan != 'None' else "")
            st.caption("Örn: 23/03/2026")
        with c3:
            new_gerceklesen = st.text_input("Gerçekleşen Bakım Tarihi", value=gerceklesen if gerceklesen != 'nan' and gerceklesen != 'None' else "")
            st.caption("Örn: 25/03/2026")
            
        update_line = st.button("Hat Bilgilerini Kaydet")
        if update_line:
            conn = get_connection()
            conn.execute('UPDATE lines SET "SİPARİŞ NUMARASI"=?, "Planlanan Bakım Tarihi"=?, "Gerçekleşen Bakım Tarihi"=? WHERE "Sıra No"=?', (new_siparis, new_planlanan, new_gerceklesen, sira_no))
            conn.commit()
            conn.close()
            st.cache_data.clear() # Cache'i temizle ki tablo güncellensin
            st.success("Hat bilgileri başarıyla güncellendi!")
            st.rerun()

    st.info("Aşağıdan bu hat için yeni bir Asset ID (Tespit/Müdahale) kaydı girebilirsiniz.")
    
    if "entry_asset_id" not in st.session_state:
        st.session_state.entry_asset_id = ""
    if "entry_desc" not in st.session_state:
        st.session_state.entry_desc = ""
    if "entry_len" not in st.session_state:
        st.session_state.entry_len = ""

    col1, col2 = st.columns(2)
    with col1:
        asset_id = st.text_input("Asset ID (Direk/Tel Kodu) *", key="entry_asset_id")
        category = st.selectbox("İşlem Başlığı (Kategori) *", [
            "Ağaç Budama",
            "Güzergah Değişimi",
            "Beton Dökümü",
            "Koridor Açma",
            "Operasyon Müdahalesi"
        ])
        
    length_km = None
    with col2:
        status = st.selectbox("Durum *", ["Yapılmadı", "Yapıldı", "Bekliyor"], index=0)
        
        if category == "Koridor Açma":
            length_input = st.text_input("İhtiyaç Olunan Koridor Açma Uzunluğu (km) *", key="entry_len")
            st.caption("Örnek: 0,4 km = 400 m | 0,04 km = 40 metre (Lütfen virgül kullanın)")
            if length_input:
                try:
                    length_km = float(length_input.replace(',', '.'))
                except ValueError:
                    st.error("Lütfen geçerli bir sayı giriniz (Örn: 0,4)")
    
    description = st.text_area("Tespit / Açıklama", key="entry_desc")
                
    submitted = st.button("💾 Kaydet ve Yeni Ekle")
    
    if submitted:
        if not asset_id:
            st.error("Lütfen Asset ID giriniz!")
        elif category == "Koridor Açma" and length_km is None:
            st.error("Lütfen 'Koridor Açma' işlemi için geçerli bir kilometre (uzunluk) değeri giriniz!")
        else:
            conn = get_connection()
            conn.execute(
                "INSERT INTO interventions (sira_no, asset_id, category, description, status, length_km, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (sira_no, asset_id, category, description, status, length_km, username)
            )
            conn.commit()
            conn.close()
            st.session_state.clear_next = True
            st.success(f"Asset ID: {asset_id} başarıyla eklendi!")
            st.rerun()
            
    st.divider()
    st.subheader("Bu Hatta Ait Önceki Kayıtlar")
    history_df = load_interventions(sira_no)
    if not history_df.empty:
        for idx, row in history_df.iterrows():
            record_id = row['id']
            creator = row.get('created_by', 'bilinmeyen')
            flag = row.get('flag_request', None)
            
            with st.container():
                c1, c2, c3, c4 = st.columns([3,2,2,3])
                c1.write(f"**{row['asset_id']}** ({row['category']})")
                c2.write(f"Durum: {row['status']}")
                c3.caption(f"Giren: {creator}")
                
                # Sil / Talep Et butonları
                if user_role == 'admin' or creator == username:
                    if c4.button("🗑️ Sil", key=f"del_{record_id}"):
                        conn = get_connection()
                        conn.execute("DELETE FROM interventions WHERE id = ?", (record_id,))
                        conn.commit()
                        conn.close()
                        st.rerun()
                else:
                    is_flagged = pd.notna(flag) and str(flag).strip() not in ["", "None", "nan"]
                    if is_flagged:
                        c4.warning("⚠️ Talep İletildi")
                    else:
                        if c4.button("Değişiklik Talep Et", key=f"flag_{record_id}"):
                            st.session_state[f"show_flag_input_{record_id}"] = True

                if st.session_state.get(f"show_flag_input_{record_id}", False):
                    flag_reason = st.text_input("Gerekçe:", key=f"flag_reason_{record_id}")
                    if st.button("Gönder", key=f"send_flag_{record_id}"):
                        conn = get_connection()
                        conn.execute("UPDATE interventions SET flag_request = ? WHERE id = ?", (flag_reason, record_id))
                        conn.commit()
                        conn.close()
                        st.session_state[f"show_flag_input_{record_id}"] = False
                        st.rerun()
            st.markdown("---")
    else:
        st.write("Henüz kayıt bulunmuyor.")
    
    if st.button("Kapat"):
        st.rerun()

# Tabs
tab1, tab2, tab3 = st.tabs(["📋 Hat Listesi ve Veri Girişi", "📊 Genel Özet", "🔒 Admin Paneli"])

with tab1:    
    st.sidebar.markdown(f"**👤 Giriş Yapan:** {username} ({user_role})")
    
    st.sidebar.divider()
    
    df_lines = load_lines()
    if not df_lines.empty:
        # Sidebar filters
        st.sidebar.header("🔍 Hat Filtreleme")
        
        # İl Filter
        il_list = ["Tümü"] + sorted(df_lines['İl'].dropna().unique().tolist())
        default_il_idx = il_list.index(user_def_il) if user_def_il in il_list else 0
        selected_il = st.sidebar.selectbox("📍 İl Seçin", il_list, index=default_il_idx)
    
        df_filtered = df_lines[df_lines['İl'] == selected_il] if selected_il != "Tümü" else df_lines
        
        # İlçe Filter
        ilce_list = ["Tümü"] + sorted(df_filtered['İlçe'].dropna().unique().tolist())
        selected_ilce = st.sidebar.selectbox("📍 İlçe Seçin", ilce_list)
        df_filtered = df_filtered[df_filtered['İlçe'] == selected_ilce] if selected_ilce != "Tümü" else df_filtered
        
        # Operasyon Merkezi Filter
        op_list = sorted(df_filtered['Operasyon Merkezi'].dropna().unique().tolist())
        default_op_list = [op for op in user_def_oms if op in op_list]
        selected_op = st.sidebar.multiselect("🏢 Operasyon Merkezi (Çoklu Seçim)", op_list, default=default_op_list)
        if selected_op:
            df_filtered = df_filtered[df_filtered['Operasyon Merkezi'].isin(selected_op)]
            
        if st.sidebar.button("💾 Seçimimi Varsayılan Yap", help="Şu an seçtiğiniz İl ve OM'leri bir sonraki girişinizde otomatik yüklenmek üzere profilinize kaydeder."):
            save_oms = json.dumps(selected_op)
            conn = get_connection()
            conn.execute("UPDATE users SET default_il=?, default_oms=? WHERE username=?", (selected_il, save_oms, username))
            conn.commit()
            conn.close()
            # Update session state immediately
            st.session_state.logged_in_user['default_il'] = selected_il
            st.session_state.logged_in_user['default_oms'] = save_oms
            st.sidebar.success("Varsayılanlar kaydedildi!")

        search_query = st.text_input("🔍 Hat İsmi veya Operasyon Merkezi Ara", "")
        if search_query:
            mask = df_filtered['Hat İsmi'].str.contains(search_query, case=False, na=False) | \
                   df_filtered['Operasyon Merkezi'].str.contains(search_query, case=False, na=False)
            df_filtered = df_filtered[mask]
        
        with st.popover("💡"):
            st.info("İpucu: Soldaki menüden filtreleme yapın. Ardından aşağıdaki tabloda herhangi bir satıra **TIKLAYARAK** veri giriş penceresini açabilirsiniz.")
            
        st.write(f"Filtrelenen Hat Sayısı: **{len(df_filtered)}** (Ekranda en fazla 1000 satır gösterilir)")
        
        # --- DYNAMIC SUMMARY COLUMNS START ---
        df_filtered = df_filtered.copy()
        conn = get_connection()
        summary_df = pd.read_sql("SELECT sira_no, category, status FROM interventions", conn)
        conn.close()

        if not summary_df.empty:
            summary_df['sira_no'] = pd.to_numeric(summary_df['sira_no'], errors='coerce')
            categories = ["Ağaç Budama", "Güzergah Değişimi", "Beton Dökümü", "Koridor Açma", "Operasyon Müdahalesi"]
            
            for cat in categories:
                cat_df = summary_df[summary_df['category'] == cat]
                
                if not cat_df.empty:
                    status_counts = cat_df.groupby(['sira_no', 'status']).size().unstack(fill_value=0)
                    
                    yapilmadi_s = status_counts['Yapılmadı'] if 'Yapılmadı' in status_counts.columns else pd.Series(0, index=status_counts.index)
                    yapildi_s = status_counts['Yapıldı'] if 'Yapıldı' in status_counts.columns else pd.Series(0, index=status_counts.index)
                    
                    # Combine into a single string series
                    # Format: "X ok - Y nok" (if total > 0, else just "-")
                    yapilmadi_mapped = df_filtered['Sıra No'].map(yapilmadi_s).fillna(0).astype(int)
                    yapildi_mapped = df_filtered['Sıra No'].map(yapildi_s).fillna(0).astype(int)
                    
                    combined_str = []
                    for y_ok, y_nok in zip(yapildi_mapped, yapilmadi_mapped):
                        if y_ok == 0 and y_nok == 0:
                            combined_str.append("-")
                        else:
                            combined_str.append(f"{y_ok} ok - {y_nok} nok")
                            
                    df_filtered[cat] = combined_str
                else:
                    df_filtered[cat] = "-"
        else:
            categories = ["Ağaç Budama", "Güzergah Değişimi", "Beton Dökümü", "Koridor Açma", "Operasyon Müdahalesi"]
            for cat in categories:
                df_filtered[cat] = "-"
        # --- DYNAMIC SUMMARY COLUMNS END ---
        
        from io import StringIO
        display_df = df_filtered.head(1000).astype(str)
        # ⚠️ CRITICAL BUGFIX: Serialize to JSON and back to destroy all pandas C-level memory strides
        # This completely prevents PyArrow C++ segmentation faults on Apple Silicon
        json_str = display_df.to_json(orient='records')
        display_df = pd.read_json(StringIO(json_str), orient='records')
        for col in display_df.columns:
            display_df[col] = display_df[col].astype(str)
        
        st.write("👇 **Aşağıdaki tablodan işlem yapmak istediğiniz satırın herhangi bir yerine tıklayın:**")
        
        event = st.dataframe(
            display_df,
            on_select="rerun",
            selection_mode="single-row",
            use_container_width=True,
            hide_index=True
        )
        
        selected_rows = event.selection.rows
        
        if selected_rows:
            selected_idx = selected_rows[0]
            row_data = display_df.iloc[selected_idx]
            sira_no = int(row_data['Sıra No'])
            hat_ismi = str(row_data['Hat İsmi'])
            siparis = str(row_data.get('SİPARİŞ NUMARASI', ''))
            planlanan = str(row_data.get('Planlanan Bakım Tarihi', ''))
            gerceklesen = str(row_data.get('Gerçekleşen Bakım Tarihi', ''))
            il = str(row_data.get('İl', ''))
            
            open_data_entry_dialog(sira_no, hat_ismi, siparis, planlanan, gerceklesen, il)
                
        st.divider()
        st.info("Eğer geçmiş kayıtları görmek isterseniz bir satır seçmeniz yeterlidir.")
            
    else:
        st.warning("Veritabanında hat bulunamadı.")

with tab2:
    st.header("📊 Genel Özet (Filtreli)")
    
    df_lines_full = load_lines()
    all_interventions_raw = load_interventions()
    
    # Merge to get İl and Operasyon Merkezi for each intervention
    if not all_interventions_raw.empty and not df_lines_full.empty:
        all_interventions = pd.merge(
            all_interventions_raw, 
            df_lines_full[['Sıra No', 'İl', 'Operasyon Merkezi']], 
            left_on='sira_no', right_on='Sıra No', how='left'
        )
        all_interventions = all_interventions.astype(str)
    else:
        all_interventions = all_interventions_raw.copy()
        if not all_interventions.empty:
            all_interventions['İl'] = "Bilinmiyor"
            all_interventions['Operasyon Merkezi'] = "Bilinmiyor"

    # Filters
    t2_il_list = ["Tümü"] + sorted(df_lines_full['İl'].dropna().unique().tolist())
    t2_def_il_idx = t2_il_list.index(user_def_il) if user_def_il in t2_il_list else 0
    t2_selected_il = st.selectbox("📍 İl Seçin (Özet İçin)", t2_il_list, index=t2_def_il_idx, key="t2_il")
    
    t2_lines = df_lines_full[df_lines_full['İl'] == t2_selected_il] if t2_selected_il != "Tümü" else df_lines_full
    t2_op_list = sorted(t2_lines['Operasyon Merkezi'].dropna().unique().tolist())
    t2_default_op_list = [op for op in user_def_oms if op in t2_op_list]
    t2_selected_op = st.multiselect("🏢 Operasyon Merkezi (Çoklu Seçim)", t2_op_list, default=t2_default_op_list, key="t2_op")
    
    if t2_selected_op:
        t2_lines = t2_lines[t2_lines['Operasyon Merkezi'].isin(t2_selected_op)]
        
    if not all_interventions.empty:
        # Filter interventions
        if t2_selected_il != "Tümü":
            all_interventions = all_interventions[all_interventions['İl'] == t2_selected_il]
        if t2_selected_op:
            all_interventions = all_interventions[all_interventions['Operasyon Merkezi'].isin(t2_selected_op)]
    
    if not all_interventions.empty:
        col1, col2, col3 = st.columns(3)
        col1.metric("Toplam Girilen Tespit", len(all_interventions))
        yapilanlar = len(all_interventions[all_interventions['status'] == 'Yapıldı'])
        col2.metric("Tamamlanan (Yapıldı)", yapilanlar)
        col3.metric("Kalan/Bekleyen", len(all_interventions) - yapilanlar)
        
        st.divider()
        
        st.subheader("📏 Koridor Açma Özeti")
        toplam_hat_uzunlugu = pd.to_numeric(t2_lines['Hat Uzunluğu (Km)'], errors='coerce').sum()
        
        koridor_df = all_interventions[all_interventions['category'] == 'Koridor Açma']
        toplam_acilan_km = pd.to_numeric(koridor_df['length_km'], errors='coerce').sum() if not koridor_df.empty else 0.0
        
        kc1, kc2 = st.columns(2)
        kc1.metric("Filtrelenen Hatların Toplam Uzunluğu", f"{toplam_hat_uzunlugu:,.2f} km")
        kc2.metric("Saha Verisi (Açılan Toplam Koridor)", f"{toplam_acilan_km:,.2f} km")
        
        st.divider()
        
        st.subheader("Kategori Bazlı Tespitler")
        category_counts = all_interventions['category'].value_counts()
        st.bar_chart(category_counts)
        
        st.divider()
        st.subheader("Tüm Tespit Dökümü")
        st.write("👇 Tablodan bir kayıt seçerek hemen altından Düzenleme veya Silme işlemi yapabilirsiniz.")
        
        from io import StringIO
        all_interventions_str = all_interventions.astype(str)
        json_str_all = all_interventions_str.to_json(orient='records')
        all_interventions_str = pd.read_json(StringIO(json_str_all), orient='records')
        for col in all_interventions_str.columns:
            all_interventions_str[col] = all_interventions_str[col].astype(str)
            
        event_all = st.dataframe(
            all_interventions_str,
            on_select="rerun",
            selection_mode="single-row",
            use_container_width=True,
            hide_index=True
        )
        
        selected_rows_all = event_all.selection.rows
        if selected_rows_all:
            row_idx = selected_rows_all[0]
            row_all = all_interventions.iloc[row_idx]
            
            if row_all is not None:
                r_id = int(row_all['id'])
                r_creator = str(row_all.get('created_by', 'bilinmeyen'))
                
                st.markdown(f"**Seçili Kayıt:** Asset ID {row_all['asset_id']} - {row_all['category']} (Giren: {r_creator})")
                
                if user_role == 'admin':
                    c1, c2, c3 = st.columns([1,1,4])
                    if c1.button("✏️ Düzenle", key=f"edit_all_{r_id}"):
                        st.session_state[f"show_edit_all_{r_id}"] = not st.session_state.get(f"show_edit_all_{r_id}", False)
                    if c2.button("🗑️ Sil", key=f"del_all_{r_id}"):
                        conn = get_connection()
                        conn.execute("DELETE FROM interventions WHERE id = ?", (r_id,))
                        conn.commit()
                        conn.close()
                        st.rerun()
                        
                    if st.session_state.get(f"show_edit_all_{r_id}", False):
                        with st.form(f"edit_form_all_{r_id}"):
                            e_asset = st.text_input("Asset ID", value=str(row_all.get('asset_id', '')))
                            cats = ["Ağaç Budama", "Güzergah Değişimi", "Beton Dökümü", "Koridor Açma", "Operasyon Müdahalesi"]
                            cat_val = str(row_all.get('category', ''))
                            e_cat = st.selectbox("Kategori", cats, index=cats.index(cat_val) if cat_val in cats else 0)
                            stats = ["Yapılmadı", "Yapıldı", "Bekliyor"]
                            stat_val = str(row_all.get('status', ''))
                            e_status = st.selectbox("Durum", stats, index=stats.index(stat_val) if stat_val in stats else 0)
                            
                            e_len = str(row_all.get('length_km', ''))
                            if e_cat == "Koridor Açma":
                                e_len_input = st.text_input("Uzunluk (km)", value=e_len if e_len != "nan" else "")
                            
                            desc_val = str(row_all.get('description', ''))
                            e_desc = st.text_area("Açıklama", value=desc_val if desc_val != "nan" else "")
                            
                            if st.form_submit_button("Değişiklikleri Kaydet"):
                                final_len = None
                                if e_cat == "Koridor Açma":
                                    try:
                                        final_len = float(e_len_input.replace(',', '.'))
                                    except:
                                        st.error("Geçerli bir km giriniz.")
                                        st.stop()
                                        
                                conn = get_connection()
                                conn.execute("""
                                    UPDATE interventions 
                                    SET asset_id=?, category=?, status=?, length_km=?, description=?, flag_request=NULL 
                                    WHERE id=?
                                """, (e_asset, e_cat, e_status, final_len, e_desc, r_id))
                                conn.commit()
                                conn.close()
                                st.session_state[f"show_edit_all_{r_id}"] = False
                                st.success("Kayıt güncellendi!")
                                st.rerun()
                elif r_creator == username:
                    c1, c2, c3 = st.columns([1,1,4])
                    if c1.button("✏️ Düzenleme Talebi", key=f"edit_req_{r_id}"):
                        st.session_state[f"show_edit_all_{r_id}"] = not st.session_state.get(f"show_edit_all_{r_id}", False)
                    if c2.button("🗑️ Silme Talebi", key=f"del_req_{r_id}"):
                        conn = get_connection()
                        conn.execute("INSERT INTO requests (intervention_id, request_type, requested_by) VALUES (?, ?, ?)", (r_id, 'DELETE', username))
                        conn.commit()
                        conn.close()
                        st.success("Silme talebiniz Admin onayına gönderildi.")
                        
                    if st.session_state.get(f"show_edit_all_{r_id}", False):
                        with st.form(f"edit_form_all_{r_id}"):
                            e_asset = st.text_input("Asset ID", value=str(row_all.get('asset_id', '')))
                            cats = ["Ağaç Budama", "Güzergah Değişimi", "Beton Dökümü", "Koridor Açma", "Operasyon Müdahalesi"]
                            cat_val = str(row_all.get('category', ''))
                            e_cat = st.selectbox("Kategori", cats, index=cats.index(cat_val) if cat_val in cats else 0)
                            stats = ["Yapılmadı", "Yapıldı", "Bekliyor"]
                            stat_val = str(row_all.get('status', ''))
                            e_status = st.selectbox("Durum", stats, index=stats.index(stat_val) if stat_val in stats else 0)
                            
                            e_len = str(row_all.get('length_km', ''))
                            if e_cat == "Koridor Açma":
                                e_len_input = st.text_input("Uzunluk (km)", value=e_len if e_len != "nan" else "")
                            
                            desc_val = str(row_all.get('description', ''))
                            e_desc = st.text_area("Açıklama", value=desc_val if desc_val != "nan" else "")
                            
                            if st.form_submit_button("Talebi Gönder"):
                                final_len = None
                                if e_cat == "Koridor Açma":
                                    try:
                                        final_len = float(e_len_input.replace(',', '.'))
                                    except:
                                        st.error("Geçerli bir km giriniz.")
                                        st.stop()
                                
                                new_data_dict = {
                                    "asset_id": e_asset,
                                    "category": e_cat,
                                    "status": e_status,
                                    "length_km": final_len,
                                    "description": e_desc
                                }
                                new_data_json = json.dumps(new_data_dict)
                                
                                conn = get_connection()
                                conn.execute("INSERT INTO requests (intervention_id, request_type, new_data, requested_by) VALUES (?, ?, ?, ?)", (r_id, 'EDIT', new_data_json, username))
                                conn.commit()
                                conn.close()
                                st.session_state[f"show_edit_all_{r_id}"] = False
                                st.success("Düzenleme talebiniz Admin onayına gönderildi.")
                else:
                    st.info("Bu kayıt başkası tarafından girildiği için silemez veya düzenleyemezsiniz.")
        
        st.divider()
        st.subheader("📥 Raporları Excel'e Aktar")
        st.write("Veritabanına girilen tüm verileri iki farklı formatta Excel olarak indirebilirsiniz:")
    
        detail_data, summary_data = generate_excel_reports(all_interventions)
        
        c1, c2 = st.columns(2)
        with c1:
            st.download_button("1️⃣ Detaylı Raporu İndir (Asset ID Bazlı)", detail_data, file_name="detayli_tespitler.xlsx", mime="application/vnd.ms-excel", type="primary")
        with c2:
            st.download_button("2️⃣ Özet Raporu İndir (Sıra No Bazlı Toplamlar)", summary_data, file_name="ozet_tespitler.xlsx", mime="application/vnd.ms-excel", type="primary")
        
    else:
        st.info("Henüz sisteme girilmiş bir tespit bulunmuyor.")

with tab3:
    if user_role != 'admin':
        st.error("Bu sekmeyi görüntüleme yetkiniz yok.")
    else:
        st.header("🔒 Admin Paneli")
        
        st.subheader("1. Kullanıcı Yönetimi")
        ad1, ad2 = st.columns(2)
        with ad1:
            with st.form("new_user_form", clear_on_submit=True):
                st.write("**Yeni Kullanıcı Ekle**")
                new_u = st.text_input("Kullanıcı Adı")
                new_p = st.text_input("Şifre", type="password")
                new_r = st.selectbox("Rol", ["user", "admin"])
                if st.form_submit_button("Kullanıcı Ekle"):
                    if new_u and new_p:
                        conn = get_connection()
                        try:
                            conn.execute("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", (new_u, hash_password(new_p), new_r))
                            conn.commit()
                            st.success(f"Kullanıcı {new_u} eklendi!")
                        except sqlite3.IntegrityError:
                            st.error("Bu kullanıcı adı zaten mevcut!")
                        conn.close()
        with ad2:
            with st.form("update_pwd_form", clear_on_submit=True):
                st.write("**Kullanıcı Şifresi Değiştir**")
                upd_u = st.text_input("Mevcut Kullanıcı Adı")
                upd_p = st.text_input("Yeni Şifre", type="password")
                if st.form_submit_button("Şifreyi Güncelle"):
                    if upd_u and upd_p:
                        conn = get_connection()
                        cursor = conn.cursor()
                        cursor.execute("SELECT username FROM users WHERE username = ?", (upd_u,))
                        if cursor.fetchone():
                            conn.execute("UPDATE users SET password_hash = ? WHERE username = ?", (hash_password(upd_p), upd_u))
                            conn.commit()
                            st.success(f"{upd_u} kullanıcısının şifresi güncellendi!")
                        else:
                            st.error("Kullanıcı bulunamadı!")
                        conn.close()
                        
        st.divider()
        st.subheader("2. Onay Bekleyen Silme / Değişiklik Talepleri")
        conn = get_connection()
        
        query = """
            SELECT r.id as req_id, r.request_type, r.new_data, r.requested_by, r.created_at,
                   i.id as intervention_id, i.asset_id, i.category, i.status, i.length_km, i.description
            FROM requests r
            JOIN interventions i ON r.intervention_id = i.id
            WHERE r.status = 'PENDING'
        """
        reqs_df = pd.read_sql(query, conn)
        conn.close()
        
        if not reqs_df.empty:
            for idx, row in reqs_df.iterrows():
                req_id = row['req_id']
                req_type = row['request_type']
                int_id = row['intervention_id']
                
                with st.container():
                    st.markdown(f"**Talep ID:** {req_id} | **Kullanıcı:** {row['requested_by']} | **İşlem Tipi:** {'🗑️ Silme' if req_type == 'DELETE' else '✏️ Düzenleme'}")
                    
                    if req_type == 'DELETE':
                        st.info(f"Kullanıcı {row['requested_by']}, Asset ID **{row['asset_id']}** olan kaydı (Kategori: {row['category']}) silmek istiyor.")
                    elif req_type == 'EDIT':
                        st.info(f"Kullanıcı {row['requested_by']}, Asset ID **{row['asset_id']}** olan kaydı düzenlemek istiyor.")
                        
                        try:
                            new_data = json.loads(row['new_data'])
                            st.write("Değişiklik Detayları:")
                            
                            comp_col1, comp_col2 = st.columns(2)
                            with comp_col1:
                                st.markdown("🔴 **Eski Veri**")
                                st.write(f"- Asset ID: {row['asset_id']}")
                                st.write(f"- Kategori: {row['category']}")
                                st.write(f"- Durum: {row['status']}")
                                st.write(f"- Uzunluk: {row['length_km']}")
                                st.write(f"- Açıklama: {row['description']}")
                                
                            with comp_col2:
                                st.markdown("🟢 **Yeni Veri**")
                                st.write(f"- Asset ID: {new_data.get('asset_id')}")
                                st.write(f"- Kategori: {new_data.get('category')}")
                                st.write(f"- Durum: {new_data.get('status')}")
                                st.write(f"- Uzunluk: {new_data.get('length_km')}")
                                st.write(f"- Açıklama: {new_data.get('description')}")
                                
                        except Exception as e:
                            st.error("Düzenleme verisi okunamadı.")
                    
                    c_app, c_rej, _ = st.columns([1, 1, 4])
                    if c_app.button("✅ Onayla", key=f"app_req_{req_id}", type="primary"):
                        conn = get_connection()
                        if req_type == 'DELETE':
                            conn.execute("DELETE FROM interventions WHERE id = ?", (int_id,))
                        elif req_type == 'EDIT':
                            try:
                                nd = json.loads(row['new_data'])
                                conn.execute("""
                                    UPDATE interventions 
                                    SET asset_id=?, category=?, status=?, length_km=?, description=?
                                    WHERE id=?
                                """, (nd.get('asset_id'), nd.get('category'), nd.get('status'), nd.get('length_km'), nd.get('description'), int_id))
                            except:
                                pass
                        
                        conn.execute("UPDATE requests SET status = 'APPROVED' WHERE id = ?", (req_id,))
                        conn.commit()
                        conn.close()
                        st.success("Talep onaylandı ve değişiklik uygulandı.")
                        st.rerun()
                        
                    if c_rej.button("❌ Reddet", key=f"rej_req_{req_id}"):
                        conn = get_connection()
                        conn.execute("UPDATE requests SET status = 'REJECTED' WHERE id = ?", (req_id,))
                        conn.commit()
                        conn.close()
                        st.warning("Talep reddedildi.")
                        st.rerun()
                        
                st.markdown("---")
        else:
            st.info("Bekleyen herhangi bir silme/değişiklik talebi yok.")
            
        st.divider()
        st.subheader("3. Kullanıcı Performansları (Girilen Kayıt Sayısı)")
        if not all_interventions.empty:
            perf = all_interventions['created_by'].value_counts().reset_index()
            perf.columns = ['Kullanıcı Adı', 'Girilen Kayıt Sayısı']
            perf_str = perf.to_json(orient='records')
            perf = pd.read_json(StringIO(perf_str), orient='records')
            st.dataframe(perf, use_container_width=True)
        else:
            st.info("Sistemde hiç kayıt yok.")
