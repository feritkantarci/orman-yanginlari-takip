import re

with open('main.py', 'r') as f:
    content = f.read()

old_ihale = """        def get_ihale(cat: str):
            if cat == "Ağaç Budama" and ihale_budama == "VAR": return "VAR"
            if cat == "Koridor Açma" and ihale_koridor == "VAR": return "VAR"
            has_ihale = any(i for i in line_invs if i.category and i.category.strip() == cat and i.status and i.status.strip().lower() == "yapılacak" and i.intervention_unit and "MÜTEAHHİT" in i.intervention_unit.upper())
            return "VAR" if has_ihale else "YOK\"\"\"
"""

# Actually, I'll just use re.sub since it's easier to match.
def replace_ihale(match):
    return """        def get_ihale(cat: str):
            if cat == "Ağaç Budama" and ihale_budama == "VAR": return "VAR"
            if cat == "Koridor Açma" and ihale_koridor == "VAR": return "VAR"
            has_ihale = False
            for i in line_invs:
                if i.category and i.category.strip() == cat and i.status:
                    overall = get_overall_intervention_status(i.status).lower()
                    if overall in ["yapılmadı", "bekliyor"] and i.intervention_unit and "MÜTEAHHİT" in i.intervention_unit.upper():
                        has_ihale = True
                        break
            return "VAR" if has_ihale else "YOK\"\"\"
"""

# Let's just do it directly.
new_ihale = """        def get_ihale(cat: str):
            if cat == "Ağaç Budama" and ihale_budama == "VAR": return "VAR"
            if cat == "Koridor Açma" and ihale_koridor == "VAR": return "VAR"
            has_ihale = False
            for i in line_invs:
                if i.category and i.category.strip() == cat and i.status:
                    overall = get_overall_intervention_status(i.status).lower()
                    if overall in ["yapılmadı", "bekliyor"] and i.intervention_unit and "MÜTEAHHİT" in i.intervention_unit.upper():
                        has_ihale = True
                        break
            return "VAR" if has_ihale else "YOK\"\"\"
"""

# ... wait, I shouldn't write a python script with triple quotes inside triple quotes blindly.
