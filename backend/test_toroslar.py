import pandas as pd
excel_path = 'Kopya Ormanlık Alan Bakım Takip - Toroslar.xlsx'
df = pd.read_excel(excel_path, header=2)
print("Columns:", list(df.columns))
print("First row Sira No:", df.iloc[0]['Sıra No'])
print("First row Hat İsmi:", df.iloc[0].get('Hat İsmi', 'N/A'))
