import re

with open('main.py', 'r') as f:
    content = f.read()

old_func = """        def get_stat(cat: str, st: str):
            total = 0.0
            for i in line_invs:
                if i.category and i.category.strip() == cat and i.status and get_overall_intervention_status(i.status).lower() == st.lower():
                    qty = float(i.quantity or 1) if cat != "Koridor Açma" else float(i.length_km or 0)
                    total += qty
            return total if total > 0 else 0"""

new_func = """        def get_stat(cat: str, st: str):
            total = 0.0
            for i in line_invs:
                if i.category and i.category.strip() == cat and i.status:
                    overall = get_overall_intervention_status(i.status).lower()
                    
                    match = False
                    if st.lower() == "yapıldı" and overall == "yapıldı":
                        match = True
                    elif st.lower() == "yapılacak" and overall in ["yapılmadı", "bekliyor"]:
                        match = True
                        
                    if match:
                        qty = float(i.quantity or 1) if cat != "Koridor Açma" else float(i.length_km or 0)
                        total += qty
            return total if total > 0 else 0"""

content = content.replace(old_func, new_func)

with open('main.py', 'w') as f:
    f.write(content)
print("Replaced!")
