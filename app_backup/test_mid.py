import streamlit as st
import pandas as pd
import sqlite3
import os
import json
from st_aggrid import AgGrid, GridOptionsBuilder, GridUpdateMode
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
@st.dialog("Tespit/Müdahale Girişi (Bire-Çok Kayıt)", width="large")
def open_data_entry_dialog(sira_no, hat_ismi, siparis="", planlanan="", gerceklesen=""):
    st.markdown(f"**Hat İsmi:** {hat_ismi} (Sıra No: {sira_no})")
    
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
            st.session_state.entry_asset_id = ""
            st.session_state.entry_desc = ""
            st.session_state.entry_len = ""
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
    st.markdown("### Veri girişi yapmak istediğiniz satırı (Sıra No) seçin:")
    
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
        
        st.info("💡 İpucu: Soldaki menüden filtreleme yapın. Ardından aşağıdaki tabloda herhangi bir satıra **TIKLAYARAK** veri giriş penceresini açabilirsiniz.")
        st.write(f"Filtrelenen Hat Sayısı: **{len(df_filtered)}** (Ekranda en fazla 1000 satır gösterilir)")
        
        # We use AgGrid for a rock-solid, crash-proof interactive table with row selection
        display_df = df_filtered.head(1000)
        
        st.write("👇 **Aşağıdaki tablodan işlem yapmak istediğiniz satırın herhangi bir yerine tıklayın:**")
        
        gb = GridOptionsBuilder.from_dataframe(display_df)
        # Checkbox'ı kaldırıyoruz. Satırın herhangi bir yerine tıklamak seçecektir.
        gb.configure_selection(selection_mode="single", use_checkbox=False)
        gridOptions = gb.build()

        grid_response = AgGrid(
            display_df.astype(str), 
            gridOptions=gridOptions, 
            update_mode=GridUpdateMode.SELECTION_CHANGED,
            height=450,
            theme='streamlit'
        )
        
        selected_rows = grid_response['selected_rows']
        
        if selected_rows is not None:
            if isinstance(selected_rows, pd.DataFrame) and not selected_rows.empty:
                sira_no = int(selected_rows.iloc[0]['Sıra No'])
                hat_ismi = str(selected_rows.iloc[0]['Hat İsmi'])
                siparis = str(selected_rows.iloc[0]['SİPARİŞ NUMARASI'])
                planlanan = str(selected_rows.iloc[0]['Planlanan Bakım Tarihi'])
                gerceklesen = str(selected_rows.iloc[0]['Gerçekleşen Bakım Tarihi'])
                open_data_entry_dialog(sira_no, hat_ismi, siparis, planlanan, gerceklesen)
            elif isinstance(selected_rows, list) and len(selected_rows) > 0:
                sira_no = int(selected_rows[0]['Sıra No'])
                hat_ismi = str(selected_rows[0]['Hat İsmi'])
                siparis = str(selected_rows[0].get('SİPARİŞ NUMARASI', ''))
                planlanan = str(selected_rows[0].get('Planlanan Bakım Tarihi', ''))
                gerceklesen = str(selected_rows[0].get('Gerçekleşen Bakım Tarihi', ''))
                open_data_entry_dialog(sira_no, hat_ismi, siparis, planlanan, gerceklesen)
                
        st.divider()
        st.info("Eğer geçmiş kayıtları görmek isterseniz bir satır seçmeniz yeterlidir.")
            
    else:
        st.warning("Veritabanında hat bulunamadı.")

# Restore the disabled dialog block
@st.dialog("Tespit Düzenle/Sil")
def open_t2_edit_dialog(r_id, r_creator, r_asset, r_cat, r_stat, r_len, r_desc):
    st.markdown(f"**Seçili Kayıt:** Asset ID {r_asset} - {r_cat} (Giren: {r_creator})")
    
    if user_role == 'admin' or r_creator == username:
        c1, c2 = st.columns(2)
        if c1.button("🗑️ Kaydı Sil", type="primary"):
            conn = get_connection()
            conn.execute("DELETE FROM interventions WHERE id = ?", (r_id,))
            conn.commit()
            conn.close()
            st.rerun()
            
        st.divider()
        with st.form(f"edit_form_t2_{r_id}"):
            st.subheader("Kaydı Düzenle")
            e_asset = st.text_input("Asset ID", value=r_asset)
            cats = ["Ağaç Budama", "Güzergah Değişimi", "Beton Dökümü", "Koridor Açma", "Operasyon Müdahalesi"]
            e_cat = st.selectbox("Kategori", cats, index=cats.index(r_cat) if r_cat in cats else 0)
            stats = ["Yapılmadı", "Yapıldı", "Bekliyor"]
            e_status = st.selectbox("Durum", stats, index=stats.index(r_stat) if r_stat in stats else 0)
            
            e_len_input = ""
            if e_cat == "Koridor Açma":
                e_len_input = st.text_input("Uzunluk (km)", value=r_len if str(r_len) != "nan" else "")
            
            e_desc = st.text_area("Açıklama", value=r_desc if str(r_desc) != "nan" else "")
            
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
                st.success("Kayıt güncellendi!")
                st.rerun()
    else:
        st.warning("Bu kaydı doğrudan düzenleme yetkiniz yok (Sadece yöneticiler ve kendi kayıtlarınız).")
        
        st.markdown("### Değişiklik / Silinme Talebi İlet")
        with st.form(f"t2_flag_form_{r_id}"):
            f_reason = st.text_area("Talebinizi ve gerekçesini yazın (Örn: Bu kayıt silinmeli çünkü...)")
            if st.form_submit_button("Talebi Gönder"):
                if not f_reason.strip():
                    st.error("Lütfen bir gerekçe yazın.")
                else:
                    conn = get_connection()
                    conn.execute("UPDATE interventions SET flag_request = ? WHERE id = ?", (f_reason, r_id))
                    conn.commit()
                    conn.close()
                    st.success("Talebiniz yöneticiye iletildi!")
                    st.rerun()

with tab2:
    st.header("📊 Genel Özet (Filtreli)")
    
    df_lines_full = load_lines()
    all_interventions_raw = load_interventions()
    
    # Merge to get İl and Operasyon Merkezi for each intervention
    if not all_interventions_raw.empty and not df_lines_full.empty:
        all_interventions = pd.merge(
            all_interventions_raw, 
            df_lines_full[['Sıra No', 'İl', 'Operasyon Merkezi']].rename(columns={'Sıra No': 'sira_no'}), 
            on='sira_no', 
            how='left'
        )
        # CRITICAL FIX for macOS PyArrow segmentation faults:
        # Excel data often contains mixed types in columns (e.g. some ints, some strings).
        # PyArrow crashes the C-extension when trying to serialize object columns with mixed types.
        # We must cast the entire dataframe to string BEFORE passing it to AgGrid or GridOptionsBuilder.
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
        
        gb_all = GridOptionsBuilder.from_dataframe(all_interventions)
        gb_all.configure_selection(selection_mode="single", use_checkbox=False)
        gridOptions_all = gb_all.build()

        grid_resp_all = AgGrid(
            all_interventions.astype(str), 
            gridOptions=gridOptions_all, 
            update_mode=GridUpdateMode.SELECTION_CHANGED,
            height=400,
            theme='streamlit',
            key='all_interventions_grid'
        )
        
        sel_all = grid_resp_all['selected_rows']
        if sel_all is not None:
            if isinstance(sel_all, pd.DataFrame) and not sel_all.empty:
                row_all = sel_all.iloc[0]
            elif isinstance(sel_all, list) and len(sel_all) > 0:
                row_all = sel_all[0]
            else:
                row_all = None
                
            if row_all is not None:
                r_id = int(row_all['id'])
                
                # Prevent dialog from reopening constantly by tracking the last clicked ID
                if st.session_state.get('last_t2_opened_id') != r_id:
                    st.session_state.last_t2_opened_id = r_id
                    st.rerun()
                
                r_creator = str(row_all.get('created_by', 'bilinmeyen'))
                r_asset = str(row_all.get('asset_id', ''))
                r_cat = str(row_all.get('category', ''))
                r_stat = str(row_all.get('status', ''))
                r_len = str(row_all.get('length_km', ''))
                r_desc = str(row_all.get('description', ''))
                
                open_t2_edit_dialog(r_id, r_creator, r_asset, r_cat, r_stat, r_len, r_desc)
        
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
        st.subheader("2. Silinme / Değişiklik Talepleri")
        conn = get_connection()
        flagged = pd.read_sql("SELECT id, created_by, asset_id, category, flag_request, status, length_km, description FROM interventions WHERE flag_request IS NOT NULL", conn)
        conn.close()
        
        if not flagged.empty:
            for idx, row in flagged.iterrows():
                rec_id = row['id']
                with st.container():
                    fc1, fc2, fc3, fc4, fc5 = st.columns([2, 3, 2, 1, 1])
                    fc1.write(f"**Asset:** {row['asset_id']}")
                    fc2.write(f"**Talep:** {row['flag_request']}")
                    fc3.caption(f"Sahibi: {row['created_by']}")
                    
                    if fc4.button("Düzenle", key=f"admin_edit_btn_{rec_id}"):
                        st.session_state[f"admin_edit_{rec_id}"] = not st.session_state.get(f"admin_edit_{rec_id}", False)
                        
                    if fc5.button("🗑️ Sil", key=f"admin_del_{rec_id}"):
                        conn = get_connection()
                        conn.execute("DELETE FROM interventions WHERE id = ?", (rec_id,))
                        conn.commit()
                        conn.close()
                        st.rerun()

                if st.session_state.get(f"admin_edit_{rec_id}", False):
                    with st.form(f"edit_form_{rec_id}"):
                        st.write("Kaydı Düzenle")
                        e_asset = st.text_input("Asset ID", value=str(row['asset_id']))
                        e_cat = st.selectbox("Kategori", 
                            ["Ağaç Budama", "Güzergah Değişimi", "Beton Dökümü", "Koridor Açma", "Operasyon Müdahalesi"],
                            index=["Ağaç Budama", "Güzergah Değişimi", "Beton Dökümü", "Koridor Açma", "Operasyon Müdahalesi"].index(row['category']) if row['category'] in ["Ağaç Budama", "Güzergah Değişimi", "Beton Dökümü", "Koridor Açma", "Operasyon Müdahalesi"] else 0
                        )
                        e_status = st.selectbox("Durum", ["Yapılmadı", "Yapıldı", "Bekliyor"], 
                            index=["Yapılmadı", "Yapıldı", "Bekliyor"].index(row['status']) if row['status'] in ["Yapılmadı", "Yapıldı", "Bekliyor"] else 0
                        )
                        
                        e_len = row['length_km']
                        if e_cat == "Koridor Açma":
                            e_len_input = st.text_input("Uzunluk (km)", value=str(e_len) if pd.notna(e_len) else "")
                        
                        e_desc = st.text_area("Açıklama", value=str(row['description']) if pd.notna(row['description']) else "")
                        
                        if st.form_submit_button("Değişiklikleri Kaydet (Talebi Kapat)"):
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
                            """, (e_asset, e_cat, e_status, final_len, e_desc, rec_id))
                            conn.commit()
                            conn.close()
                            st.session_state[f"admin_edit_{rec_id}"] = False
                            st.success("Kayıt güncellendi!")
                            st.rerun()
                st.markdown("---")
        else:
            st.info("Bekleyen herhangi bir silme/değişiklik talebi yok.")
            
        st.divider()
        st.subheader("3. Kullanıcı Performansları (Girilen Kayıt Sayısı)")
        if not all_interventions.empty:
            perf = all_interventions['created_by'].value_counts().reset_index()
            perf.columns = ['Kullanıcı Adı', 'Girilen Kayıt Sayısı']
            st.dataframe(perf, use_container_width=True)
        else:
            st.info("Sistemde hiç kayıt yok.")
